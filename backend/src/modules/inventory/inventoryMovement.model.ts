import { Schema, model, type Types } from 'mongoose';

export const MOVEMENT_TYPES = ['initial', 'adjustment', 'reserve', 'release', 'commit', 'restock', 'return'] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export interface IInventoryMovement {
  productId: Types.ObjectId;
  variantId: Types.ObjectId;
  /** Snapshot: the SKU may be edited later but history must stay readable. */
  sku: string;
  type: MovementType;
  stockDelta: number;
  reservedDelta: number;
  stockAfter: number;
  reservedAfter: number;
  reason?: string;
  actorId?: Types.ObjectId;
  orderId?: Types.ObjectId;
  createdAt?: Date;
}

// Append-only ledger of every stock change, with the actor or source (FR-INV-006).
const schema = new Schema<IInventoryMovement>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    variantId: { type: Schema.Types.ObjectId, required: true, index: true },
    sku: { type: String, required: true },
    type: { type: String, enum: [...MOVEMENT_TYPES], required: true },
    stockDelta: { type: Number, required: true },
    reservedDelta: { type: Number, required: true },
    stockAfter: { type: Number, required: true },
    reservedAfter: { type: Number, required: true },
    reason: { type: String, maxlength: 200 },
    actorId: { type: Schema.Types.ObjectId, ref: 'User' },
    orderId: { type: Schema.Types.ObjectId },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

schema.index({ productId: 1, createdAt: -1 });
schema.index({ createdAt: -1 });

export const InventoryMovement = model<IInventoryMovement>('InventoryMovement', schema);
