import { Schema, model, type HydratedDocument, type Types } from 'mongoose';
import { imageSubSchema, type IImage } from '../../common/image';

export interface ICategory {
  name: string;
  slug: string;
  description?: string;
  image?: IImage;
  status: 'active' | 'archived';
  displayOrder: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export type CategoryDocument = HydratedDocument<ICategory>;
export type CategoryLean = ICategory & { _id: Types.ObjectId };

const categorySchema = new Schema<ICategory>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, maxlength: 600 },
    image: { type: imageSubSchema },
    status: { type: String, enum: ['active', 'archived'], default: 'active', required: true },
    displayOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

categorySchema.index({ status: 1, displayOrder: 1, name: 1 });

export const Category = model<ICategory>('Category', categorySchema);

export const toCategoryDto = (c: ICategory & { _id: Types.ObjectId }, productCount?: number) => ({
  id: String(c._id),
  name: c.name,
  slug: c.slug,
  description: c.description ?? null,
  image: c.image ?? null,
  status: c.status,
  displayOrder: c.displayOrder,
  ...(productCount !== undefined ? { productCount } : {}),
});
