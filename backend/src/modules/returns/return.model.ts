import { Schema, model, type Types } from 'mongoose';

export const RETURN_STATUSES = [
  'requested',
  'approved',
  'rejected',
  'received',
  'refunded',
  'exchanged',
  'closed',
] as const;
export type ReturnStatus = (typeof RETURN_STATUSES)[number];
export const RETURN_REASONS = [
  'defective',
  'wrong_item',
  'not_as_described',
  'size_fit',
  'changed_mind',
  'other',
] as const;

export interface IReturn {
  reference: string;
  orderId: Types.ObjectId;
  orderNumber: string;
  userId?: Types.ObjectId;
  customer: { name: string; phone: string; email?: string };
  type: 'refund' | 'exchange';
  reason: (typeof RETURN_REASONS)[number];
  details?: string;
  items: { variantId: Types.ObjectId; productId: Types.ObjectId; sku: string; name: string; quantity: number }[];
  status: ReturnStatus;
  /** True until the return reaches a final status; at most one active return per order. */
  active: boolean;
  /** Paisa refunded; recorded by staff after they pay it back outside this system. */
  refundAmount?: number;
  resolutionNote?: string;
  history: { status: ReturnStatus; at: Date; actorId?: Types.ObjectId; note?: string }[];
  createdAt?: Date;
}
export type ReturnLean = IReturn & { _id: Types.ObjectId };

const schema = new Schema<IReturn>(
  {
    reference: { type: String, required: true, unique: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    orderNumber: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    customer: {
      name: { type: String, required: true },
      phone: { type: String, required: true },
      email: { type: String },
    },
    type: { type: String, enum: ['refund', 'exchange'], required: true },
    reason: { type: String, enum: [...RETURN_REASONS], required: true },
    details: { type: String, maxlength: 500 },
    items: {
      type: [
        new Schema(
          {
            variantId: Schema.Types.ObjectId,
            productId: Schema.Types.ObjectId,
            sku: String,
            name: String,
            quantity: Number,
          },
          { _id: false },
        ),
      ],
      required: true,
    },
    status: { type: String, enum: [...RETURN_STATUSES], default: 'requested' },
    active: { type: Boolean, default: true },
    refundAmount: { type: Number },
    resolutionNote: { type: String, maxlength: 300 },
    history: {
      type: [new Schema({ status: String, at: Date, actorId: Schema.Types.ObjectId, note: String }, { _id: false })],
      default: [],
    },
  },
  { timestamps: true },
);
schema.index({ orderId: 1 }, { unique: true, partialFilterExpression: { active: true } });
schema.index({ status: 1, createdAt: -1 });
schema.index({ userId: 1, createdAt: -1 });

export const Return = model<IReturn>('Return', schema);
