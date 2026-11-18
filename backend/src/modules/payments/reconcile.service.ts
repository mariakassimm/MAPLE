import { logger } from '../../config/logger';
import { Order, type OrderLean } from '../orders/order.model';
import { SYSTEM_ACTOR, transitionOrder } from '../orders/order.service';
import { Payment } from './payment.model';
import { reconcilePayment } from './payment.service';

/**
 * Cancels online orders whose payment window ran out and gives their stock back. Before cancelling, every open
 * payment attempt is checked with its provider one last time, so a customer who paid just as time ran out is not
 * cancelled by mistake. Safe to run repeatedly and from several instances: each cancellation is a guarded transition.
 */
export async function expireUnpaidOrders(now = new Date()): Promise<number> {
  const due = await Order.find({
    status: 'awaiting_payment',
    paymentStatus: { $ne: 'paid' },
    reservationExpiresAt: { $lte: now },
  })
    .limit(50)
    .lean<OrderLean[]>();
  let expired = 0;
  for (const order of due) {
    const open = await Payment.find({ orderId: order._id, status: { $in: ['initiated', 'pending'] } }).lean();
    for (const p of open) await reconcilePayment(p.paymentRef);

    const fresh = await Order.findById(order._id).lean<OrderLean>();
    if (!fresh || fresh.status !== 'awaiting_payment' || fresh.paymentStatus === 'paid') continue;
    try {
      await transitionOrder(String(order._id), 'cancelled', SYSTEM_ACTOR, 'Payment window expired', { expired: true });
      await Payment.updateMany(
        { orderId: order._id, status: { $in: ['initiated', 'pending'] } },
        { $set: { status: 'expired' } },
      );
      expired++;
    } catch (err) {
      logger.warn({ err, order: order.orderNumber }, 'could not expire unpaid order');
    }
  }
  return expired;
}
