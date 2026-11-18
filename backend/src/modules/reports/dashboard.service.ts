import { pktStamp } from '../../common/time';
import { User } from '../users/user.model';
import { listInventory } from '../inventory/inventory.service';
import { Order, type OrderLean } from '../orders/order.model';
import { toAdminOrderListItem } from '../orders/order.serializer';
import { Return } from '../returns/return.model';
import { Review } from '../reviews/review.model';
import { Shipment } from '../shipping/shipment.model';

const DAY = 86_400_000;

/** A date typed as YYYY-MM-DD means that day in Pakistan, from 00:00 to 23:59:59.999. */
export const dayStart = (d: string) => new Date(`${d}T00:00:00+05:00`);
export const dayEnd = (d: string) => new Date(`${d}T23:59:59.999+05:00`);
const pktDate = (d: Date) => {
  const s = pktStamp(d);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
};

export function resolveRange(from?: string, to?: string, now = new Date()) {
  const end = to ? dayEnd(to) : now;
  const start = from ? dayStart(from) : dayStart(pktDate(new Date(end.getTime() - 29 * DAY)));
  return { from: start, to: end };
}

type Money = { value?: number; n?: number };

export async function getDashboard(range: { from: Date; to: Date }) {
  const inRange = { createdAt: { $gte: range.from, $lte: range.to } };
  const live = { status: { $ne: 'cancelled' } };

  const [facets, customersTotal, customersNew, openReturns, pendingReviews, shipmentsToCheck, lowStock, recent] =
    await Promise.all([
      Order.aggregate<{
        byStatus: { _id: string; n: number }[];
        sales: { orders: number; gross: number; refunded: number }[];
        methods: { _id: string; n: number }[];
        onlinePaid: Money[];
        cod: { delivered: number; collected: number; remitted: number; charges: number }[];
        top: { _id: unknown; name: string; units: number; revenue: number }[];
        series: { _id: string; orders: number; gross: number }[];
      }>([
        { $match: inRange },
        {
          $facet: {
            byStatus: [{ $group: { _id: '$status', n: { $sum: 1 } } }],
            sales: [
              { $match: live },
              {
                $group: {
                  _id: null,
                  orders: { $sum: 1 },
                  gross: { $sum: '$total' },
                  refunded: { $sum: { $ifNull: ['$refundedAmount', 0] } },
                },
              },
            ],
            methods: [{ $match: live }, { $group: { _id: '$paymentMethod', n: { $sum: 1 } } }],
            onlinePaid: [
              {
                $match: {
                  paymentMethod: { $ne: 'cod' },
                  paymentStatus: { $in: ['paid', 'partially_refunded', 'refunded'] },
                },
              },
              { $group: { _id: null, value: { $sum: '$total' }, n: { $sum: 1 } } },
            ],
            cod: [
              { $match: { paymentMethod: 'cod', ...live } },
              {
                $group: {
                  _id: null,
                  delivered: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, '$total', 0] } },
                  collected: { $sum: { $ifNull: ['$cod.collectedAmount', 0] } },
                  remitted: { $sum: { $ifNull: ['$cod.remittedAmount', 0] } },
                  charges: { $sum: { $ifNull: ['$cod.courierCharges', 0] } },
                },
              },
            ],
            top: [
              { $match: live },
              { $unwind: '$items' },
              {
                $group: {
                  _id: '$items.productId',
                  name: { $first: '$items.name' },
                  units: { $sum: '$items.quantity' },
                  revenue: { $sum: '$items.lineTotal' },
                },
              },
              { $sort: { units: -1, revenue: -1 } },
              { $limit: 5 },
            ],
            series: [
              { $match: live },
              {
                $group: {
                  _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Asia/Karachi' } },
                  orders: { $sum: 1 },
                  gross: { $sum: '$total' },
                },
              },
            ],
          },
        },
      ]).then((r) => r[0]!),
      User.countDocuments({ role: 'customer' }),
      User.countDocuments({ role: 'customer', createdAt: { $gte: range.from, $lte: range.to } }),
      Return.countDocuments({ active: true }),
      Review.countDocuments({ status: 'pending' }),
      Shipment.countDocuments({ needsReview: true, active: true }),
      listInventory({ page: 1, limit: 5, lowStock: true }),
      Order.find().sort({ createdAt: -1, _id: -1 }).limit(10).lean<OrderLean[]>(),
    ]);

  const status = Object.fromEntries(facets.byStatus.map((s) => [s._id, s.n]));
  const sales = facets.sales[0] ?? { orders: 0, gross: 0, refunded: 0 };
  const cod = facets.cod[0] ?? { delivered: 0, collected: 0, remitted: 0, charges: 0 };
  const online = facets.onlinePaid[0] ?? {};

  const byDay = new Map(facets.series.map((s) => [s._id, s]));
  const series: { date: string; orders: number; gross: number }[] = [];
  for (let t = range.from.getTime(); t <= range.to.getTime() && series.length < 400; t += DAY) {
    const date = pktDate(new Date(t));
    series.push({ date, orders: byDay.get(date)?.orders ?? 0, gross: byDay.get(date)?.gross ?? 0 });
  }

  return {
    currency: 'PKR',
    range: { from: range.from.toISOString(), to: range.to.toISOString() },
    orders: {
      placed: facets.byStatus.reduce((n, s) => n + s.n, 0),
      byStatus: status,
      pending: (status.pending_confirmation ?? 0) + (status.awaiting_payment ?? 0),
      delivered: status.delivered ?? 0,
      cancelled: status.cancelled ?? 0,
    },
    // Each money figure means one specific thing and they are never added together (SRS section 11).
    sales: {
      grossOrderValue: sales.gross,
      ordersCounted: sales.orders,
      averageOrderValue: sales.orders ? Math.round(sales.gross / sales.orders) : 0,
      refunded: sales.refunded,
      onlinePaid: { value: online.value ?? 0, orders: online.n ?? 0 },
      cod: {
        deliveredValue: cod.delivered,
        collected: cod.collected,
        remittedToUs: cod.remitted,
        courierCharges: cod.charges,
        awaitingRemittance: cod.collected - cod.remitted - cod.charges,
      },
    },
    paymentMethods: Object.fromEntries(facets.methods.map((m) => [m._id, m.n])),
    topProducts: facets.top.map((t) => ({
      productId: String(t._id),
      name: t.name,
      units: t.units,
      revenue: t.revenue,
    })),
    series,
    lowStock: { count: lowStock.pagination.total, items: lowStock.items },
    recentOrders: recent.map(toAdminOrderListItem),
    customers: { total: customersTotal, newInRange: customersNew },
    attention: { openReturns, pendingReviews, shipmentsNeedingReview: shipmentsToCheck },
  };
}
