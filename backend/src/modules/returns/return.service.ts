import { Types } from 'mongoose';
import { AppError, duplicateKeyFields, isDuplicateKeyError } from '../../common/errors';
import { pageMeta } from '../../common/pagination';
import { logger } from '../../config/logger';
import { restockStock } from '../inventory/inventory.service';
import { notifyReturn } from '../notifications/notify';
import { Order, type OrderLean } from '../orders/order.model';
import { generateReturnNumber } from '../orders/orderNumber';
import { getSettings } from '../settings/settings.service';
import { Return, type ReturnLean, type ReturnStatus, type IReturn } from './return.model';

const TRANSITIONS: Record<ReturnStatus, readonly ReturnStatus[]> = {
  requested: ['approved', 'rejected'],
  approved: ['received', 'closed'],
  received: ['refunded', 'exchanged', 'closed'],
  rejected: [],
  refunded: [],
  exchanged: [],
  closed: [],
};
const FINAL: readonly ReturnStatus[] = ['rejected', 'refunded', 'exchanged', 'closed'];

const invalid = (field: string, message: string) =>
  new AppError(400, 'VALIDATION_ERROR', 'Some fields are invalid.', [{ field, message }]);

export interface CreateReturnInput {
  orderNumber: string;
  phone: string;
  type: 'refund' | 'exchange';
  reason: IReturn['reason'];
  details?: string;
  items: { variantId: string; quantity: number }[];
}

export async function createReturn(input: CreateReturnInput, signedInUserId?: string): Promise<ReturnLean> {
  const order = await Order.findOne({
    orderNumber: input.orderNumber,
    'customer.phone': input.phone,
  }).lean<OrderLean>();
  if (!order) throw new AppError(404, 'NOT_FOUND', 'No order matches that order number and phone number.');
  if (order.status !== 'delivered')
    throw new AppError(409, 'CONFLICT', 'Returns can only be requested for delivered orders.');

  // The return period runs from the day the order was delivered.
  const deliveredAt = [...order.statusHistory].reverse().find((h) => h.status === 'delivered')?.at ?? order.updatedAt!;
  const windowDays = (await getSettings()).returns?.windowDays ?? 7;
  if (Date.now() > new Date(deliveredAt).getTime() + windowDays * 86_400_000) {
    throw new AppError(
      409,
      'CONFLICT',
      `The ${windowDays}-day return period for this order has ended. Please contact support.`,
    );
  }

  const wanted = new Map<string, number>();
  for (const i of input.items) wanted.set(i.variantId, (wanted.get(i.variantId) ?? 0) + i.quantity);
  const items = [...wanted].map(([variantId, quantity]) => {
    const line = order.items.find((l) => String(l.variantId) === variantId);
    if (!line) throw invalid('body.items', 'One of the items is not part of this order.');
    if (quantity > line.quantity)
      throw invalid('body.items', `You can return at most ${line.quantity} of "${line.name}".`);
    return { variantId: line.variantId, productId: line.productId, sku: line.sku, name: line.name, quantity };
  });

  for (let attempt = 0; ; attempt++) {
    try {
      const created = await Return.create({
        reference: generateReturnNumber(),
        orderId: order._id,
        orderNumber: order.orderNumber,
        userId: order.userId ?? (signedInUserId ? new Types.ObjectId(signedInUserId) : undefined),
        customer: order.customer,
        type: input.type,
        reason: input.reason,
        details: input.details,
        items,
        status: 'requested',
        active: true,
        history: [{ status: 'requested', at: new Date() }],
      });
      notifyReturn(created._id);
      return created.toObject() as unknown as ReturnLean;
    } catch (err) {
      if (isDuplicateKeyError(err) && duplicateKeyFields(err).includes('orderId'))
        throw new AppError(409, 'CONFLICT', 'There is already an open return request for this order.');
      if (attempt < 4 && isDuplicateKeyError(err) && duplicateKeyFields(err).includes('reference')) continue;
      throw err;
    }
  }
}

export interface UpdateReturnInput {
  status: ReturnStatus;
  note?: string;
  refundAmount?: number;
  /** On "received": units staff inspected and found fit to resell. Nothing returns to stock automatically. */
  restock?: { variantId: string; quantity: number }[];
}

export async function updateReturn(id: string, input: UpdateReturnInput, actorId: string): Promise<ReturnLean> {
  const ret = await Return.findById(id).lean<ReturnLean>();
  if (!ret) throw new AppError(404, 'NOT_FOUND', 'Return not found.');
  if (!TRANSITIONS[ret.status].includes(input.status))
    throw new AppError(
      409,
      'INVALID_TRANSITION',
      `A return that is "${ret.status}" cannot be moved to "${input.status}".`,
    );

  if (input.status === 'rejected' && !input.note)
    throw invalid('body.note', 'Give the customer a reason for declining.');
  if (input.status === 'refunded' && ret.type !== 'refund')
    throw invalid('body.status', 'This is an exchange request; use "exchanged".');
  if (input.status === 'exchanged' && ret.type !== 'exchange')
    throw invalid('body.status', 'This is a refund request; use "refunded".');
  if (input.restock && input.status !== 'received')
    throw invalid('body.restock', 'Items are put back on sale when the return is marked received, after inspection.');
  if (input.refundAmount !== undefined && input.status !== 'refunded')
    throw invalid('body.refundAmount', 'A refund amount only applies when the status is "refunded".');
  if (input.status === 'refunded' && !input.refundAmount)
    throw invalid('body.refundAmount', 'Enter the amount refunded.');

  const restock = (input.restock ?? []).map((r) => {
    const line = ret.items.find((i) => String(i.variantId) === r.variantId);
    if (!line || r.quantity > line.quantity)
      throw invalid('body.restock', 'Restock quantities must match items in this return.');
    return { productId: String(line.productId), variantId: r.variantId, quantity: r.quantity };
  });

  // A refund is recorded against the order first, conditionally, so refunds can never add up to more than the order total.
  let refundRecorded = false;
  if (input.status === 'refunded') {
    const order = await Order.findOneAndUpdate(
      {
        _id: ret.orderId,
        $expr: { $lte: [{ $add: [{ $ifNull: ['$refundedAmount', 0] }, input.refundAmount!] }, '$total'] },
      },
      { $inc: { refundedAmount: input.refundAmount! } },
      { new: true },
    ).lean<OrderLean>();
    if (!order) throw new AppError(409, 'CONFLICT', 'This refund would exceed what the customer paid for the order.');
    refundRecorded = true;
    if (['paid', 'partially_refunded'].includes(order.paymentStatus)) {
      await Order.updateOne(
        { _id: ret.orderId },
        { $set: { paymentStatus: (order.refundedAmount ?? 0) >= order.total ? 'refunded' : 'partially_refunded' } },
      );
    }
  }

  const final = FINAL.includes(input.status);
  const entry = { status: input.status, at: new Date(), actorId: new Types.ObjectId(actorId), note: input.note };
  const claimed = await Return.findOneAndUpdate(
    { _id: id, status: ret.status },
    {
      $set: {
        status: input.status,
        active: !final,
        ...(input.note ? { resolutionNote: input.note } : {}),
        ...(input.refundAmount ? { refundAmount: input.refundAmount } : {}),
      },
      $push: { history: entry },
    },
    { new: true },
  ).lean<ReturnLean>();
  if (!claimed) {
    if (refundRecorded) await Order.updateOne({ _id: ret.orderId }, { $inc: { refundedAmount: -input.refundAmount! } });
    throw new AppError(409, 'CONFLICT', 'This return was just updated by someone else. Reload and try again.');
  }

  if (restock.length > 0) {
    try {
      await restockStock(
        restock,
        { actorId, orderId: String(ret.orderId), reason: `Return ${ret.reference} inspected` },
        'return',
      );
    } catch (err) {
      logger.error({ err, reference: ret.reference }, 'return marked received but restock failed');
    }
  }
  notifyReturn(claimed._id);
  return claimed;
}

export async function lookupReturns(orderNumber: string, phone: string): Promise<ReturnLean[]> {
  const order = await Order.findOne({ orderNumber, 'customer.phone': phone }).select('_id').lean();
  if (!order) throw new AppError(404, 'NOT_FOUND', 'No order matches that order number and phone number.');
  return Return.find({ orderId: order._id }).sort({ createdAt: -1 }).lean<ReturnLean[]>();
}

export const listUserReturns = (userId: string) => Return.find({ userId }).sort({ createdAt: -1 }).lean<ReturnLean[]>();

export async function listAdminReturns(q: { page: number; limit: number; status?: ReturnStatus }) {
  const filter = q.status ? { status: q.status } : {};
  const [items, total] = await Promise.all([
    Return.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .lean<ReturnLean[]>(),
    Return.countDocuments(filter),
  ]);
  return { items, pagination: pageMeta(q.page, q.limit, total) };
}

export async function getReturn(id: string): Promise<ReturnLean> {
  const r = await Return.findById(id).lean<ReturnLean>();
  if (!r) throw new AppError(404, 'NOT_FOUND', 'Return not found.');
  return r;
}

export const toCustomerReturn = (r: ReturnLean) => ({
  reference: r.reference,
  orderNumber: r.orderNumber,
  type: r.type,
  reason: r.reason,
  details: r.details ?? null,
  status: r.status,
  items: r.items.map((i) => ({ name: i.name, sku: i.sku, quantity: i.quantity })),
  refundAmount: r.refundAmount ?? null,
  resolutionNote: r.resolutionNote ?? null,
  timeline: r.history.map((h) => ({ status: h.status, at: h.at })),
  createdAt: r.createdAt,
});

export const toAdminReturn = (r: ReturnLean) => ({
  ...toCustomerReturn(r),
  id: String(r._id),
  orderId: String(r.orderId),
  customer: r.customer,
  active: r.active,
  items: r.items.map((i) => ({
    variantId: String(i.variantId),
    productId: String(i.productId),
    name: i.name,
    sku: i.sku,
    quantity: i.quantity,
  })),
  history: r.history.map((h) => ({
    status: h.status,
    at: h.at,
    actorId: h.actorId ? String(h.actorId) : null,
    note: h.note ?? null,
  })),
});
