import type { Response } from 'express';
import { env } from '../../config/env';
import { Payment } from './payment.model';

const REF = /^[A-Za-z0-9]{6,32}$/;

// The page the shopper lands on is informational only. It carries no payment result: the frontend asks the API for the
// order's real status, which only a verified provider message can change.
export async function backToStore(res: Response, paymentRef: string | null, invalid = false): Promise<void> {
  const payment =
    paymentRef && REF.test(paymentRef) ? await Payment.findOne({ paymentRef }).select('orderNumber').lean() : null;
  const url = new URL('/checkout/result', env.CLIENT_ORIGINS[0]);
  if (payment) url.searchParams.set('order', payment.orderNumber);
  if (invalid) url.searchParams.set('invalid', '1');
  res.redirect(303, url.toString());
}
