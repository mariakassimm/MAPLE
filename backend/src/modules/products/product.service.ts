import { AppError, duplicateKeyFields, isDuplicateKeyError } from '../../common/errors';
import { pageMeta } from '../../common/pagination';
import { escapeRegex, slugify } from '../../common/text';
import { Category } from '../categories/category.model';
import { recordInitialStock } from '../inventory/inventory.service';
import { Product, type ProductDocument, type ProductLean } from './product.model';
import type {
  AdminProductListQuery,
  ProductCreateInput,
  ProductUpdateInput,
  VariantCreateInput,
  VariantUpdateInput,
} from './product.schemas';

const toLean = (doc: ProductDocument) => doc.toObject() as unknown as ProductLean;

const invalid = (field: string, message: string) =>
  new AppError(400, 'VALIDATION_ERROR', 'Some fields are invalid.', [{ field, message }]);

function conflictFor(err: unknown): AppError | null {
  if (!isDuplicateKeyError(err)) return null;
  const fields = duplicateKeyFields(err);
  if (fields.includes('variants.sku')) return new AppError(409, 'CONFLICT', 'One or more SKUs are already in use.');
  if (fields.includes('slug')) return new AppError(409, 'CONFLICT', 'This slug is already in use.');
  return new AppError(409, 'CONFLICT', 'A record with these details already exists.');
}

async function save(doc: ProductDocument): Promise<void> {
  try {
    await doc.save();
  } catch (err) {
    throw conflictFor(err) ?? err;
  }
}

async function assertActiveCategory(categoryId: string): Promise<void> {
  if (!(await Category.exists({ _id: categoryId, status: 'active' }))) {
    throw invalid('body.categoryId', 'Category not found or archived.');
  }
}

// The multikey unique index cannot see duplicates inside a single product, so they are rejected here.
function assertDistinctSkus(skus: string[]): void {
  if (new Set(skus).size !== skus.length)
    throw invalid('body.variants', 'Variant SKUs must be unique within a product.');
}

async function uniqueSlug(base: string): Promise<string> {
  for (let n = 1; n <= 50; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    if (!(await Product.exists({ slug: candidate }))) return candidate;
  }
  throw new AppError(409, 'CONFLICT', 'Could not generate a unique slug; please provide one.');
}

async function loadProduct(id: string): Promise<ProductDocument> {
  const doc = await Product.findById(id);
  if (!doc) throw new AppError(404, 'NOT_FOUND', 'Product not found.');
  return doc;
}

export async function createProduct(input: ProductCreateInput, actorId: string): Promise<ProductLean> {
  await assertActiveCategory(input.categoryId);
  assertDistinctSkus(input.variants.map((v) => v.sku));

  let slug: string;
  if (input.slug) {
    if (await Product.exists({ slug: input.slug })) throw new AppError(409, 'CONFLICT', 'This slug is already in use.');
    slug = input.slug;
  } else {
    slug = await uniqueSlug(slugify(input.name));
  }

  const doc = new Product({
    name: input.name,
    slug,
    shortDescription: input.shortDescription,
    description: input.description ?? '',
    categoryId: input.categoryId,
    images: input.images ?? [],
    attributes: input.attributes ?? [],
    featured: input.featured ?? false,
    bestseller: input.bestseller ?? false,
    allowBackorder: input.allowBackorder ?? false,
    seoTitle: input.seoTitle,
    seoDescription: input.seoDescription,
    // Always starts as a draft: publishing is a deliberate, validated step.
    status: 'draft',
    variants: input.variants.map((v) => ({
      sku: v.sku,
      options: v.options ?? [],
      price: v.price,
      salePrice: v.salePrice ?? null,
      stock: v.initialStock,
      lowStockThreshold: v.lowStockThreshold ?? 5,
    })),
  });
  await save(doc);
  for (const variant of doc.variants) await recordInitialStock(doc, variant, actorId);
  return toLean(doc);
}

export async function updateProduct(id: string, patch: ProductUpdateInput): Promise<ProductLean> {
  const doc = await loadProduct(id);
  if (patch.categoryId) await assertActiveCategory(patch.categoryId);
  if (patch.slug && patch.slug !== doc.slug && (await Product.exists({ slug: patch.slug }))) {
    throw new AppError(409, 'CONFLICT', 'This slug is already in use.');
  }
  doc.set(patch);
  await save(doc);
  return toLean(doc);
}

export async function setStatus(id: string, status: 'published' | 'draft' | 'archived'): Promise<ProductLean> {
  const doc = await loadProduct(id);
  if (status === 'published') {
    const problems: { field: string; message: string }[] = [];
    if (doc.images.length === 0)
      problems.push({ field: 'images', message: 'Add at least one image before publishing.' });
    if (!doc.variants.some((v) => v.isActive))
      problems.push({ field: 'variants', message: 'At least one active variant is required.' });
    if (!(await Category.exists({ _id: doc.categoryId, status: 'active' })))
      problems.push({ field: 'categoryId', message: 'The category is archived.' });
    if (problems.length > 0)
      throw new AppError(400, 'VALIDATION_ERROR', 'This product is not ready to publish.', problems);
    doc.publishedAt = doc.publishedAt ?? new Date();
  }
  doc.status = status;
  await save(doc);
  return toLean(doc);
}

function assertPriceOrder(price: number, salePrice?: number | null): void {
  if (salePrice != null && salePrice >= price)
    throw invalid('body.salePrice', 'Sale price must be lower than the regular price.');
}

export async function addVariant(productId: string, input: VariantCreateInput, actorId: string): Promise<ProductLean> {
  const doc = await loadProduct(productId);
  if (doc.variants.some((v) => v.sku === input.sku))
    throw invalid('body.sku', 'This SKU already exists on the product.');
  doc.variants.push({
    sku: input.sku,
    options: input.options ?? [],
    price: input.price,
    salePrice: input.salePrice ?? null,
    stock: input.initialStock,
    lowStockThreshold: input.lowStockThreshold ?? 5,
  } as never);
  await save(doc);
  const added = doc.variants[doc.variants.length - 1]!;
  await recordInitialStock(doc, added, actorId);
  return toLean(doc);
}

export async function updateVariant(
  productId: string,
  variantId: string,
  patch: VariantUpdateInput,
): Promise<ProductLean> {
  const doc = await loadProduct(productId);
  const variant = doc.variants.find((v) => String(v._id) === variantId);
  if (!variant) throw new AppError(404, 'NOT_FOUND', 'Variant not found.');

  if (patch.sku && doc.variants.some((v) => v.sku === patch.sku && String(v._id) !== variantId)) {
    throw invalid('body.sku', 'This SKU already exists on the product.');
  }
  assertPriceOrder(patch.price ?? variant.price, patch.salePrice !== undefined ? patch.salePrice : variant.salePrice);

  Object.assign(variant, patch);
  if (doc.status === 'published' && !doc.variants.some((v) => v.isActive)) {
    throw new AppError(
      400,
      'BAD_REQUEST',
      'A published product needs at least one active variant. Unpublish it first.',
    );
  }
  await save(doc);
  return toLean(doc);
}

export async function getAdminProduct(id: string): Promise<ProductLean> {
  const product = await Product.findById(id).lean<ProductLean>();
  if (!product) throw new AppError(404, 'NOT_FOUND', 'Product not found.');
  return product;
}

export async function listAdminProducts(query: AdminProductListQuery) {
  const filter: Record<string, unknown> = {};
  if (query.status) filter.status = query.status;
  if (query.categoryId) filter.categoryId = query.categoryId;
  if (query.q) {
    const rx = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ name: rx }, { slug: rx }, { 'variants.sku': rx }];
  }
  const [items, total] = await Promise.all([
    Product.find(filter)
      .sort({ updatedAt: -1, _id: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean<ProductLean[]>(),
    Product.countDocuments(filter),
  ]);
  return { items, pagination: pageMeta(query.page, query.limit, total) };
}
