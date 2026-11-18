import { z } from 'zod';
import { imageInputSchema } from '../../common/image';
import { objectIdSchema, queryBoolean, slugSchema } from '../../common/validators';

const skuSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{1,39}$/, 'SKU must be 2-40 characters: letters, numbers, dot, dash or underscore')
  .transform((s) => s.toUpperCase());

// Option names are lower-cased so "Color" and "colour-case" typos cannot split one filter into several.
const optionSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(30)
      .transform((s) => s.toLowerCase()),
    value: z.string().trim().min(1).max(60),
  })
  .strict();

const attributeSchema = z
  .object({ label: z.string().trim().min(1).max(50), value: z.string().trim().min(1).max(200) })
  .strict();

// Prices are integer paisa (1 PKR = 100 paisa), e.g. Rs 12,500 is sent as 1250000.
const paisa = z.number().int().min(1).max(100_000_000);

const variantFields = {
  sku: skuSchema,
  options: z.array(optionSchema).max(5),
  price: paisa,
  salePrice: paisa.nullable(),
  lowStockThreshold: z.number().int().min(0).max(10_000),
};

const uniqueOptionNames = (v: { options?: { name: string }[] }) =>
  !v.options || new Set(v.options.map((o) => o.name)).size === v.options.length;

export const variantCreateSchema = z
  .object({
    ...variantFields,
    options: variantFields.options.optional(),
    salePrice: variantFields.salePrice.optional(),
    lowStockThreshold: variantFields.lowStockThreshold.optional(),
    initialStock: z.number().int().min(0).max(1_000_000).default(0),
  })
  .strict()
  .refine(uniqueOptionNames, { message: 'Option names must be unique within a variant', path: ['options'] })
  .refine((v) => v.salePrice == null || v.salePrice < v.price, {
    message: 'Sale price must be lower than the regular price',
    path: ['salePrice'],
  });

export const variantUpdateSchema = z
  .object({ ...variantFields, isActive: z.boolean() })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field')
  .refine(uniqueOptionNames, { message: 'Option names must be unique within a variant', path: ['options'] });

const productFields = {
  name: z.string().trim().min(2).max(140),
  slug: slugSchema,
  shortDescription: z.string().trim().max(300),
  description: z.string().trim().max(5000),
  categoryId: objectIdSchema,
  images: z.array(imageInputSchema).max(12),
  attributes: z.array(attributeSchema).max(20),
  featured: z.boolean(),
  bestseller: z.boolean(),
  allowBackorder: z.boolean(),
  seoTitle: z.string().trim().max(70),
  seoDescription: z.string().trim().max(160),
};

export const productCreateSchema = z
  .object({
    ...productFields,
    slug: productFields.slug.optional(),
    shortDescription: productFields.shortDescription.optional(),
    description: productFields.description.optional(),
    images: productFields.images.optional(),
    attributes: productFields.attributes.optional(),
    featured: productFields.featured.optional(),
    bestseller: productFields.bestseller.optional(),
    allowBackorder: productFields.allowBackorder.optional(),
    seoTitle: productFields.seoTitle.optional(),
    seoDescription: productFields.seoDescription.optional(),
    variants: z.array(variantCreateSchema).min(1).max(50),
  })
  .strict();

// Status changes go through the dedicated publish/unpublish/archive endpoints, never through a generic PATCH.
export const productUpdateSchema = z
  .object(productFields)
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field');

export const variantParamsSchema = z.object({ id: objectIdSchema, variantId: objectIdSchema }).strict();

const paging = (defaultLimit: number, maxLimit: number) => ({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(maxLimit).default(defaultLimit),
});

// Unknown query params are ignored (not rejected) so harmless extras like utm_* do not break shop links.
// Shopper-facing filters are lenient on purpose: a hand-edited or stale link (?sort=banana, ?page=-2, ?min=abc) falls back
// to the default instead of an error page. The same fields drive both the product list and the filter bounds (facets).
const discoveryFilters = {
  category: slugSchema.optional().catch(undefined),
  minPrice: z.coerce.number().int().min(0).optional().catch(undefined),
  maxPrice: z.coerce.number().int().min(0).optional().catch(undefined),
  availability: z.enum(['in_stock']).optional().catch(undefined),
  new: queryBoolean.optional().catch(undefined),
  q: z.string().trim().min(1).max(100).optional().catch(undefined),
};

export const productListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
  limit: z.coerce.number().int().min(1).max(48).catch(12),
  sort: z.enum(['featured', 'newest', 'price_asc', 'price_desc', 'name_asc']).catch('featured'),
  ...discoveryFilters,
  color: z.string().trim().min(1).max(40).optional().catch(undefined),
  featured: queryBoolean.optional(),
  bestseller: queryBoolean.optional(),
});

export const facetsQuerySchema = z.object({ category: discoveryFilters.category, new: discoveryFilters.new });

export type FacetsQuery = z.infer<typeof facetsQuerySchema>;

export const slugParamSchema = z.object({ slug: slugSchema }).strict();

export const adminProductListQuerySchema = z.object({
  ...paging(20, 100),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  categoryId: objectIdSchema.optional(),
  q: z.string().trim().min(1).max(100).optional(),
});

export type ProductCreateInput = z.infer<typeof productCreateSchema>;
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;
export type VariantCreateInput = z.infer<typeof variantCreateSchema>;
export type VariantUpdateInput = z.infer<typeof variantUpdateSchema>;
export type ProductListQuery = z.infer<typeof productListQuerySchema>;
export type AdminProductListQuery = z.infer<typeof adminProductListQuerySchema>;
