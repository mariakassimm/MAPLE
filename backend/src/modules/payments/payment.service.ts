import { createHash } from 'crypto';
import { AppError, duplicateKeyFields, isDuplicateKeyError } from '../../common/errors';
import { newPaymentRef } from '../../common/time';
import { logger } from '../../config/logger';
import { notifyOrder } from '../notifications/notify';
import { Order, type OrderLean } from '../orders/order.model';
import { SYSTEM_ACTOR, transitionOrder } from '../orders/order.service';
import { Payment, PaymentEvent, type IPayment } from './payment.model';
import { getProvider } from './registry';
import type { Outcome, ProviderId, RedirectForm } from './types';

const MAX_ATTEMPTS = 5;
const SECRET_KEY = /pass|secret|hashkey|token|hashedreq|securehash|credentials/i;

// Provider payloads are logged for audit, minus anything that is a credential or a signature.
export const sanitize = (raw: Record<string, string>): Record<string, string> =>
  Object.fromEntries(
    Object.entries(raw)
      .filter(([k]) => !SECRET_KEY.test(k))
      .map(([k, v]) => [k, String(v).slice(0, 300)]),
  );

type Source = 'return' | 'ipn' | 'postback' | 'inquiry' | 'admin';

export async function logEvent(e: {
  paymentRef: string;
  provider: string;
  source: Source;
  authentic: boolean;
  result: string;
  detail?: string;
  raw?: Record<string, string>;
}): Promise<void> {
  const raw = e.raw ? sanitize(e.raw) : undefined;
  // Identical deliveries (provider retries, double clicks) collapse into one row.
  const dedupeKey = createHash('sha256')
    .update(
      JSON.stringify([
        e.provider,
        e.paymentRef,
        e.source,
        e.authentic,
        e.result,
        raw ? Object.entries(raw).sort() : null,
      ]),
    )
    .digest('hex');
  try {
    await PaymentEvent.create({ ...e, raw, dedupeKey });
  } catch (err) {
    if (!isDuplicateKeyError(err)) logger.error({ err }, 'failed to write payment event');
  }
}

/** Starts (or restarts) a payment for an order that is waiting for online payment. */
export async function initiatePayment(
  orderNumber: string,
  phone: string,
  providerId: ProviderId,
): Promise<{ paymentRef: string; redirect: RedirectForm }> {
  const order = await Order.findOne({ orderNumber, 'customer.phone': phone }).lean<OrderLean>();
  if (!order) throw new AppError(404, 'NOT_FOUND', 'No order matches that order number and phone number.');
  if (order.paymentMethod !== providerId)
    throw new AppError(400, 'PAYMENT_METHOD_UNAVAILABLE', 'This order was placed with a different payment method.');
  if (order.status !== 'awaiting_payment' || order.paymentStatus === 'paid')
    throw new AppError(409, 'CONFLICT', 'This order is not waiting for payment.');
  const now = new Date();
  if (!order.reservationExpiresAt || order.reservationExpiresAt <= now)
    throw new AppError(409, 'CONFLICT', 'The payment window for this order has expired.');
  const provider = getProvider(providerId);
  if (!provider)
    throw new AppError(400, 'PAYMENT_METHOD_UNAVAILABLE', 'This payment method is not available right now.');

  const attempt = (await Payment.countDocuments({ orderId: order._id })) + 1;
  if (attempt > MAX_ATTEMPTS)
    throw new AppError(409, 'CONFLICT', 'Too many payment attempts for this order. Please contact support.');

  for (let tries = 0; ; tries++) {
    const paymentRef = newPaymentRef(now);
    try {
      // The amount comes from the stored order, never from the request.
      await Payment.create({
        orderId: order._id,
        orderNumber: order.orderNumber,
        provider: providerId,
        paymentRef,
        amount: order.total,
        attempt,
        expiresAt: order.reservationExpiresAt,
      });
      const redirect = provider.buildRedirect({
        paymentRef,
        orderNumber: order.orderNumber,
        amount: order.total,
        customerPhone: order.customer.phone,
        customerEmail: order.customer.email,
        expiresAt: order.reservationExpiresAt,
        now,
      });
      await Order.updateOne(
        { _id: order._id, paymentStatus: { $in: ['failed', 'pending'] } },
        { $set: { paymentStatus: 'pending' } },
      );
      return { paymentRef, redirect };
    } catch (err) {
      if (tries < 3 && isDuplicateKeyError(err) && duplicateKeyFields(err).includes('paymentRef')) continue;
      throw err;
    }
  }
}

export interface ApplyResult {
  applied: boolean;
  status: string;
}

/**
 * The only place payment state changes. Safe to call any number of times, in any order, from any source
 * (browser return, provider notification, inquiry, admin): every transition is a conditional update, so a
 * duplicate or late callback cannot pay an order twice, confirm it twice or deduct stock twice.
 */
export async function applyOutcome(
  paymentRef: string,
  outcome: Outcome,
  source: Source,
  raw?: Record<string, string>,
): Promise<ApplyResult> {
  const payment = await Payment.findOne({ paymentRef }).lean<IPayment & { _id: unknown }>();
  if (!payment) {
    await logEvent({ paymentRef, provider: 'unknown', source, authentic: true, result: 'unknown_reference', raw });
    return { applied: false, status: 'unknown' };
  }
  const log = (result: string, detail?: string) =>
    logEvent({ paymentRef, provider: payment.provider, source, authentic: true, result, detail, raw });

  // Never trust a "paid" for a different amount than we asked for.
  if (outcome.amount !== undefined && outcome.amount !== payment.amount) {
    if (outcome.kind === 'paid') {
      await Payment.updateOne(
        { paymentRef, status: { $in: ['initiated', 'pending', 'failed', 'cancelled', 'expired'] } },
        {
          $set: {
            status: 'review',
            reviewReason: `Provider reported ${outcome.amount} paisa, expected ${payment.amount}`,
            providerRef: outcome.providerRef,
          },
        },
      );
    }
    await log('amount_mismatch', `reported ${outcome.amount}, expected ${payment.amount}`);
    return { applied: false, status: 'review' };
  }

  if (outcome.kind === 'paid') {
    const claimed = await Payment.findOneAndUpdate(
      { paymentRef, status: { $in: ['initiated', 'pending', 'failed', 'cancelled', 'expired'] } },
      {
        $set: {
          status: 'paid',
          paidAt: new Date(),
          providerRef: outcome.providerRef,
          responseCode: outcome.responseCode,
          responseMessage: outcome.message?.slice(0, 300),
        },
      },
      { new: true },
    );
    if (!claimed) {
      await log('duplicate');
      return { applied: false, status: payment.status };
    }
    await settleOrder(claimed);
    await log('paid');
    return { applied: true, status: 'paid' };
  }

  if (outcome.kind === 'failed') {
    const res = await Payment.updateOne(
      { paymentRef, status: { $in: ['initiated', 'pending'] } },
      {
        $set: { status: 'failed', responseCode: outcome.responseCode, responseMessage: outcome.message?.slice(0, 300) },
      },
    );
    if (res.modifiedCount === 1) {
      notifyOrder('payment_failed', payment.orderId as never);
      // Only flip the order to "failed" when no other attempt is still open, so a retry in another tab is not hidden.
      const open = await Payment.countDocuments({
        orderId: payment.orderId,
        status: { $in: ['initiated', 'pending'] },
      });
      if (open === 0)
        await Order.updateOne(
          { _id: payment.orderId, paymentStatus: { $in: ['pending', 'processing'] } },
          { $set: { paymentStatus: 'failed' } },
        );
    }
    await log('failed', outcome.message);
    return { applied: res.modifiedCount === 1, status: res.modifiedCount === 1 ? 'failed' : payment.status };
  }

  const res = await Payment.updateOne(
    { paymentRef, status: 'initiated' },
    {
      $set: { status: 'pending', responseCode: outcome.responseCode, responseMessage: outcome.message?.slice(0, 300) },
    },
  );
  if (res.modifiedCount === 1)
    await Order.updateOne(
      { _id: payment.orderId, paymentStatus: 'pending' },
      { $set: { paymentStatus: 'processing' } },
    );
  await log('pending');
  return { applied: res.modifiedCount === 1, status: 'pending' };
}

// Called once, by whichever caller won the "paid" claim.
async function settleOrder(payment: IPayment & { _id?: unknown; orderId: unknown }): Promise<void> {
  const order = await Order.findById(payment.orderId).lean<OrderLean>();
  if (!order) return;

  // Money for an order that was already cancelled/expired is real money: record it as awaiting refund, never lose it.
  const target = order.status === 'cancelled' ? 'refund_pending' : 'paid';
  const orderClaim = await Order.findOneAndUpdate(
    { _id: order._id, paymentStatus: { $nin: ['paid', 'refund_pending', 'partially_refunded', 'refunded'] } },
    { $set: { paymentStatus: target } },
  );
  if (!orderClaim) {
    // A second successful payment for the same order (two tabs, retry after success): flag it for a human to refund.
    await Payment.updateOne(
      { paymentRef: payment.paymentRef },
      { $set: { status: 'review', reviewReason: 'Duplicate payment: the order was already paid' } },
    );
    logger.warn({ paymentRef: payment.paymentRef, order: order.orderNumber }, 'duplicate payment needs refund');
    return;
  }
  if (target === 'refund_pending') {
    logger.warn(
      { paymentRef: payment.paymentRef, order: order.orderNumber },
      'payment received for a cancelled order; refund needed',
    );
    return;
  }
  if (order.status === 'awaiting_payment') {
    try {
      await transitionOrder(String(order._id), 'confirmed', SYSTEM_ACTOR, 'Payment received');
      notifyOrder('paid', order._id);
    } catch (err) {
      // The payment is safely recorded; an operator can see a paid order still awaiting confirmation.
      logger.error({ err, order: order.orderNumber }, 'order paid but automatic confirmation failed');
    }
  }
}

/** Asks the provider about one transaction and applies the answer. Returns null when the provider cannot tell us. */
export async function reconcilePayment(paymentRef: string, source: Source = 'inquiry'): Promise<ApplyResult | null> {
  const payment = await Payment.findOne({ paymentRef }).lean<IPayment>();
  if (!payment || ['paid', 'review'].includes(payment.status)) return null;
  const provider = getProvider(payment.provider);
  if (!provider?.canInquire) return null;
  try {
    const outcome = await provider.inquire({
      paymentRef,
      amount: payment.amount,
      createdAt: payment.createdAt as Date,
    });
    return outcome ? await applyOutcome(paymentRef, outcome, source) : null;
  } catch (err) {
    logger.warn({ err, paymentRef }, 'payment inquiry failed');
    return null;
  }
}
