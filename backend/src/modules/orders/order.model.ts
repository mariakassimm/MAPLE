import { Schema, model, type HydratedDocument, type Types } from 'mongoose';
import { PROVINCES } from '../../common/geo';
import { imageSubSchema, type IImage } from '../../common/image';
import { PAYMENT_METHOD_IDS, type PaymentMethodId } from '../payments/paymentMethods';
import {
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  SHIPMENT_STATUSES,
  type OrderStatus,
  type PaymentStatus,
  type ShipmentStatus,
} from './orderStatus';

export interface IOrderItem {
  productId: Types.ObjectId;
  variantId: Types.ObjectId;
  sku: string;
  name: string;
  options: { name: string; value: string }[];
  image?: IImage | null;
  unitPrice: number;
  compareAtPrice?: number | null;
  quantity: number;
  lineTotal: number;
}

export interface IOrder {
  orderNumber: string;
  userId?: Types.ObjectId;
  customer: { name: string; phone: string; email?: string };
  shippingAddress: {
    recipientName: string;
    phone: string;
    province: string;
    city: string;
    area: string;
    line1: string;
    postalCode?: string;
    notes?: string;
  };
  items: IOrderItem[];
  currency: 'PKR';
  subtotal: number;
  discountTotal: number;
  couponCode?: string;
  couponId?: Types.ObjectId;
  shippingFee: number;
  total: number;
  notes?: string;
  paymentMethod: PaymentMethodId;
  paymentStatus: PaymentStatus;
  status: OrderStatus;
  statusHistory: { status: OrderStatus; at: Date; actorId?: Types.ObjectId; actorRole?: string; reason?: string }[];
  shipmentStatus: ShipmentStatus;
  /** Where this order's stock currently is: held for it, permanently deducted, or given back. */
  inventoryState: 'reserved' | 'committed' | 'released';
  cancellation?: { reason: string; by: 'staff' | 'customer' | 'system'; at: Date };
  /** Online-payment orders hold stock only until this moment; unpaid orders are then cancelled and the stock released. */
  reservationExpiresAt?: Date;
  /** Cash-on-delivery ledger. Collection (courier took the cash) and remittance (MAPLE received it) are separate facts. */
  cod?: {
    amountDue: number;
    collectedAmount: number;
    collectedAt?: Date;
    remittedAmount: number;
    courierCharges: number;
    remittedAt?: Date;
    references: string[];
  };
  /** Total refunded so far, in paisa (recorded by staff; the refund itself is made outside this system). */
  refundedAmount?: number;
  idempotencyKey?: string;
  /** True when an online payment was made through the DEMO_MODE simulation (no real money). */
  demoPayment?: boolean;
  requestFingerprint?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type OrderDocument = HydratedDocument<IOrder>;
export type OrderLean = IOrder & { _id: Types.ObjectId };

const itemSchema = new Schema<IOrderItem>(
  {
    productId: { type: Schema.Types.ObjectId, required: true },
    variantId: { type: Schema.Types.ObjectId, required: true },
    sku: { type: String, required: true },
    name: { type: String, required: true },
    options: { type: [new Schema({ name: String, value: String }, { _id: false })], default: [] },
    image: { type: imageSubSchema, default: null },
    unitPrice: { type: Number, required: true },
    compareAtPrice: { type: Number, default: null },
    quantity: { type: Number, required: true, min: 1 },
    lineTotal: { type: Number, required: true },
  },
  { _id: false },
);

const schema = new Schema<IOrder>(
  {
    orderNumber: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    customer: {
      name: { type: String, required: true },
      phone: { type: String, required: true },
      email: { type: String },
    },
    shippingAddress: {
      recipientName: { type: String, required: true },
      phone: { type: String, required: true },
      province: { type: String, enum: [...PROVINCES], required: true },
      city: { type: String, required: true },
      area: { type: String, required: true },
      line1: { type: String, required: true },
      postalCode: { type: String },
      notes: { type: String },
    },
    // Items, prices and the address are snapshots: later edits to products or profiles must never rewrite history.
    items: { type: [itemSchema], required: true },
    currency: { type: String, enum: ['PKR'], default: 'PKR' },
    subtotal: { type: Number, required: true },
    discountTotal: { type: Number, default: 0 },
    couponCode: { type: String },
    couponId: { type: Schema.Types.ObjectId },
    shippingFee: { type: Number, required: true },
    total: { type: Number, required: true },
    notes: { type: String, maxlength: 300 },
    paymentMethod: { type: String, enum: [...PAYMENT_METHOD_IDS], required: true },
    paymentStatus: { type: String, enum: [...PAYMENT_STATUSES], default: 'unpaid' },
    status: { type: String, enum: [...ORDER_STATUSES], default: 'pending_confirmation' },
    statusHistory: {
      type: [
        new Schema(
          {
            status: { type: String, enum: [...ORDER_STATUSES] },
            at: Date,
            actorId: Schema.Types.ObjectId,
            actorRole: String,
            reason: String,
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    shipmentStatus: { type: String, enum: [...SHIPMENT_STATUSES], default: 'not_booked' },
    inventoryState: { type: String, enum: ['reserved', 'committed', 'released'], default: 'reserved' },
    cancellation: { type: new Schema({ reason: String, by: String, at: Date }, { _id: false }) },
    cod: {
      type: new Schema(
        {
          amountDue: Number,
          collectedAmount: { type: Number, default: 0 },
          collectedAt: Date,
          remittedAmount: { type: Number, default: 0 },
          courierCharges: { type: Number, default: 0 },
          remittedAt: Date,
          references: { type: [String], default: [] },
        },
        { _id: false },
      ),
    },
    reservationExpiresAt: { type: Date },
    refundedAmount: { type: Number, default: 0 },
    idempotencyKey: { type: String },
    demoPayment: { type: Boolean },
    requestFingerprint: { type: String },
  },
  { timestamps: true },
);

// Sparse so the many orders without a key do not collide; a retried request with the same key hits this index.
schema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });
schema.index({ userId: 1, createdAt: -1 });
schema.index({ status: 1, createdAt: -1 });
schema.index({ 'customer.phone': 1 });
schema.index({ createdAt: -1 });

export const Order = model<IOrder>('Order', schema);
