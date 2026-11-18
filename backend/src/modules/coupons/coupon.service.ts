import { AppError, isDuplicateKeyError } from '../../common/errors';
import { Coupon, type CouponLean, type ICoupon } from './coupon.model';

export type CouponFailure = 'NOT_FOUND' | 'INACTIVE' | 'NOT_STARTED' | 'EXPIRED' | 'USAGE_LIMIT' | 'MIN_ORDER';

const money = (paisa: number) => `Rs ${(paisa / 100).toLocaleString('en-PK', { maximumFractionDigits: 2 })}`;

export function failureMessage(reason: CouponFailure, coupon?: Pick<ICoupon, 'minOrderValue'>): string {
  if (reason === 'USAGE_LIMIT') return 'This coupon has reached its usage limit.';
  if (reason === 'MIN_ORDER' && coupon)
    return `A minimum order of ${money(coupon.minOrderValue)} is required for this coupon.`;
  return 'This coupon is invalid or has expired.';
}

// Discount applies to the merchandise subtotal only, never shipping, and can never exceed the subtotal.
export function computeDiscount(coupon: Pick<ICoupon, 'type' | 'value' | 'maxDiscount'>, subtotal: number): number {
  const raw = coupon.type === 'percent' ? Math.floor((subtotal * coupon.value) / 100) : coupon.value;
  const capped = coupon.type === 'percent' && coupon.maxDiscount != null ? Math.min(raw, coupon.maxDiscount) : raw;
  return Math.max(0, Math.min(capped, subtotal));
}

export function checkCoupon(
  coupon: CouponLean | null,
  subtotal: number,
  now = new Date(),
): { ok: true; discount: number } | { ok: false; reason: CouponFailure } {
  if (!coupon) return { ok: false, reason: 'NOT_FOUND' };
  if (!coupon.isActive) return { ok: false, reason: 'INACTIVE' };
  if (coupon.startsAt && coupon.startsAt > now) return { ok: false, reason: 'NOT_STARTED' };
  if (coupon.expiresAt && coupon.expiresAt <= now) return { ok: false, reason: 'EXPIRED' };
  if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) return { ok: false, reason: 'USAGE_LIMIT' };
  if (subtotal < coupon.minOrderValue) return { ok: false, reason: 'MIN_ORDER' };
  return { ok: true, discount: computeDiscount(coupon, subtotal) };
}

export async function evaluateCoupon(code: string, subtotal: number) {
  const coupon = await Coupon.findOne({ code: code.toUpperCase() }).lean<CouponLean>();
  const result = checkCoupon(coupon, subtotal);
  return { coupon, result };
}

// The read-then-check in evaluateCoupon is advisory; this conditional update is what actually enforces the limit
// when several orders redeem the last use at once.
export async function redeemCoupon(id: string): Promise<void> {
  const res = await Coupon.updateOne(
    { _id: id, isActive: true, $or: [{ usageLimit: null }, { $expr: { $lt: ['$usedCount', '$usageLimit'] } }] },
    { $inc: { usedCount: 1 } },
  );
  if (res.modifiedCount !== 1) throw new AppError(409, 'COUPON_INVALID', 'This coupon is no longer available.');
}

export async function releaseCoupon(id: string): Promise<void> {
  await Coupon.updateOne({ _id: id, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } });
}

export async function createCoupon(input: Partial<ICoupon> & Pick<ICoupon, 'code' | 'type' | 'value'>) {
  try {
    return await Coupon.create(input);
  } catch (err) {
    if (isDuplicateKeyError(err)) throw new AppError(409, 'CONFLICT', 'A coupon with this code already exists.');
    throw err;
  }
}

export async function updateCoupon(id: string, patch: Partial<ICoupon>) {
  const coupon = await Coupon.findById(id);
  if (!coupon) throw new AppError(404, 'NOT_FOUND', 'Coupon not found.');
  coupon.set(patch);
  if (coupon.type === 'percent' && coupon.value > 100)
    throw new AppError(400, 'VALIDATION_ERROR', 'Some fields are invalid.', [
      { field: 'body.value', message: 'Percentage cannot exceed 100.' },
    ]);
  try {
    await coupon.save();
  } catch (err) {
    if (isDuplicateKeyError(err)) throw new AppError(409, 'CONFLICT', 'A coupon with this code already exists.');
    throw err;
  }
  return coupon;
}
