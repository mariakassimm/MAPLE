import { Schema, model, type Types } from 'mongoose';

export const PAYMENT_ATTEMPT_STATUSES = [
  'initiated',
  'pending',
  'paid',
  'failed',
  'cancelled',
  'expired',
  'review',
] as const;
export type PaymentAttemptStatus = (typeof PAYMENT_ATTEMPT_STATUSES)[number];

export interface IPayment {
  orderId: Types.ObjectId;
  orderNumber: string;
  provider: 'jazzcash' | 'easypaisa';
  /** Our unique reference; sent to the provider as pp_TxnRefNo / orderRefNum. */
  paymentRef: string;
  /** Integer paisa. */
  amount: number;
  currency: 'PKR';
  status: PaymentAttemptStatus;
  attempt: number;
  providerRef?: string;
  responseCode?: string;
  responseMessage?: string;
  /** Why a payment needs a human (amount mismatch, duplicate payment...). */
  reviewReason?: string;
  expiresAt: Date;
  paidAt?: Date;
  createdAt?: Date;
}

const schema = new Schema<IPayment>(
  {
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    orderNumber: { type: String, required: true },
    provider: { type: String, enum: ['jazzcash', 'easypaisa'], required: true },
    paymentRef: { type: String, required: true, unique: true },
    amount: { type: Number, required: true },
    currency: { type: String, enum: ['PKR'], default: 'PKR' },
    status: { type: String, enum: [...PAYMENT_ATTEMPT_STATUSES], default: 'initiated' },
    attempt: { type: Number, required: true },
    providerRef: { type: String },
    responseCode: { type: String },
    responseMessage: { type: String, maxlength: 300 },
    reviewReason: { type: String },
    expiresAt: { type: Date, required: true },
    paidAt: { type: Date },
  },
  { timestamps: true },
);
schema.index({ status: 1, createdAt: -1 });

export const Payment = model<IPayment>('Payment', schema);

export interface IPaymentEvent {
  paymentRef: string;
  provider: string;
  source: 'return' | 'ipn' | 'postback' | 'inquiry' | 'admin';
  /** false = the data failed authentication and was ignored. */
  authentic: boolean;
  result: string;
  detail?: string;
  /** Provider payload with credentials and tokens removed. */
  raw?: Record<string, string>;
  dedupeKey: string;
  createdAt?: Date;
}

// Append-only audit trail of everything a provider (or someone pretending to be one) sent us.
const eventSchema = new Schema<IPaymentEvent>(
  {
    paymentRef: { type: String, required: true, index: true },
    provider: { type: String, required: true },
    source: { type: String, required: true },
    authentic: { type: Boolean, required: true },
    result: { type: String, required: true },
    detail: { type: String, maxlength: 300 },
    raw: { type: Schema.Types.Mixed },
    dedupeKey: { type: String, required: true, unique: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const PaymentEvent = model<IPaymentEvent>('PaymentEvent', eventSchema);
