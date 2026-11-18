import { describe, expect, it } from 'vitest';
import { computeShipping, mergeLines } from '../../src/modules/cart/pricing.service';
import { checkCoupon, computeDiscount } from '../../src/modules/coupons/coupon.service';
import type { CouponLean } from '../../src/modules/coupons/coupon.model';
import { generateOrderNumber } from '../../src/modules/orders/orderNumber';
import { ORDER_STATUSES, allowedTransitions, canTransition } from '../../src/modules/orders/orderStatus';
import { paymentOptions } from '../../src/modules/payments/paymentMethods';
import type { ISettings } from '../../src/modules/settings/settings.model';

const coupon = (over: Partial<CouponLean> = {}): CouponLean => ({
  _id: undefined as never, code: 'X', type: 'percent', value: 10, minOrderValue: 0, maxDiscount: null,
  startsAt: null, expiresAt: null, usageLimit: null, usedCount: 0, isActive: true, ...over,
});
const settings = (over: Partial<ISettings> = {}): ISettings => ({
  key: 'store', shipping: { flatRate: 30_000, freeShippingThreshold: null }, cod: { enabled: true, maxOrderValue: null }, maxQuantityPerLine: 10, ...over,
});

describe('coupon discount maths', () => {
  it('rounds percentage discounts down and honours the cap', () => {
    expect(computeDiscount(coupon({ value: 15 }), 9_999)).toBe(1_499);
    expect(computeDiscount(coupon({ value: 50, maxDiscount: 1_000 }), 100_000)).toBe(1_000);
  });
  it('never discounts more than the subtotal', () => {
    expect(computeDiscount(coupon({ type: 'fixed', value: 500_000 }), 200_000)).toBe(200_000);
    expect(computeDiscount(coupon({ value: 100 }), 777)).toBe(777);
  });
});

describe('coupon eligibility', () => {
  const now = new Date('2026-06-15T12:00:00Z');
  it('accepts a valid coupon', () => expect(checkCoupon(coupon(), 100_000, now)).toEqual({ ok: true, discount: 10_000 }));
  it.each([
    ['NOT_FOUND', null],
    ['INACTIVE', coupon({ isActive: false })],
    ['NOT_STARTED', coupon({ startsAt: new Date('2026-07-01') })],
    ['EXPIRED', coupon({ expiresAt: new Date('2026-06-01') })],
    ['EXPIRED', coupon({ expiresAt: now })],
    ['USAGE_LIMIT', coupon({ usageLimit: 3, usedCount: 3 })],
    ['MIN_ORDER', coupon({ minOrderValue: 500_000 })],
  ] as const)('rejects with %s', (reason, c) => expect(checkCoupon(c, 100_000, now)).toEqual({ ok: false, reason }));
});

describe('shipping', () => {
  it('charges the flat rate, is free above the threshold, and is zero for an empty cart', () => {
    expect(computeShipping(settings(), 100, true)).toBe(30_000);
    const free = settings({ shipping: { flatRate: 30_000, freeShippingThreshold: 500_000 } });
    expect(computeShipping(free, 499_999, true)).toBe(30_000);
    expect(computeShipping(free, 500_000, true)).toBe(0);
    expect(computeShipping(settings(), 0, false)).toBe(0);
  });
});

describe('cart lines', () => {
  it('merges duplicate variants', () => {
    expect(mergeLines([{ variantId: 'a', quantity: 1 }, { variantId: 'b', quantity: 2 }, { variantId: 'a', quantity: 3 }])).toEqual([
      { variantId: 'a', quantity: 4 }, { variantId: 'b', quantity: 2 },
    ]);
  });
});

describe('order state machine', () => {
  it('allows the happy path and cancellation only before dispatch', () => {
    const path = ['pending_confirmation', 'confirmed', 'processing', 'packed', 'ready_for_dispatch', 'shipped', 'out_for_delivery', 'delivered'] as const;
    for (let i = 0; i < path.length - 1; i++) expect(canTransition(path[i]!, path[i + 1]!)).toBe(true);
    for (const s of ['pending_confirmation', 'confirmed', 'processing', 'packed', 'ready_for_dispatch'] as const) expect(canTransition(s, 'cancelled')).toBe(true);
    for (const s of ['shipped', 'out_for_delivery', 'delivered', 'delivery_failed'] as const) expect(canTransition(s, 'cancelled')).toBe(false);
  });
  it('moves online orders from awaiting_payment to confirmed or cancelled only', () => {
    expect(allowedTransitions('awaiting_payment')).toEqual(['confirmed', 'cancelled']);
    expect(canTransition('awaiting_payment', 'processing')).toBe(false);
    expect(canTransition('pending_confirmation', 'awaiting_payment')).toBe(false);
  });
  it('has no way out of terminal states and no skipping', () => {
    for (const s of ['delivered', 'cancelled', 'returned_to_origin'] as const) expect(allowedTransitions(s)).toEqual([]);
    expect(canTransition('pending_confirmation', 'shipped')).toBe(false);
    expect(canTransition('delivered', 'confirmed')).toBe(false);
    expect(ORDER_STATUSES.every((s) => Array.isArray(allowedTransitions(s)))).toBe(true);
  });
});

describe('payment options', () => {
  const byId = (opts: ReturnType<typeof paymentOptions>, id: string) => opts.find((o) => o.id === id)!;
  it('offers COD only where the area and settings allow it', () => {
    expect(byId(paymentOptions(settings(), { codAvailable: true }, 1000), 'cod').available).toBe(true);
    expect(byId(paymentOptions(settings(), { codAvailable: false }, 1000), 'cod').available).toBe(false);
    expect(byId(paymentOptions(settings(), null, 1000), 'cod').available).toBe(false);
    expect(byId(paymentOptions(settings({ cod: { enabled: false, maxOrderValue: null } }), { codAvailable: true }, 1000), 'cod').available).toBe(false);
    const capped = settings({ cod: { enabled: true, maxOrderValue: 5_000 } });
    expect(byId(paymentOptions(capped, { codAvailable: true }, 5_000), 'cod').available).toBe(true);
    expect(byId(paymentOptions(capped, { codAvailable: true }, 5_001), 'cod').available).toBe(false);
  });
  it('keeps online methods unavailable until the provider is configured and the city is known', () => {
    const none = paymentOptions(settings(), { codAvailable: true }, 1000);
    expect(byId(none, 'jazzcash').available).toBe(false);
    expect(byId(none, 'easypaisa').available).toBe(false);
    const only = paymentOptions(settings(), { codAvailable: false }, 1000, { jazzcash: true, easypaisa: false });
    expect(byId(only, 'jazzcash').available).toBe(true); // online payment does not depend on COD coverage
    expect(byId(only, 'easypaisa').available).toBe(false);
    expect(byId(paymentOptions(settings(), null, 1000, { jazzcash: true, easypaisa: true }), 'jazzcash').available).toBe(false);
  });
});

describe('order numbers', () => {
  it('are MPL- plus 8 unambiguous characters and do not repeat', () => {
    const numbers = new Set(Array.from({ length: 500 }, generateOrderNumber));
    expect(numbers.size).toBe(500);
    for (const n of numbers) expect(n).toMatch(/^MPL-[ABCDEFGHJKMNPQRSTVWXYZ2-9]{8}$/);
  });
});
