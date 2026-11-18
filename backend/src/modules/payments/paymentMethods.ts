import type { ISettings } from '../settings/settings.model';

export const PAYMENT_METHOD_IDS = ['cod', 'jazzcash', 'easypaisa'] as const;
export type PaymentMethodId = (typeof PAYMENT_METHOD_IDS)[number];

export interface PaymentOption {
  id: PaymentMethodId;
  available: boolean;
  reason?: string;
}

// A method is offered only when its provider is configured, so checkout never shows (and the API never accepts)
// a payment method that cannot be verified.
const ONLINE_NOT_READY = 'Online payment is not available yet.';

export interface ProviderFlags {
  jazzcash: boolean;
  easypaisa: boolean;
}

export function paymentOptions(
  settings: ISettings,
  area: { codAvailable: boolean } | null,
  total: number,
  providers: ProviderFlags = { jazzcash: false, easypaisa: false },
): PaymentOption[] {
  let cod: PaymentOption = { id: 'cod', available: true };
  if (!settings.cod.enabled)
    cod = { id: 'cod', available: false, reason: 'Cash on delivery is currently unavailable.' };
  else if (!area) cod = { id: 'cod', available: false, reason: 'Enter your city to check cash on delivery.' };
  else if (!area.codAvailable)
    cod = { id: 'cod', available: false, reason: 'Cash on delivery is not available in your area.' };
  else if (settings.cod.maxOrderValue != null && total > settings.cod.maxOrderValue) {
    cod = { id: 'cod', available: false, reason: 'This order is above the cash on delivery limit.' };
  }
  // Online methods need a configured provider AND a destination we deliver to (the area check keeps coverage rules in one place).
  const online = (id: 'jazzcash' | 'easypaisa'): PaymentOption =>
    !providers[id]
      ? { id, available: false, reason: ONLINE_NOT_READY }
      : !area
        ? { id, available: false, reason: 'Enter your city to continue.' }
        : { id, available: true };
  return [cod, online('jazzcash'), online('easypaisa')];
}
