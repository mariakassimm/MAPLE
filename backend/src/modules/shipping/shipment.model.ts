import { Schema, model, type Types } from 'mongoose';
import { SHIPMENT_STATUSES, type ShipmentStatus } from '../orders/orderStatus';

export interface IShipmentEvent {
  at: Date;
  description: string;
  status?: ShipmentStatus | null;
  source: 'courier' | 'staff' | 'system';
  location?: string;
}

export interface IShipment {
  orderId: Types.ObjectId;
  orderNumber: string;
  courier: 'tcs' | 'leopards' | 'manual';
  /** api = booked and tracked through the courier's API; manual = staff booked it elsewhere and keep it updated by hand. */
  mode: 'api' | 'manual';
  trackingNumber?: string;
  status: ShipmentStatus;
  /** True while this shipment is the order's live one. Exactly one active shipment per order is enforced by an index. */
  active: boolean;
  /** Paisa the courier must collect; 0 for prepaid orders. */
  codAmount: number;
  weightKg: number;
  pieces: number;
  bookingError?: string;
  /** The booking call may have succeeded without us hearing: a person must check before anyone books again. */
  needsReview: boolean;
  events: IShipmentEvent[];
  lastSyncedAt?: Date;
  createdBy?: Types.ObjectId;
  createdAt?: Date;
}
export type ShipmentLean = IShipment & { _id: Types.ObjectId };

const schema = new Schema<IShipment>(
  {
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    orderNumber: { type: String, required: true },
    courier: { type: String, enum: ['tcs', 'leopards', 'manual'], required: true },
    mode: { type: String, enum: ['api', 'manual'], required: true },
    trackingNumber: { type: String },
    status: { type: String, enum: [...SHIPMENT_STATUSES], default: 'booking_pending' },
    active: { type: Boolean, default: true },
    codAmount: { type: Number, default: 0 },
    weightKg: { type: Number, default: 0.5 },
    pieces: { type: Number, default: 1 },
    bookingError: { type: String, maxlength: 500 },
    needsReview: { type: Boolean, default: false },
    events: {
      type: [
        new Schema({ at: Date, description: String, status: String, source: String, location: String }, { _id: false }),
      ],
      default: [],
    },
    lastSyncedAt: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

// The guard against double booking (FR-SHP-007): a second active shipment for the same order cannot exist, even if two
// staff members click "Book" at the same instant, and an order can never be booked with both couriers.
schema.index({ orderId: 1 }, { unique: true, partialFilterExpression: { active: true } });
schema.index({ active: 1, status: 1, lastSyncedAt: 1 });
schema.index({ trackingNumber: 1 }, { sparse: true });
schema.index({ orderId: 1, createdAt: -1 });

export const Shipment = model<IShipment>('Shipment', schema);
