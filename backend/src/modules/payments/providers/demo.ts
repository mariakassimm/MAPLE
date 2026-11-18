import { createHmac, timingSafeEqual } from 'crypto';
import { env } from '../../../config/env';
import type { InitiateInput, InquiryTarget, Outcome, PaymentProvider, ProviderId, RedirectForm } from '../types';

export const apiBase = (): string => (env.API_PUBLIC_URL ?? `http://localhost:${env.PORT}`).replace(/\/+$/, '');

// The simulated checkout page only accepts payment references this server issued, so it cannot be used to mark
// an arbitrary order as paid by guessing a reference.
export const demoToken = (paymentRef: string): string =>
  createHmac('sha256', env.CSRF_SECRET).update(`demo-pay:${paymentRef}`).digest('hex');
export const validDemoToken = (paymentRef: string, token: string): boolean => {
  const a = Buffer.from(demoToken(paymentRef));
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
};

/** Stands in for JazzCash or Easypaisa when DEMO_MODE is on and that provider has no credentials. */
export class DemoPaymentProvider implements PaymentProvider {
  readonly canInquire = false;
  constructor(readonly id: ProviderId) {}

  buildRedirect(input: InitiateInput): RedirectForm {
    return {
      method: 'POST',
      action: `${apiBase()}/api/v1/payments/demo/checkout`,
      fields: { paymentRef: input.paymentRef, token: demoToken(input.paymentRef) },
    };
  }

  async inquire(_target: InquiryTarget): Promise<Outcome | null> {
    return null;
  }
}
