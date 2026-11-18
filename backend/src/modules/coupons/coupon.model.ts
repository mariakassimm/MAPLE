import { Schema, model, type Types } from 'mongoose';

export interface ICoupon {
  code: string;
  description?: string;
  type: 'percent' | 'fixed';
  /** Percent (1-100) or fixed amount in paisa. */
  value: number;
  minOrderValue: number;
  /** Cap for percentage coupons, in paisa. */
  maxDiscount: number | null;
  startsAt: Date | null;
  expiresAt: Date | null;
  usageLimit: number | null;
  usedCount: number;
  isActive: boolean;
  createdAt?: Date;
}
export type CouponLean = ICoupon & { _id: Types.ObjectId };

const schema = new Schema<ICoupon>(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 32 },
    description: { type: String, maxlength: 200 },
    type: { type: String, enum: ['percent', 'fixed'], required: true },
    value: { type: Number, required: true, min: 1 },
    minOrderValue: { type: Number, default: 0, min: 0 },
    maxDiscount: { type: Number, default: null },
    startsAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    usageLimit: { type: Number, default: null },
    usedCount: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const Coupon = model<ICoupon>('Coupon', schema);
