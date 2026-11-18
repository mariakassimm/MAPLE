import type { Types } from 'mongoose';
import { logger } from '../../config/logger';
import { getMailer, type MailMessage } from '../../services/mailer';
import { Order, type OrderLean } from '../orders/order.model';
import { Return, type ReturnLean } from '../returns/return.model';
import type { ShipmentLean } from '../shipping/shipment.model';
import { Shipment } from '../shipping/shipment.model';
import { User } from '../users/user.model';
import { clientUrl, orderTrackingUrl } from './links';
import * as t from './templates';

const pending = new Set<Promise<void>>();

// Emails are sent after the business action has already succeeded and are never awaited by it. A mail outage,
// a bad address or a template bug is logged and swallowed: it must not undo or block an order or a payment.
export function fire(task: () => Promise<void>): void {
  const p: Promise<void> = task()
    .catch((err) => logger.error({ err }, 'notification failed'))
    .finally(() => pending.delete(p));
  pending.add(p);
}

/** Lets tests (and graceful shutdown) wait for in-flight emails. */
export const waitForNotifications = async (): Promise<void> => {
  await Promise.allSettled([...pending]);
};

export async function deliver(message: Omit<MailMessage, 'template'> & { template: string }): Promise<void> {
  await getMailer().send(message);
}

const orderData = (o: OrderLean): t.OrderEmail => ({
  orderNumber: o.orderNumber,
  customerName: o.customer.name,
  items: o.items.map((i) => ({
    name: i.name,
    options: i.options.map((x) => x.value).join(' / ') || undefined,
    quantity: i.quantity,
    lineTotal: i.lineTotal,
  })),
  subtotal: o.subtotal,
  discountTotal: o.discountTotal,
  shippingFee: o.shippingFee,
  total: o.total,
  paymentMethod: o.paymentMethod,
  address: `${o.shippingAddress.line1}, ${o.shippingAddress.area}, ${o.shippingAddress.city}`,
  trackUrl: orderTrackingUrl(o.orderNumber),
});

export type OrderNotice =
  'placed' | 'confirmed' | 'paid' | 'payment_failed' | 'dispatched' | 'tracking' | 'delivered' | 'cancelled';

const TRACKING_LABEL: Record<string, string> = {
  out_for_delivery: 'Out for delivery',
  delivery_failed: 'Delivery attempt unsuccessful',
};

// Staff who can act on orders (confirm, cancel, ship). Suspended accounts are never emailed.
const ORDER_STAFF_ROLES = ['super_admin', 'order_manager'] as const;

/** A cash-on-delivery order sits "pending confirmation" until a person acts, so the people who can act are told straight away. */
async function alertStaffOfNewOrder(order: OrderLean): Promise<void> {
  if (order.status !== 'pending_confirmation') return; // online orders are confirmed by the payment itself
  const staff = await User.find({ role: { $in: [...ORDER_STAFF_ROLES] }, status: 'active' })
    .select('email')
    .lean<{ email: string }[]>();
  const mail = t.staffNewOrder({
    orderNumber: order.orderNumber,
    customerName: order.customer.name,
    city: order.shippingAddress.city,
    total: order.total,
    itemCount: order.items.reduce((n, i) => n + i.quantity, 0),
    adminUrl: clientUrl(`/admin/orders/${String(order._id)}`),
  });
  // One email each, sent independently: a bad address for one person must not stop the others hearing about the order.
  await Promise.allSettled(
    staff.map((s) =>
      deliver({ to: s.email, ...mail, template: 'staff_new_order', meta: { order: order.orderNumber } }),
    ),
  );
}

export function notifyOrder(
  kind: OrderNotice,
  orderId: Types.ObjectId | string,
  extra: { status?: string } = {},
): void {
  fire(async () => {
    const order = await Order.findById(orderId).lean<OrderLean>();
    if (order && kind === 'placed') await alertStaffOfNewOrder(order);
    // Email is optional at checkout; without an address there is simply nobody to write to.
    if (!order?.customer.email) return;
    const to = order.customer.email;
    const data = orderData(order);
    const meta = { order: order.orderNumber, trackUrl: data.trackUrl };
    const shipment = ['dispatched', 'tracking'].includes(kind)
      ? await Shipment.findOne({
          orderId: order._id,
          trackingNumber: { $exists: true },
          active: true,
        }).lean<ShipmentLean>()
      : null;

    let mail: t.Rendered | null = null;
    if (kind === 'placed') mail = t.orderConfirmation(data, order.status === 'awaiting_payment');
    else if (kind === 'confirmed') mail = t.orderConfirmed(data);
    else if (kind === 'paid') mail = t.paymentConfirmed(data);
    else if (kind === 'payment_failed') mail = t.paymentFailed(data);
    else if (kind === 'delivered') mail = t.delivered(data);
    else if (kind === 'cancelled') mail = t.cancelled(data, order.cancellation?.reason);
    else if (kind === 'dispatched' && shipment?.trackingNumber)
      mail = t.orderDispatched(
        data,
        shipment.courier === 'manual' ? 'our courier' : shipment.courier,
        shipment.trackingNumber,
      );
    else if (kind === 'tracking' && shipment?.trackingNumber && extra.status && TRACKING_LABEL[extra.status])
      mail = t.trackingUpdate(data, TRACKING_LABEL[extra.status]!, shipment.trackingNumber);
    if (mail) await deliver({ to, ...mail, template: `order_${kind}`, meta });
  });
}

export function notifyReturn(returnId: Types.ObjectId | string): void {
  fire(async () => {
    const ret = await Return.findById(returnId).lean<ReturnLean>();
    if (!ret?.customer.email) return;
    const mail = t.returnUpdate({
      reference: ret.reference,
      orderNumber: ret.orderNumber,
      customerName: ret.customer.name,
      status: ret.status,
      note: ret.resolutionNote,
      refundAmount: ret.refundAmount,
      trackUrl: orderTrackingUrl(ret.orderNumber),
    });
    await deliver({
      to: ret.customer.email,
      ...mail,
      template: `return_${ret.status}`,
      meta: { reference: ret.reference },
    });
  });
}
