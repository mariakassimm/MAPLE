import { Schema, model, type Types } from 'mongoose';

export const REVIEW_STATUSES = ['pending', 'approved', 'rejected', 'hidden'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export interface IReview {
  productId: Types.ObjectId;
  userId: Types.ObjectId;
  /** The delivered order that makes this a verified purchase. */
  orderId: Types.ObjectId;
  rating: number;
  title?: string;
  body: string;
  /** "Ayesha K." - first name and last initial only, never the full name or contact details. */
  displayName: string;
  status: ReviewStatus;
  /** Staff pick for the homepage testimonials. Only approved reviews are ever shown. */
  featured: boolean;
  moderatedBy?: Types.ObjectId;
  createdAt?: Date;
}
export type ReviewLean = IReview & { _id: Types.ObjectId };

const schema = new Schema<IReview>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    rating: { type: Number, required: true, min: 1, max: 5, validate: Number.isInteger },
    title: { type: String, maxlength: 100 },
    body: { type: String, required: true, maxlength: 2000 },
    displayName: { type: String, required: true },
    status: { type: String, enum: [...REVIEW_STATUSES], default: 'pending' },
    featured: { type: Boolean, default: false },
    moderatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);
schema.index({ productId: 1, userId: 1 }, { unique: true });
schema.index({ productId: 1, status: 1, createdAt: -1 });
schema.index({ status: 1, featured: 1, createdAt: -1 });

export const Review = model<IReview>('Review', schema);
