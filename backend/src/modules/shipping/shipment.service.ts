import { Types } from 'mongoose';
import { AppError, duplicateKeyFields, isDuplicateKeyError } from '../../common/errors';
import { logger } from '../../config/logger';
import { notifyOrder } from '../notifications/notify';
import { Order, type OrderLean } from '../orders/order.model';
import { SYSTEM_ACTOR, transitionOrder } from '../orders/order.service';
import { canTransition, type OrderStatus, type ShipmentStatus } from '../orders/orderStatus';
import { resolveServiceArea } from '../serviceAreas/serviceArea.service';
import { getCouriers } from './config';
import { Shipment, type IShipmentEvent, type ShipmentLean } from './shipment.model';
import { TERMINAL_SHIPMENT, isForward, latestStatus } from './statusMap';
import {
  CourierRejected,
  CourierUncertain,
  type BookingInput,
  type CourierId,
  type CourierProvider,
  type ShipmentCourier,
} from './types';

const BOOKABLE: OrderStatus[] = ['confirmed', 'processing', 'packed', 'ready_for_dispatch'];
const FORWARD: OrderStatus[] = ['confirmed', 'processing', 'packed', 'ready_for_dispatch', 'shipped'];

const provider = (id: CourierId): CourierProvider | undefined => getCouriers()[id];

/** TCS is the default; Leopards is offered where TCS does not serve the city (SRS 8.6). Null when no courier is confirmed. */
export async function suggestCourier(order: Pick<OrderLean, 'shippingAddress'>): Promise<CourierId | null> {
  const area = await resolveServiceArea(order.shippingAddress.city, order.shippingAddress.province);
  if (area?.couriers.tcs) return 'tcs';
  if (area?.couriers.leopards) return 'leopards';
  return null;
}

export const courierStatus = () => ({ tcs: !!getCouriers().tcs, leopards: !!getCouriers().leopards });

const bookingInput = (
  order: OrderLean,
  codAmount: number,
  extra: { weightKg: number; pieces: number; remarks?: string },
): BookingInput => ({
  orderNumber: order.orderNumber,
  recipientName: order.shippingAddress.recipientName,
  phone: order.shippingAddress.phone,
  email: order.customer.email,
  province: order.shippingAddress.province,
  city: order.shippingAddress.city,
  area: order.shippingAddress.area,
  address: order.shippingAddress.line1,
  postalCode: order.shippingAddress.postalCode,
  codAmount,
  weightKg: extra.weightKg,
  pieces: extra.pieces,
  remarks: extra.remarks ?? order.shippingAddress.notes,
  items: order.items.map((i) => ({ name: i.name, quantity: i.quantity, unitPrice: i.unitPrice })),
});

export interface BookRequest {
  courier?: ShipmentCourier;
  weightKg?: number;
  pieces?: number;
  remarks?: string;
  /** Manual booking only: the consignment number the staff member got from the courier. */
  trackingNumber?: string;
}

export async function bookShipment(
  orderId: string,
  req: BookRequest,
  actor: { id: string; role: string },
): Promise<ShipmentLean> {
  const order = await Order.findById(orderId).lean<OrderLean>();
  if (!order) throw new AppError(404, 'NOT_FOUND', 'Order not found.');
  if (!BOOKABLE.includes(order.status)) {
    throw new AppError(
      409,
      'CONFLICT',
      `Only confirmed orders can be booked with a courier (this one is "${order.status}").`,
    );
  }
  const courier = req.courier ?? (await suggestCourier(order));
  if (!courier)
    throw new AppError(400, 'BAD_REQUEST', 'No courier is confirmed for this city. Choose a courier or book manually.');
  if (courier === 'manual' && !req.trackingNumber)
    throw new AppError(400, 'VALIDATION_ERROR', 'Some fields are invalid.', [
      { field: 'body.trackingNumber', message: 'Enter the consignment number for a manual booking.' },
    ]);
  const api = courier === 'manual' ? undefined : provider(courier);
  if (courier !== 'manual' && !api) {
    throw new AppError(
      400,
      'COURIER_UNAVAILABLE',
      `${courier.toUpperCase()} is not configured. Book it manually instead.`,
    );
  }

  const codAmount = order.paymentMethod === 'cod' ? (order.cod?.amountDue ?? order.total) : 0;
  const weightKg = req.weightKg ?? 0.5;
  const pieces = req.pieces ?? 1;

  // Claim the order's single shipment slot BEFORE talking to the courier. If anyone else is booking (or has booked) this
  // order, the unique index rejects this insert and the courier is never called, so a parcel cannot be booked twice.
  let shipment;
  try {
    shipment = await Shipment.create({
      orderId: order._id,
      orderNumber: order.orderNumber,
      courier,
      mode: courier === 'manual' ? 'manual' : 'api',
      status: 'booking_pending',
      codAmount,
      weightKg,
      pieces,
      createdBy: new Types.ObjectId(actor.id),
    });
  } catch (err) {
    if (isDuplicateKeyError(err) && duplicateKeyFields(err).includes('orderId')) {
      throw new AppError(
        409,
        'CONFLICT',
        'This order already has an active shipment. Cancel it first if you need to rebook.',
      );
    }
    throw err;
  }

  const event = (description: string, source: IShipmentEvent['source']): IShipmentEvent => ({
    at: new Date(),
    description,
    source,
    status: null,
  });

  if (!api) {
    const done = await Shipment.findByIdAndUpdate(
      shipment._id,
      {
        $set: { trackingNumber: req.trackingNumber, status: 'booked' },
        $push: { events: event('Booked manually by staff', 'staff') },
      },
      { new: true },
    ).lean<ShipmentLean>();
    await Order.updateOne({ _id: order._id }, { $set: { shipmentStatus: 'booked' } });
    notifyOrder('dispatched', order._id);
    return done!;
  }

  try {
    const { trackingNumber } = await api.book(
      bookingInput(order, codAmount, { weightKg, pieces, remarks: req.remarks }),
    );
    const done = await Shipment.findByIdAndUpdate(
      shipment._id,
      {
        $set: { trackingNumber, status: 'booked' },
        $push: { events: event(`Booked with ${courier.toUpperCase()}`, 'system') },
      },
      { new: true },
    ).lean<ShipmentLean>();
    await Order.updateOne({ _id: order._id }, { $set: { shipmentStatus: 'booked' } });
    notifyOrder('dispatched', order._id);
    return done!;
  } catch (err) {
    if (err instanceof CourierRejected) {
      // A definite "no": free the slot so staff can fix the problem, or choose the other courier, and try again.
      await Shipment.updateOne(
        { _id: shipment._id },
        { $set: { active: false, status: 'cancelled', bookingError: err.message.slice(0, 500) } },
      );
      throw new AppError(422, 'COURIER_REJECTED', err.message);
    }
    // Unknown outcome: the courier may have created the booking. Keep the slot so nobody books it a second time.
    const message = err instanceof CourierUncertain ? err.message : 'Unexpected error while booking';
    logger.error({ err, order: order.orderNumber, courier }, 'courier booking outcome unknown');
    await Shipment.updateOne(
      { _id: shipment._id },
      { $set: { needsReview: true, bookingError: `Unclear outcome: ${message}`.slice(0, 500) } },
    );
    throw new AppError(
      502,
      'COURIER_UNCERTAIN',
      `${message}. The booking may exist at the courier: check with them, then record the tracking number (or cancel this attempt) before booking again.`,
    );
  }
}

async function load(id: string): Promise<ShipmentLean> {
  const s = await Shipment.findById(id).lean<ShipmentLean>();
  if (!s) throw new AppError(404, 'NOT_FOUND', 'Shipment not found.');
  return s;
}

/** Resolves a booking of unknown outcome (or completes a manual one) by recording the courier's consignment number. */
export async function attachTracking(id: string, trackingNumber: string): Promise<ShipmentLean> {
  const s = await load(id);
  if (!s.active || s.trackingNumber)
    throw new AppError(409, 'CONFLICT', 'This shipment already has a tracking number or is no longer active.');
  const updated = await Shipment.findOneAndUpdate(
    { _id: id, active: true, trackingNumber: { $exists: false } },
    {
      $set: { trackingNumber, status: 'booked', needsReview: false },
      $unset: { bookingError: 1 },
      $push: {
        events: { at: new Date(), description: 'Tracking number recorded by staff', source: 'staff', status: null },
      },
    },
    { new: true },
  ).lean<ShipmentLean>();
  if (!updated) throw new AppError(409, 'CONFLICT', 'This shipment was just updated by someone else.');
  await Order.updateOne({ _id: s.orderId }, { $set: { shipmentStatus: 'booked' } });
  notifyOrder('dispatched', s.orderId);
  return updated;
}

export async function cancelShipment(id: string): Promise<ShipmentLean> {
  const s = await load(id);
  if (!s.active || !['booking_pending', 'booked'].includes(s.status)) {
    throw new AppError(409, 'CONFLICT', 'Only a shipment that has not been picked up can be cancelled.');
  }
  const api = s.mode === 'api' && s.courier !== 'manual' ? provider(s.courier) : undefined;
  if (api && s.trackingNumber) {
    try {
      await api.cancel(s.trackingNumber);
    } catch (err) {
      if (err instanceof CourierRejected) throw new AppError(409, 'COURIER_REJECTED', err.message);
      throw new AppError(
        502,
        'COURIER_UNCERTAIN',
        'The courier did not confirm the cancellation. Check with them before trying again.',
      );
    }
  }
  const updated = await Shipment.findOneAndUpdate(
    { _id: id, active: true },
    {
      $set: { active: false, status: 'cancelled', needsReview: false },
      $push: { events: { at: new Date(), description: 'Cancelled by staff', source: 'staff', status: null } },
    },
    { new: true },
  ).lean<ShipmentLean>();
  if (!updated) throw new AppError(409, 'CONFLICT', 'This shipment was just updated by someone else.');
  await Order.updateOne({ _id: s.orderId }, { $set: { shipmentStatus: 'not_booked' } });
  return updated;
}

// Moves an order forward through its normal statuses, recording each step, to match what the courier reports.
// It never confirms an unconfirmed order and never touches cancelled or finished ones.
async function advanceOrder(orderId: Types.ObjectId, target: ShipmentStatus): Promise<void> {
  const path: Partial<Record<ShipmentStatus, OrderStatus[]>> = {
    picked_up: FORWARD,
    in_transit: FORWARD,
    out_for_delivery: [...FORWARD, 'out_for_delivery'],
    delivered: [...FORWARD, 'delivered'],
    delivery_failed: [...FORWARD, 'delivery_failed'],
    returned_to_origin: [...FORWARD, 'delivery_failed', 'returned_to_origin'],
  };
  const steps = path[target];
  if (!steps) return;
  let order = await Order.findById(orderId).lean<OrderLean>();
  if (!order || !(FORWARD.includes(order.status) || ['out_for_delivery', 'delivery_failed'].includes(order.status)))
    return;
  for (const step of steps) {
    if (order.status === step || !canTransition(order.status, step)) continue;
    await transitionOrder(String(orderId), step, SYSTEM_ACTOR, 'Courier update');
    order = (await Order.findById(orderId).lean<OrderLean>())!;
  }
}

async function applyStatus(s: ShipmentLean, next: ShipmentStatus): Promise<ShipmentLean> {
  // Guarded on the status we read, so two syncs or a sync and a manual update cannot both apply.
  const updated = await Shipment.findOneAndUpdate(
    { _id: s._id, status: s.status },
    { $set: { status: next } },
    { new: true },
  ).lean<ShipmentLean>();
  if (!updated) return await load(String(s._id));
  await Order.updateOne({ _id: s.orderId }, { $set: { shipmentStatus: next } });
  if (next === 'delivered') notifyOrder('delivered', s.orderId);
  else if (next === 'out_for_delivery' || next === 'delivery_failed')
    notifyOrder('tracking', s.orderId, { status: next });
  try {
    await advanceOrder(s.orderId, next);
  } catch (err) {
    logger.error({ err, order: s.orderNumber, next }, 'shipment status applied but the order status could not follow');
  }
  return updated;
}

/** Staff update for shipments the courier API cannot reach (manual bookings, outages): same rules, same history. */
export async function setManualStatus(id: string, next: ShipmentStatus, note?: string): Promise<ShipmentLean> {
  const s = await load(id);
  if (!s.active && s.status !== 'delivered') throw new AppError(409, 'CONFLICT', 'This shipment is no longer active.');
  if (!isForward(s.status, next))
    throw new AppError(409, 'INVALID_TRANSITION', `A shipment that is "${s.status}" cannot be moved to "${next}".`);
  await Shipment.updateOne(
    { _id: id },
    {
      $push: {
        events: {
          at: new Date(),
          description: note || `Marked ${next.replace(/_/g, ' ')} by staff`,
          source: 'staff',
          status: next,
        },
      },
    },
  );
  return applyStatus(s, next);
}

/** Pulls the courier's tracking history, stores new events, and follows the newest recognised status. */
export async function syncShipment(id: string): Promise<{ shipment: ShipmentLean; newEvents: number }> {
  const s = await load(id);
  const api = s.mode === 'api' && s.courier !== 'manual' ? provider(s.courier) : undefined;
  if (!api || !s.trackingNumber || !s.active || TERMINAL_SHIPMENT.includes(s.status))
    return { shipment: s, newEvents: 0 };

  const { events } = await api.track(s.trackingNumber).catch((err) => {
    throw err instanceof CourierRejected
      ? new AppError(422, 'COURIER_REJECTED', err.message)
      : new AppError(502, 'COURIER_UNCERTAIN', 'The courier tracking service did not answer. Try again shortly.');
  });
  const known = new Set(s.events.map((e) => `${new Date(e.at).getTime()}|${e.description}`));
  const fresh = events.filter((e) => !known.has(`${e.at.getTime()}|${e.description}`));
  if (fresh.length > 0) {
    await Shipment.updateOne(
      { _id: id },
      {
        $push: {
          events: {
            $each: fresh.map((e) => ({
              at: e.at,
              description: e.description,
              status: e.status,
              source: 'courier',
              location: e.location,
            })),
          },
        },
      },
    );
  }
  await Shipment.updateOne({ _id: id }, { $set: { lastSyncedAt: new Date() } });

  let current = await load(id);
  const newest = latestStatus(events);
  if (newest && isForward(current.status, newest)) current = await applyStatus(current, newest);
  return { shipment: current, newEvents: fresh.length };
}

/** Background refresh of every live API shipment, least recently checked first. */
export async function syncActiveShipments(limit = 40): Promise<number> {
  const due = await Shipment.find({
    active: true,
    mode: 'api',
    trackingNumber: { $exists: true },
    status: { $nin: [...TERMINAL_SHIPMENT] },
  })
    .sort({ lastSyncedAt: 1 })
    .limit(limit)
    .lean<ShipmentLean[]>();
  let synced = 0;
  for (const s of due) {
    try {
      await syncShipment(String(s._id));
      synced++;
    } catch (err) {
      logger.warn({ err, order: s.orderNumber }, 'shipment sync failed');
    }
  }
  return synced;
}

// What the shopper may see: the live (or finished) shipment's courier, number, status and tracking history.
export async function customerShipmentView(orderId: Types.ObjectId) {
  const s = await Shipment.findOne({
    orderId,
    trackingNumber: { $exists: true },
    $or: [{ active: true }, { status: { $in: ['delivered', 'returned_to_origin'] } }],
  })
    .sort({ createdAt: -1 })
    .lean<ShipmentLean>();
  if (!s) return null;
  return {
    courier: s.courier,
    trackingNumber: s.trackingNumber,
    status: s.status,
    events: [...s.events]
      .filter((e) => e.source !== 'system' || e.status)
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .map((e) => ({ at: e.at, description: e.description, location: e.location ?? null })),
  };
}

export const toShipmentDto = (s: ShipmentLean) => ({
  id: String(s._id),
  orderId: String(s.orderId),
  orderNumber: s.orderNumber,
  courier: s.courier,
  mode: s.mode,
  trackingNumber: s.trackingNumber ?? null,
  status: s.status,
  active: s.active,
  codAmount: s.codAmount,
  weightKg: s.weightKg,
  pieces: s.pieces,
  needsReview: s.needsReview,
  bookingError: s.bookingError ?? null,
  lastSyncedAt: s.lastSyncedAt ?? null,
  createdAt: s.createdAt,
  events: s.events,
});
