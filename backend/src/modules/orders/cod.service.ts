import { AppError } from '../../common/errors';
import { Order, type OrderLean } from './order.model';

const problem = (field: string, message: string) =>
  new AppError(400, 'VALIDATION_ERROR', 'Some fields are invalid.', [{ field: `body.${field}`, message }]);

async function loadCod(orderId: string): Promise<OrderLean & { cod: NonNullable<OrderLean['cod']> }> {
  const order = await Order.findById(orderId).lean<OrderLean>();
  if (!order) throw new AppError(404, 'NOT_FOUND', 'Order not found.');
  if (!order.cod) throw new AppError(409, 'CONFLICT', 'This is not a cash-on-delivery order.');
  return order as OrderLean & { cod: NonNullable<OrderLean['cod']> };
}

/**
 * Step 1 of COD money: the courier handed the customer's cash over at the door (we only know this from the courier's
 * delivery record). It is NOT yet MAPLE's money, so the order stays "unpaid" (FR-COD-003/004).
 */
export async function recordCollection(orderId: string, amount: number): Promise<OrderLean> {
  const order = await loadCod(orderId);
  if (order.status !== 'delivered')
    throw new AppError(409, 'CONFLICT', 'Cash collection can only be recorded after the order is delivered.');
  if (amount !== order.cod.amountDue)
    throw problem('amount', `The courier collects exactly the amount due (${order.cod.amountDue} paisa).`);
  const updated = await Order.findOneAndUpdate(
    { _id: orderId, status: 'delivered', 'cod.collectedAmount': 0 },
    { $set: { 'cod.collectedAmount': amount, 'cod.collectedAt': new Date() } },
    { new: true },
  ).lean<OrderLean>();
  if (!updated) throw new AppError(409, 'CONFLICT', 'Collection was already recorded for this order.');
  return updated;
}

/**
 * Step 2: the courier paid MAPLE (a settlement or invoice line). `amount` is cash received, `courierCharges` is what
 * the courier kept for its fee. Once received + charges account for everything collected, the order becomes "paid".
 * The whole check-and-add is one conditional update, so the same settlement cannot be recorded twice or exceed the cash.
 */
export async function recordRemittance(
  orderId: string,
  input: { amount: number; courierCharges: number; reference: string },
): Promise<OrderLean> {
  const order = await loadCod(orderId);
  if (order.cod.collectedAmount <= 0)
    throw new AppError(409, 'CONFLICT', 'Record the cash collection before recording a remittance.');
  const total = input.amount + input.courierCharges;
  if (total <= 0) throw problem('amount', 'Enter an amount or courier charges.');

  const updated = await Order.findOneAndUpdate(
    {
      _id: orderId,
      'cod.collectedAmount': { $gt: 0 },
      'cod.references': { $ne: input.reference },
      $expr: { $lte: [{ $add: ['$cod.remittedAmount', '$cod.courierCharges', total] }, '$cod.collectedAmount'] },
    },
    {
      $inc: { 'cod.remittedAmount': input.amount, 'cod.courierCharges': input.courierCharges },
      $set: { 'cod.remittedAt': new Date() },
      $push: { 'cod.references': input.reference },
    },
    { new: true },
  ).lean<OrderLean>();

  if (!updated) {
    if (order.cod.references.includes(input.reference))
      throw new AppError(409, 'CONFLICT', 'A remittance with this reference was already recorded.');
    throw new AppError(409, 'CONFLICT', 'This would account for more money than the courier collected.');
  }
  const cod = updated.cod!;
  if (cod.remittedAmount + cod.courierCharges === cod.collectedAmount) {
    await Order.updateOne({ _id: orderId, paymentStatus: 'unpaid' }, { $set: { paymentStatus: 'paid' } });
    return (await Order.findById(orderId).lean<OrderLean>())!;
  }
  return updated;
}

// Collected, remitted and delivered-but-uncollected are reported separately and never summed into one number (SRS 11).
export async function codSummary() {
  const [row] = await Order.aggregate<{
    awaitingCollection: { count: number; amount: number }[];
    awaitingRemittance: { count: number; amount: number }[];
    settled: { count: number; collected: number; received: number; courierCharges: number }[];
    list: Record<string, unknown>[];
  }>([
    { $match: { paymentMethod: 'cod', status: 'delivered' } },
    {
      $facet: {
        awaitingCollection: [
          { $match: { 'cod.collectedAmount': 0 } },
          { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: '$cod.amountDue' } } },
        ],
        awaitingRemittance: [
          {
            $match: {
              'cod.collectedAmount': { $gt: 0 },
              $expr: { $lt: [{ $add: ['$cod.remittedAmount', '$cod.courierCharges'] }, '$cod.collectedAmount'] },
            },
          },
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
              amount: {
                $sum: { $subtract: ['$cod.collectedAmount', { $add: ['$cod.remittedAmount', '$cod.courierCharges'] }] },
              },
            },
          },
        ],
        settled: [
          { $match: { paymentStatus: 'paid' } },
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
              collected: { $sum: '$cod.collectedAmount' },
              received: { $sum: '$cod.remittedAmount' },
              courierCharges: { $sum: '$cod.courierCharges' },
            },
          },
        ],
        list: [
          {
            $match: {
              'cod.collectedAmount': { $gt: 0 },
              $expr: { $lt: [{ $add: ['$cod.remittedAmount', '$cod.courierCharges'] }, '$cod.collectedAmount'] },
            },
          },
          { $sort: { 'cod.collectedAt': 1 } },
          { $limit: 100 },
          {
            $project: {
              _id: 0,
              orderNumber: 1,
              collectedAt: '$cod.collectedAt',
              collected: '$cod.collectedAmount',
              outstanding: {
                $subtract: ['$cod.collectedAmount', { $add: ['$cod.remittedAmount', '$cod.courierCharges'] }],
              },
            },
          },
        ],
      },
    },
  ]);
  const one = (rows: { count: number; amount: number }[] | undefined) => ({
    count: rows?.[0]?.count ?? 0,
    amount: rows?.[0]?.amount ?? 0,
  });
  const settled = row?.settled[0];
  return {
    currency: 'PKR',
    awaitingCollection: one(row?.awaitingCollection),
    awaitingRemittance: { ...one(row?.awaitingRemittance), orders: row?.list ?? [] },
    settled: {
      count: settled?.count ?? 0,
      collected: settled?.collected ?? 0,
      received: settled?.received ?? 0,
      courierCharges: settled?.courierCharges ?? 0,
    },
  };
}
