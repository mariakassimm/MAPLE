import { Schema, model } from 'mongoose';

export interface ISettings {
  key: string;
  shipping: { flatRate: number; freeShippingThreshold: number | null };
  cod: { enabled: boolean; maxOrderValue: number | null };
  maxQuantityPerLine: number;
  returns?: { windowDays: number };
}

// Single document keyed "store". Defaults are PLACEHOLDERS until the business confirms its shipping policy (SRS 15.3).
const settingsSchema = new Schema<ISettings>({
  key: { type: String, required: true, unique: true },
  shipping: {
    flatRate: { type: Number, default: 30_000 },
    freeShippingThreshold: { type: Number, default: null },
  },
  cod: {
    enabled: { type: Boolean, default: true },
    maxOrderValue: { type: Number, default: null },
  },
  maxQuantityPerLine: { type: Number, default: 10 },
  // PLACEHOLDER until the business publishes its returns policy (SRS 15.3).
  returns: { windowDays: { type: Number, default: 7 } },
});

export const Settings = model<ISettings>('Settings', settingsSchema);
