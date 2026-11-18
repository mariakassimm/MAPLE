import type { SortOrder } from 'mongoose';
import { AppError } from '../../common/errors';
import { pageMeta } from '../../common/pagination';
import { escapeRegex } from '../../common/text';
import { Category, type CategoryLean } from '../categories/category.model';
import { Product, type ProductLean } from './product.model';
import { newArrivalIds, newArrivalSet } from './newArrivals';
import { NEW_ARRIVAL_DAYS } from './product.constants';
import type { ProductListQuery } from './product.schemas';
import { toProductCard, toProductDetail } from './product.serializer';

const SORTS: Record<ProductListQuery['sort'], Record<string, SortOrder>> = {
  featured: { featured: -1, publishedAt: -1, _id: -1 },
  newest: { publishedAt: -1, _id: -1 },
  price_asc: { priceMin: 1, _id: 1 },
  price_desc: { priceMin: -1, _id: -1 },
  name_asc: { name: 1, _id: 1 },
};

const ref = (c: CategoryLean) => ({ id: String(c._id), name: c.name, slug: c.slug });

type Scope = { category?: string; new?: boolean };

/**
 * The one place that decides which products a shopper may see for a given scope. Both the product list and the filter
 * bounds (facets) start from it, so a count, a price range and a grid can never describe different sets of products.
 * Only published products in active categories are ever visible (FR-CAT-005). `empty` means the scope matches nothing
 * (for example an unknown category slug), so callers can answer with an empty result instead of an error.
 */
async function scopeClauses(scope: Scope) {
  const categories = await Category.find({ status: 'active' }).lean<CategoryLean[]>();
  const categoryIds = categories.map((c) => c._id);
  const newIds = await newArrivalIds(categoryIds);
  const clauses: Record<string, unknown>[] = [{ status: 'published', categoryId: { $in: categoryIds } }];
  let empty = false;
  if (scope.category) {
    const match = categories.find((c) => c.slug === scope.category);
    if (match) clauses.push({ categoryId: match._id });
    else empty = true;
  }
  if (scope.new) clauses.push({ _id: { $in: newIds } });
  return { categories, clauses, empty, newIds: new Set(newIds.map(String)) };
}

export async function listProducts(q: ProductListQuery) {
  const { categories, clauses, empty, newIds } = await scopeClauses(q);
  const byId = new Map(categories.map((c) => [String(c._id), c]));
  if (empty) return { items: [], pagination: pageMeta(q.page, q.limit, 0) };

  // A reversed range (min above max) is put the right way round rather than matching nothing.
  let { minPrice, maxPrice } = q;
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice)
    [minPrice, maxPrice] = [maxPrice, minPrice];
  // A product matches a price range when any of its variants can: its [min, max] interval overlaps the range.
  if (minPrice !== undefined) clauses.push({ priceMax: { $gte: minPrice } });
  if (maxPrice !== undefined) clauses.push({ priceMin: { $lte: maxPrice } });
  if (q.availability === 'in_stock') {
    clauses.push({
      $or: [{ allowBackorder: true }, { variants: { $elemMatch: { isActive: true, stock: { $gt: 0 } } } }],
    });
  }
  if (q.color) {
    clauses.push({
      variants: {
        $elemMatch: {
          isActive: true,
          options: { $elemMatch: { name: 'color', value: { $regex: `^${escapeRegex(q.color)}$`, $options: 'i' } } },
        },
      },
    });
  }
  if (q.featured !== undefined) clauses.push({ featured: q.featured });
  if (q.bestseller !== undefined) clauses.push({ bestseller: q.bestseller });
  if (q.q) {
    const rx = new RegExp(escapeRegex(q.q), 'i');
    clauses.push({ $or: [{ name: rx }, { shortDescription: rx }, { 'variants.sku': rx }] });
  }

  const filter = { $and: clauses };
  const [products, total] = await Promise.all([
    Product.find(filter)
      .sort(SORTS[q.sort])
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .lean<ProductLean[]>(),
    Product.countDocuments(filter),
  ]);
  return {
    items: products.map((p) => {
      const c = byId.get(String(p.categoryId));
      return toProductCard(p, c ? ref(c) : null, newIds);
    }),
    pagination: pageMeta(q.page, q.limit, total),
  };
}

export async function getProductBySlug(slug: string) {
  const product = await Product.findOne({ slug, status: 'published' }).lean<ProductLean>();
  const category = product
    ? await Category.findOne({ _id: product.categoryId, status: 'active' }).lean<CategoryLean>()
    : null;
  // Draft, archived and archived-category products look identical to non-existent ones.
  if (!product || !category) throw new AppError(404, 'NOT_FOUND', 'Product not found.');

  const related = await Product.find({ status: 'published', categoryId: product.categoryId, _id: { $ne: product._id } })
    .sort({ featured: -1, publishedAt: -1 })
    .limit(4)
    .lean<ProductLean[]>();

  const newIds = await newArrivalSet();
  return {
    product: toProductDetail(product, ref(category), newIds),
    related: related.map((p) => toProductCard(p, ref(category), newIds)),
  };
}

// Drives the filter controls: the real price bounds and colours for the products in this scope (a collection, or new
// arrivals), so the slider never offers a range that has no products in it.
export async function getFacets(scope: Scope = {}) {
  const { clauses, empty } = await scopeClauses(scope);
  const base = { $and: clauses };
  if (empty) return { currency: 'PKR', priceRange: null, colors: [], newArrivalDays: NEW_ARRIVAL_DAYS };
  const [price] = await Product.aggregate<{ min: number; max: number }>([
    { $match: { ...base, priceMin: { $gt: 0 } } },
    { $group: { _id: null, min: { $min: '$priceMin' }, max: { $max: '$priceMax' } } },
  ]);
  const colors = await Product.aggregate<{ _id: string; label: string; count: number }>([
    { $match: base },
    { $unwind: '$variants' },
    { $match: { 'variants.isActive': true } },
    { $unwind: '$variants.options' },
    { $match: { 'variants.options.name': 'color' } },
    {
      $group: {
        _id: { $toLower: '$variants.options.value' },
        label: { $first: '$variants.options.value' },
        products: { $addToSet: '$_id' },
      },
    },
    { $project: { label: 1, count: { $size: '$products' } } },
    { $sort: { label: 1 } },
  ]);
  return {
    currency: 'PKR',
    priceRange: price ? { min: price.min, max: price.max } : null,
    colors: colors.map((c) => ({ value: c.label, count: c.count })),
    newArrivalDays: NEW_ARRIVAL_DAYS,
  };
}
