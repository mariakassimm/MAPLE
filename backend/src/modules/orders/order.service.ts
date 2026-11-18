import { Types } from 'mongoose';
import { AppError, duplicateKeyFields, isDuplicateKeyError } from '../../common/errors';
import { sha256Hex } from '../../common/crypto';
import { normalizeCity } from '../../common/geo';
import { pageMeta } from '../../common/pagination';
import { escapeRegex } from '../../common/text';
import { normalizePkMobile } from '../../common/validators';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { mergeLines, priceCart } from '../cart/pricing.service';
import { redeemCoupon, releaseCoupon } from '../coupons/coupon.service';
import { Payment } from '../payments/payment.model';
import { commitStock, releaseStock, reserveStock, restockStock, type StockLine } from '../inventory/inventory.service';
import { paymentOptions } from '../payments/paymentMethods';
import { isDemoProvider, providerAvailability } from '../payments/registry';
import { resolveServiceArea } from '../serviceAreas/serviceArea.service';
import { notifyOrder } from '../notifications/notify';
import { getSettings } from '../settings/settings.service';
import { User } from '../users/user.model';
import { Order, type OrderLean } from './order.model';
import type { AdminOrdersQuery, PlaceOrderInput } from './order.schemas';
import { generateOrderNumber } from './orderNumber';
import { canTransition, type OrderStatus } from './orderStatus';
import { assertTrackingAllowed, clearTrackingFailures, recordTrackingFailure } from './trackGuard';

const fingerprintOf = (input: PlaceOrderInput): string =>
  sha256Hex(
    JSON.stringify({
      items: mergeLines(input.items).sort((a, b) => a.variantId.localeCompare(b.variantId)),
      coupon: input.couponCode ?? null,
      method: input.paymentMethod,
      phone: input.customer.phone,
      city: normalizeCity(input.shippingAddress.city),
      line1: input.shippingAddress.line1,
    }),
  );

function replayOrConflict(existing: OrderLean, fingerprint: string) {
  // Same key + same request = the client retried (network blip, double click): hand back the original order.
  // Same key + different request is a client bug or a collision, and must never return someone else's order.
  if (existing.requestFingerprint === fingerprint) return { order: existing, replayed: true };
  throw new AppError(
    409,
    'IDEMPOTENCY_CONFLICT',
    'This Idempotency-Key was already used for a different order request.',
  );
}

const stockLines = (order: Pick<OrderLean, 'items'>): StockLine[] =>
  order.items.map((i) => ({ productId: String(i.productId), variantId: String(i.variantId), quantity: i.quantity }));

export async function placeOrder(
  input: PlaceOrderInput,
  idempotencyKey: string,
  userId?: string,
): Promise<{ order: OrderLean; replayed: boolean }> {
  const fingerprint = fingerprintOf(input);
  const prior = await Order.findOne({ idempotencyKey }).lean<OrderLean>();
  if (prior) return replayOrConflict(prior, fingerprint);

  // Every order needs an address to write to: confirmation, dispatch and delivery all go by email. A signed-in shopper
  // who left the field empty is covered by the email on their account.
  const email =
    input.customer.email ??
    (userId ? (await User.findById(userId).select('email').lean<{ email: string }>())?.email : undefined);
  if (!email)
    throw new AppError(400, 'VALIDATION_ERROR', 'Please enter your email address so we can send your order updates.', [
      { path: 'customer.email', message: 'Email is required.' },
    ]);
  input = { ...input, customer: { ...input.customer, email } };

  const settings = await getSettings();
  const { cart, couponId } = await priceCart({ items: input.items, couponCode: input.couponCode }, settings);

  if (!cart.canCheckout) {
    const problems = [
      ...cart.lines
        .filter((l) => l.status !== 'ok')
        .map((l) => ({ variantId: l.variantId, status: l.status, availableQuantity: l.availableQuantity })),
      ...(cart.coupon && !cart.coupon.valid ? [{ coupon: cart.coupon.code, message: cart.coupon.message }] : []),
    ];
    throw new AppError(
      409,
      cart.coupon && !cart.coupon.valid && problems.length === 1 ? 'COUPON_INVALID' : 'ITEMS_UNAVAILABLE',
      'Some items or the coupon can no longer be ordered as requested.',
      problems,
    );
  }
  if (input.expectedTotal !== undefined && input.expectedTotal !== cart.total) {
    throw new AppError(409, 'PRICE_CHANGED', 'The order total has changed. Please review it and confirm again.', {
      total: cart.total,
    });
  }

  const area = await resolveServiceArea(input.shippingAddress.city, input.shippingAddress.province);
  if (!area) throw new AppError(400, 'NOT_SERVICEABLE', 'We cannot deliver to this city yet.');
  const option = paymentOptions(settings, area, cart.total, providerAvailability()).find(
    (o) => o.id === input.paymentMethod,
  );
  if (!option?.available)
    throw new AppError(400, 'PAYMENT_METHOD_UNAVAILABLE', option?.reason ?? 'This payment method is not available.');

  const orderId = new Types.ObjectId();
  const online = input.paymentMethod !== 'cod';
  const lines: StockLine[] = cart.lines.map((l) => ({
    productId: l.productId!,
    variantId: l.variantId,
    quantity: l.quantity,
  }));

  // Stock policy: units are RESERVED when the order is placed, COMMITTED when staff confirm it, and given back on cancellation.
  await reserveStock(lines, { orderId: String(orderId), reason: 'Order placed' });

  let couponRedeemed = false;
  try {
    if (couponId) {
      await redeemCoupon(couponId);
      couponRedeemed = true;
    }
    const addr = input.shippingAddress;
    const order = new Order({
      _id: orderId,
      userId: userId ? new Types.ObjectId(userId) : undefined,
      customer: input.customer,
      ...(input.paymentMethod !== 'cod' && isDemoProvider(input.paymentMethod) ? { demoPayment: true } : {}),
      // The coverage table's spelling of the city is stored, so reports group "karachi " and "Karachi" together.
      shippingAddress: {
        recipientName: addr.recipientName ?? input.customer.name,
        phone: addr.phone ?? input.customer.phone,
        province: addr.province,
        city: area.city,
        area: addr.area,
        line1: addr.line1,
        postalCode: addr.postalCode,
        notes: addr.notes,
      },
      items: cart.lines.map((l) => ({
        productId: l.productId,
        variantId: l.variantId,
        sku: l.sku,
        name: l.name,
        options: l.options,
        image: l.image,
        unitPrice: l.unitPrice,
        compareAtPrice: l.compareAtPrice,
        quantity: l.quantity,
        lineTotal: l.lineTotal,
      })),
      subtotal: cart.subtotal,
      discountTotal: cart.discount,
      couponCode: cart.coupon?.valid ? cart.coupon.code : undefined,
      couponId: couponId ? new Types.ObjectId(couponId) : undefined,
      shippingFee: cart.shippingFee,
      total: cart.total,
      notes: input.notes,
      paymentMethod: input.paymentMethod,
      // Online orders wait for the provider's verified confirmation; COD orders wait for staff. Neither is ever paid at creation.
      paymentStatus: online ? 'pending' : 'unpaid',
      status: online ? 'awaiting_payment' : 'pending_confirmation',
      statusHistory: [{ status: online ? 'awaiting_payment' : 'pending_confirmation', at: new Date() }],
      reservationExpiresAt: online ? new Date(Date.now() + env.PAYMENT_WINDOW_MINUTES * 60_000) : undefined,
      inventoryState: 'reserved',
      cod: input.paymentMethod === 'cod' ? { amountDue: cart.total } : undefined,
      idempotencyKey,
      requestFingerprint: fingerprint,
    });

    for (let attempt = 0; ; attempt++) {
      order.orderNumber = generateOrderNumber();
      try {
        await order.save();
        break;
      } catch (err) {
        if (attempt < 4 && isDuplicateKeyError(err) && duplicateKeyFields(err).includes('orderNumber')) continue;
        throw err;
      }
    }
    notifyOrder('placed', order._id);
    return { order: order.toObject() as unknown as OrderLean, replayed: false };
  } catch (err) {
    // Undo everything that was taken for this order so a failed placement leaks neither stock nor coupon uses.
    await releaseStock(lines, { orderId: String(orderId), reason: 'Order creation failed' }).catch((e) =>
      logger.error({ err: e }, 'stock rollback failed'),
    );
    if (couponRedeemed) await releaseCoupon(couponId!).catch((e) => logger.error({ err: e }, 'coupon rollback failed'));
    // Two simultaneous submits with the same key: the loser lands here and is answered with the winner's order.
    if (isDuplicateKeyError(err) && duplicateKeyFields(err).includes('idempotencyKey')) {
      const winner = await Order.findOne({ idempotencyKey }).lean<OrderLean>();
      if (winner) return replayOrConflict(winner, fingerprint);
    }
    throw err;
  }
}

export interface Actor {
  id?: string;
  /** "system" is the platform itself (payment confirmed, payment window expired). */
  role: string;
}

export const SYSTEM_ACTOR: Actor = { role: 'system' };

export async function transitionOrder(
  orderId: string,
  to: OrderStatus,
  actor: Actor,
  reason?: string,
  opts: { expired?: boolean } = {},
): Promise<OrderLean> {
  const order = await Order.findById(orderId).lean<OrderLean>();
  if (!order) throw new AppError(404, 'NOT_FOUND', 'Order not found.');
  if (!canTransition(order.status, to)) {
    throw new AppError(409, 'INVALID_TRANSITION', `An order that is "${order.status}" cannot be moved to "${to}".`);
  }

  // Staff cannot skip the payment step: an order awaiting payment is confirmed only by a verified payment.
  if (order.status === 'awaiting_payment' && to === 'confirmed' && actor.role !== 'system') {
    throw new AppError(
      409,
      'INVALID_TRANSITION',
      'This order is awaiting online payment and is confirmed automatically when the payment is verified.',
    );
  }

  const entry = {
    status: to,
    at: new Date(),
    ...(actor.id ? { actorId: new Types.ObjectId(actor.id) } : {}),
    actorRole: actor.role,
    reason,
  };
  const set: Record<string, unknown> = { status: to };
  if (to === 'cancelled') {
    set.cancellation = {
      reason,
      by: actor.role === 'system' ? 'system' : actor.role === 'customer' ? 'customer' : 'staff',
      at: entry.at,
    };
    set.inventoryState = 'released';
    // Money already received for a cancelled order must be refunded by a person; everything else just stops waiting.
    if (order.paymentStatus === 'paid') set.paymentStatus = 'refund_pending';
    else if (['unpaid', 'pending', 'processing', 'failed'].includes(order.paymentStatus))
      set.paymentStatus = opts.expired ? 'expired' : 'cancelled';
  }
  if (to === 'confirmed') set.inventoryState = 'committed';

  // Claim the transition first, conditional on the status we read. Two staff clicking at once cannot both win,
  // so the stock side effect below runs exactly once per order.
  const claimed = await Order.findOneAndUpdate(
    { _id: orderId, status: order.status },
    { $set: set, $push: { statusHistory: entry } },
    { new: true },
  ).lean<OrderLean>();
  if (!claimed)
    throw new AppError(409, 'CONFLICT', 'This order was just updated by someone else. Reload and try again.');

  const ctx = {
    orderId,
    ...(actor.id ? { actorId: actor.id } : {}),
    reason: reason ?? `Order ${to.replace(/_/g, ' ')}`,
  };
  try {
    if (to === 'confirmed') await commitStock(stockLines(order), ctx);
    if (to === 'cancelled') {
      if (order.inventoryState === 'reserved') await releaseStock(stockLines(order), ctx);
      else if (order.inventoryState === 'committed') await restockStock(stockLines(order), ctx);
      if (order.couponId) await releaseCoupon(String(order.couponId));
    }
  } catch (err) {
    // The stock change failed, so the status must not claim it happened.
    await Order.updateOne(
      { _id: orderId, status: to },
      {
        $set: { status: order.status, inventoryState: order.inventoryState, paymentStatus: order.paymentStatus },
        $unset: { cancellation: 1 },
        $pop: { statusHistory: 1 },
      },
    );
    throw err;
  }
  if (to === 'cancelled') notifyOrder('cancelled', orderId);
  // A person confirming the order is the moment the shopper has been waiting for. (A payment confirming it already sends its own email.)
  if (to === 'confirmed' && actor.role !== 'system') notifyOrder('confirmed', orderId);
  return claimed;
}

/** A shopper may cancel only while nothing has been spent on the order: before staff confirm it, or before it is paid. */
export async function cancelOwnOrder(
  order: OrderLean,
  actorId: string | undefined,
  reason?: string,
): Promise<OrderLean> {
  if (!['pending_confirmation', 'awaiting_payment'].includes(order.status)) {
    throw new AppError(409, 'CONFLICT', 'This order can no longer be cancelled online. Please contact support.');
  }
  const cancelled = await transitionOrder(
    String(order._id),
    'cancelled',
    { id: actorId, role: 'customer' },
    reason ?? 'Cancelled by customer',
  );
  // Stop any payment still open so a late "paid" is recognised as a refund case, not a normal payment.
  await Payment.updateMany(
    { orderId: order._id, status: { $in: ['initiated', 'pending'] } },
    { $set: { status: 'cancelled' } },
  );
  return cancelled;
}

export async function getAdminOrder(id: string): Promise<OrderLean> {
  const order = await Order.findById(id).lean<OrderLean>();
  if (!order) throw new AppError(404, 'NOT_FOUND', 'Order not found.');
  return order;
}

export async function listAdminOrders(q: AdminOrdersQuery) {
  const filter: Record<string, unknown> = {};
  if (q.status) filter.status = q.status;
  if (q.paymentStatus) filter.paymentStatus = q.paymentStatus;
  if (q.paymentMethod) filter.paymentMethod = q.paymentMethod;
  if (q.from || q.to) filter.createdAt = { ...(q.from && { $gte: q.from }), ...(q.to && { $lte: q.to }) };
  if (q.q) {
    const rx = new RegExp(escapeRegex(q.q), 'i');
    const phone = normalizePkMobile(q.q);
    filter.$or = [
      { orderNumber: rx },
      { 'customer.name': rx },
      { 'customer.phone': rx },
      ...(phone ? [{ 'customer.phone': phone }] : []),
    ];
  }
  const [items, total] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .lean<OrderLean[]>(),
    Order.countDocuments(filter),
  ]);
  return { items, pagination: pageMeta(q.page, q.limit, total) };
}

export async function listCustomerOrders(userId: string, page: number, limit: number) {
  const filter = { userId };
  const [items, total] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean<OrderLean[]>(),
    Order.countDocuments(filter),
  ]);
  return { items, pagination: pageMeta(page, limit, total) };
}

// Wrong owner and non-existent look identical, so order numbers cannot be probed.
export async function getCustomerOrder(userId: string, orderNumber: string): Promise<OrderLean> {
  const order = await Order.findOne({ orderNumber, userId }).lean<OrderLean>();
  if (!order) throw new AppError(404, 'NOT_FOUND', 'Order not found.');
  return order;
}

export async function trackGuestOrder(orderNumber: string, phone: string): Promise<OrderLean> {
  assertTrackingAllowed(orderNumber);
  const order = await Order.findOne({ orderNumber, 'customer.phone': phone }).lean<OrderLean>();
  if (!order) {
    recordTrackingFailure(orderNumber);
    throw new AppError(404, 'NOT_FOUND', 'No order matches that order number and phone number.');
  }
  clearTrackingFailures(orderNumber);
  return order;
}
