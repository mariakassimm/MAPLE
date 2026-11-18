import { effectivePrice, isOnSale } from '../../common/money';
import type { IVariant, ProductLean } from './product.model';

interface CategoryRef {
  id: string;
  name: string;
  slug: string;
}

const sellable = (p: ProductLean, v: IVariant) => v.isActive && (p.allowBackorder || v.stock > 0);

function colors(p: ProductLean): string[] {
  const seen = new Map<string, string>();
  for (const v of p.variants) {
    if (!v.isActive) continue;
    for (const o of v.options)
      if (o.name === 'color' && !seen.has(o.value.toLowerCase())) seen.set(o.value.toLowerCase(), o.value);
  }
  return [...seen.values()];
}

// Public DTOs deliberately omit exact stock, reserved counts, internal status and timestamps of edits.
/** `newIds` is the current set of new arrivals (see newArrivals.ts); the badge is simply membership in it. */
export function toProductCard(p: ProductLean, category: CategoryRef | null, newIds: ReadonlySet<string>) {
  const active = p.variants.filter((v) => v.isActive);
  const cheapest = [...active].sort(
    (a, b) => effectivePrice(a.price, a.salePrice) - effectivePrice(b.price, b.salePrice),
  )[0];
  return {
    id: String(p._id),
    slug: p.slug,
    name: p.name,
    shortDescription: p.shortDescription ?? null,
    category,
    images: p.images.slice(0, 2),
    currency: 'PKR' as const,
    price: cheapest ? effectivePrice(cheapest.price, cheapest.salePrice) : null,
    compareAtPrice: cheapest && isOnSale(cheapest.price, cheapest.salePrice) ? cheapest.price : null,
    hasPriceRange: p.priceMin !== p.priceMax,
    colors: colors(p),
    inStock: active.some((v) => sellable(p, v)),
    // Lets a listing offer one-tap add only when there is nothing to choose: exactly one active, sellable variant.
    quickAddVariantId: active.length === 1 && sellable(p, active[0]!) ? String(active[0]!._id) : null,
    // Only real, approved reviews ever produce a rating; with none, the key is null (never a made-up number).
    rating: p.ratingCount ? { average: p.ratingAverage ?? 0, count: p.ratingCount } : null,
    featured: p.featured,
    bestseller: p.bestseller,
    isNew: newIds.has(String(p._id)),
  };
}

export function toProductDetail(p: ProductLean, category: CategoryRef | null, newIds: ReadonlySet<string>) {
  return {
    ...toProductCard(p, category, newIds),
    description: p.description,
    images: p.images,
    attributes: p.attributes,
    seo: { title: p.seoTitle ?? null, description: p.seoDescription ?? null },
    publishedAt: p.publishedAt ?? null,
    variants: p.variants
      .filter((v) => v.isActive)
      .map((v) => ({
        id: String(v._id),
        sku: v.sku,
        options: v.options,
        price: effectivePrice(v.price, v.salePrice),
        compareAtPrice: isOnSale(v.price, v.salePrice) ? v.price : null,
        inStock: sellable(p, v),
        lowStock: v.stock > 0 && v.stock <= v.lowStockThreshold,
      })),
  };
}

export function toAdminProduct(p: ProductLean) {
  return {
    id: String(p._id),
    name: p.name,
    slug: p.slug,
    status: p.status,
    categoryId: String(p.categoryId),
    shortDescription: p.shortDescription ?? null,
    description: p.description,
    featured: p.featured,
    bestseller: p.bestseller,
    allowBackorder: p.allowBackorder,
    images: p.images,
    attributes: p.attributes,
    seo: { title: p.seoTitle ?? null, description: p.seoDescription ?? null },
    priceMin: p.priceMin,
    priceMax: p.priceMax,
    publishedAt: p.publishedAt ?? null,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    variants: p.variants.map((v) => ({
      id: String(v._id),
      sku: v.sku,
      options: v.options,
      price: v.price,
      salePrice: v.salePrice ?? null,
      available: v.stock,
      reserved: v.reserved,
      lowStockThreshold: v.lowStockThreshold,
      isActive: v.isActive,
    })),
  };
}

export const toAdminListItem = (p: ProductLean) => ({
  id: String(p._id),
  name: p.name,
  slug: p.slug,
  status: p.status,
  categoryId: String(p.categoryId),
  image: p.images[0] ?? null,
  featured: p.featured,
  bestseller: p.bestseller,
  variantCount: p.variants.length,
  totalAvailable: p.variants.reduce((sum, v) => sum + v.stock, 0),
  priceMin: p.priceMin,
  priceMax: p.priceMax,
  updatedAt: p.updatedAt,
});
