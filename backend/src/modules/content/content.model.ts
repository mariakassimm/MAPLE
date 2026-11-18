import { Schema, model, type Types } from 'mongoose';

export type ContentKey = 'site' | 'home';

// One document per editable area ("site" = announcement, contact, social; "home" = homepage sections). The shape is
// enforced by zod on every write, so what is stored is always valid.
const contentSchema = new Schema<{ key: ContentKey; data: Record<string, unknown>; updatedBy?: Types.ObjectId }>(
  {
    key: { type: String, enum: ['site', 'home'], required: true, unique: true },
    data: { type: Schema.Types.Mixed, default: {} },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);
export const Content = model('Content', contentSchema);

export interface IPage {
  slug: string;
  title: string;
  /** Plain text; blank lines separate paragraphs. No HTML is stored or rendered, so a page can never carry a script. */
  body: string;
  published: boolean;
  seoTitle?: string;
  seoDescription?: string;
  updatedAt?: Date;
}
export type PageLean = IPage & { _id: Types.ObjectId };

const pageSchema = new Schema<IPage>(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    title: { type: String, required: true, maxlength: 120 },
    body: { type: String, default: '', maxlength: 30_000 },
    published: { type: Boolean, default: false },
    seoTitle: { type: String, maxlength: 70 },
    seoDescription: { type: String, maxlength: 160 },
  },
  { timestamps: true },
);
export const Page = model<IPage>('Page', pageSchema);
