import { Schema, model, type HydratedDocument, type Types } from 'mongoose';
import { imageSubSchema, type IImage } from '../../common/image';
import { effectivePrice } from '../../common/money';

export interface IVariantOption {
  name: string;
  value: string;
}

export interface IVariant {
  _id: Types.ObjectId;
  sku: string;
  options: IVariantOption[];
  /** Regular price in paisa. */
  price: number;
  /** Sale price in paisa; only applies when lower than price. */
  salePrice?: number | null;
  /** Units available to sell right now (on hand minus reserved). May be negative only for backorder products. */
  stock: number;
  /** Units held for in-flight checkouts; not sellable, not yet shipped. */
  reserved: number;
  lowStockThreshold: number;
  isActive: boolean;
}

export interface IProduct {
  name: string;
  slug: string;
  shortDescription?: string;
  description: string;
  categoryId: Types.ObjectId;
  status: 'draft' | 'published' | 'archived';
  featured: boolean;
  bestseller: boolean;
  allowBackorder: boolean;
  images: IImage[];
  attributes: { label: string; value: string }[];
  variants: IVariant[];
  /** Denormalised from active variants on save so listing can filter and sort by price in one indexed query. */
  priceMin: number;
  priceMax: number;
  /** Denormalised from approved reviews whenever a review is moderated. */
  ratingAverage?: number;
  ratingCount?: number;
  seoTitle?: string;
  seoDescription?: string;
  publishedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type ProductDocument = HydratedDocument<IProduct>;
export type ProductLean = IProduct & { _id: Types.ObjectId };

const integer = {
  validator: (v: unknown) => v == null || Number.isInteger(v),
  message: '{PATH} must be a whole number of paisa',
};

const optionSchema = new Schema<IVariantOption>(
  {
    name: { type: String, required: true, lowercase: true, trim: true, maxlength: 30 },
    value: { type: String, required: true, trim: true, maxlength: 60 },
  },
  { _id: false },
);

const variantSchema = new Schema<IVariant>({
  sku: { type: String, required: true, uppercase: true, trim: true },
  options: { type: [optionSchema], default: [] },
  price: { type: Number, required: true, min: 1, validate: integer },
  salePrice: { type: Number, min: 1, validate: integer, default: null },
  stock: { type: Number, default: 0, validate: integer },
  reserved: { type: Number, default: 0, min: 0, validate: integer },
  lowStockThreshold: { type: Number, default: 5, min: 0, validate: integer },
  isActive: { type: Boolean, default: true },
});

const productSchema = new Schema<IProduct>(
  {
    name: { type: String, required: true, trim: true, maxlength: 140 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    shortDescription: { type: String, maxlength: 300 },
    description: { type: String, default: '', maxlength: 5000 },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft', required: true },
    featured: { type: Boolean, default: false },
    bestseller: { type: Boolean, default: false },
    allowBackorder: { type: Boolean, default: false },
    images: { type: [imageSubSchema], default: [] },
    attributes: {
      type: [
        new Schema(
          {
            label: { type: String, required: true, maxlength: 50 },
            value: { type: String, required: true, maxlength: 200 },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    variants: { type: [variantSchema], default: [] },
    priceMin: { type: Number, default: 0 },
    priceMax: { type: Number, default: 0 },
    ratingAverage: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    seoTitle: { type: String, maxlength: 70 },
    seoDescription: { type: String, maxlength: 160 },
    publishedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Multikey unique index: enforces SKU uniqueness across products. It does NOT catch duplicates inside one
// product's own array, so the service checks that case explicitly.
productSchema.index({ 'variants.sku': 1 }, { unique: true });
productSchema.index({ status: 1, publishedAt: -1 });
productSchema.index({ status: 1, categoryId: 1, publishedAt: -1 });
productSchema.index({ status: 1, priceMin: 1 });
productSchema.index({ status: 1, featured: 1 });
productSchema.index({ status: 1, bestseller: 1 });

productSchema.pre('save', function () {
  const prices = this.variants.filter((v) => v.isActive).map((v) => effectivePrice(v.price, v.salePrice));
  this.priceMin = prices.length > 0 ? Math.min(...prices) : 0;
  this.priceMax = prices.length > 0 ? Math.max(...prices) : 0;
});

export const Product = model<IProduct>('Product', productSchema);
