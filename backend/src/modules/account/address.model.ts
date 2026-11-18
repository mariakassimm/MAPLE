import { Schema, model, type Types } from 'mongoose';
import { PROVINCES } from '../../common/geo';

export interface IAddress {
  userId: Types.ObjectId;
  label: string;
  recipientName: string;
  phone: string;
  province: string;
  city: string;
  area: string;
  line1: string;
  postalCode?: string;
  notes?: string;
  isDefault: boolean;
  createdAt?: Date;
}
export type AddressLean = IAddress & { _id: Types.ObjectId };

const schema = new Schema<IAddress>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    label: { type: String, default: 'Home', maxlength: 30 },
    recipientName: { type: String, required: true },
    phone: { type: String, required: true },
    province: { type: String, enum: [...PROVINCES], required: true },
    city: { type: String, required: true },
    area: { type: String, required: true },
    line1: { type: String, required: true },
    postalCode: { type: String },
    notes: { type: String },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const Address = model<IAddress>('Address', schema);

export const toAddressDto = (a: AddressLean) => ({
  id: String(a._id),
  label: a.label,
  recipientName: a.recipientName,
  phone: a.phone,
  province: a.province,
  city: a.city,
  area: a.area,
  line1: a.line1,
  postalCode: a.postalCode ?? null,
  notes: a.notes ?? null,
  isDefault: a.isDefault,
});
