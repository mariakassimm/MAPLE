import { Schema, model, type Types } from 'mongoose';
import { PROVINCES, type Province } from '../../common/geo';

export interface IServiceArea {
  city: string;
  cityKey: string;
  province: Province;
  isActive: boolean;
  codAvailable: boolean;
  couriers: { tcs: boolean; leopards: boolean };
  note?: string;
}
export type ServiceAreaLean = IServiceArea & { _id: Types.ObjectId };

// Admin-maintained coverage table (SRS 8.6): we never promise delivery to a place no courier has confirmed.
const schema = new Schema<IServiceArea>(
  {
    city: { type: String, required: true, trim: true, maxlength: 60 },
    cityKey: { type: String, required: true },
    province: { type: String, enum: [...PROVINCES], required: true },
    isActive: { type: Boolean, default: true },
    codAvailable: { type: Boolean, default: false },
    couriers: { tcs: { type: Boolean, default: true }, leopards: { type: Boolean, default: false } },
    note: { type: String, maxlength: 200 },
  },
  { timestamps: true },
);
schema.index({ cityKey: 1, province: 1 }, { unique: true });

export const ServiceArea = model<IServiceArea>('ServiceArea', schema);
