import type { Types } from 'mongoose';
import { env } from '../../config/env';
import { AppError, isDuplicateKeyError } from '../../common/errors';
import { Category, type CategoryLean } from '../categories/category.model';
import { Product, type ProductLean } from '../products/product.model';
import { newArrivalIds } from '../products/newArrivals';
import { toProductCard } from '../products/product.serializer';
import { Review, type ReviewLean } from '../reviews/review.model';
import { Content, Page, type ContentKey, type PageLean } from './content.model';

// Starting copy from the MAPLE brief. Images are null on purpose: until real photography is uploaded the storefront
// shows its placeholder art, and nothing here pretends to be a product or a customer.
export const DEFAULTS = {
  site: {
    announcement: { text: 'DISCOVER THE ART OF EVERYDAY LUXURY', isActive: true },
    contact: {} as Record<string, string>,
    social: {} as Record<string, string>,
    footerStatement: 'MAPLE is an independent house of considered pieces, made to be lived in.',
  },
  home: {
    hero: {
      label: 'THE MAPLE COLLECTION',
      headline: 'Elegance, Without Effort.',
      subheadline: 'Discover thoughtfully curated pieces designed to elevate the everyday.',
      ctaLabel: 'EXPLORE COLLECTION',
      ctaUrl: '/shop',
      image: null,
      imageMobile: null,
      videoUrl: null,
      videoPoster: null,
    },
    collections: [] as { title?: string; description?: string; url?: string; image?: unknown; categorySlug?: string }[],
    brandStory: {
      headline: 'Beauty in Every Detail.',
      body: 'Every MAPLE piece begins with restraint: the right proportions, honest materials and finishing you notice only when you look closely.',
      image: null,
    },
    editorial: {
      headline: 'The Quiet Edit',
      body: 'A closer look at the pieces we reach for every day.',
      linkLabel: 'Discover more',
      linkUrl: '/shop',
      image: null,
    },
    newsletter: { headline: 'Stay in the know', subheadline: 'New arrivals and stories, rarely and thoughtfully.' },
    testimonialsEnabled: true,
  },
};

type Sections<K extends ContentKey> = (typeof DEFAULTS)[K];

/** Stored sections replace the default section of the same name; anything never edited falls back to the defaults. */
export async function getContent<K extends ContentKey>(key: K): Promise<Sections<K>> {
  const stored = await Content.findOne({ key }).lean();
  return { ...DEFAULTS[key], ...((stored?.data ?? {}) as object) } as Sections<K>;
}

export async function updateContent(key: ContentKey, patch: Record<string, unknown>, actorId: string) {
  const stored = await Content.findOne({ key }).lean();
  const data = { ...((stored?.data ?? {}) as object), ...patch };
  await Content.updateOne({ key }, { $set: { data, updatedBy: actorId } }, { upsert: true });
  return getContent(key);
}

export async function publicSite() {
  const site = await getContent('site');
  // demoMode lets the storefront and admin say so plainly; knowing it is on gives nobody anything they could not see at checkout.
  return {
    ...site,
    announcement: site.announcement.isActive && site.announcement.text ? site.announcement.text : null,
    demoMode: env.DEMO_MODE,
  };
}

const excerpt = (s: string, max = 280) => (s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`);

/** Everything the homepage needs in one request. Every product and review shown is real; empty sections stay empty. */
export async function assembleHome() {
  const [home, categories] = await Promise.all([
    getContent('home'),
    Category.find({ status: 'active' }).sort({ displayOrder: 1, name: 1 }).lean<CategoryLean[]>(),
  ]);
  const bySlug = new Map(categories.map((c) => [c.slug, c]));
  const byId = new Map(categories.map((c) => [String(c._id), c]));
  const ref = (id: Types.ObjectId) => {
    const c = byId.get(String(id));
    return c ? { id: String(c._id), name: c.name, slug: c.slug } : null;
  };

  const configured = home.collections.flatMap((item) => {
    if (!item.categorySlug)
      return [{ title: item.title!, description: item.description ?? '', url: item.url!, image: item.image ?? null }];
    const c = bySlug.get(item.categorySlug);
    return c
      ? [
          {
            title: item.title || c.name,
            description: item.description ?? c.description ?? '',
            url: item.url || `/collections/${c.slug}`,
            image: item.image ?? c.image ?? null,
          },
        ]
      : [];
  });
  // With nothing configured, the first categories (in the admin's display order) are the featured collections.
  const collections =
    configured.length > 0
      ? configured
      : categories
          .slice(0, 4)
          .map((c) => ({
            title: c.name,
            description: c.description ?? '',
            url: `/collections/${c.slug}`,
            image: c.image ?? null,
          }));

  const live = { status: 'published', categoryId: { $in: categories.map((c) => c._id) } };
  // "Just arrived" is the same set the New badge and the New Arrivals page use (see products/newArrivals.ts).
  const newIds = await newArrivalIds(categories.map((c) => c._id));
  const newSet = new Set(newIds.map(String));
  const card = (p: ProductLean) => toProductCard(p, ref(p.categoryId), newSet);
  const [fresh, best] = await Promise.all([
    Product.find({ _id: { $in: newIds } })
      .sort({ publishedAt: -1, _id: -1 })
      .limit(8)
      .lean<ProductLean[]>(),
    Product.find({ ...live, bestseller: true })
      .sort({ publishedAt: -1, _id: -1 })
      .limit(8)
      .lean<ProductLean[]>(),
  ]);

  let testimonials: {
    displayName: string;
    rating: number;
    title: string | null;
    body: string;
    product: { name: string; slug: string } | null;
  }[] = [];
  if (home.testimonialsEnabled) {
    const reviews = await Review.find({ status: 'approved', featured: true })
      .sort({ createdAt: -1 })
      .limit(6)
      .lean<ReviewLean[]>();
    const products = await Product.find({ _id: { $in: reviews.map((r) => r.productId) }, status: 'published' })
      .select('name slug')
      .lean<{ _id: Types.ObjectId; name: string; slug: string }[]>();
    const byProduct = new Map(products.map((p) => [String(p._id), p]));
    testimonials = reviews.map((r) => ({
      displayName: r.displayName,
      rating: r.rating,
      title: r.title ?? null,
      body: excerpt(r.body),
      product: byProduct.get(String(r.productId))
        ? { name: byProduct.get(String(r.productId))!.name, slug: byProduct.get(String(r.productId))!.slug }
        : null,
    }));
  }

  return {
    hero: home.hero,
    collections,
    newArrivals: fresh.map(card),
    bestsellers: best.map(card),
    brandStory: home.brandStory,
    editorial: home.editorial,
    testimonials,
    newsletter: home.newsletter,
  };
}

// ---------------------------------------------------------------- pages
const pageDto = (p: PageLean) => ({
  id: String(p._id),
  slug: p.slug,
  title: p.title,
  body: p.body,
  published: p.published,
  seoTitle: p.seoTitle ?? null,
  seoDescription: p.seoDescription ?? null,
  updatedAt: p.updatedAt,
});

export async function getPublicPage(slug: string) {
  const page = await Page.findOne({ slug, published: true }).lean<PageLean>();
  if (!page) throw new AppError(404, 'NOT_FOUND', 'Page not found.');
  const { id: _id, published: _p, ...rest } = pageDto(page);
  return rest;
}

export const listPublicPages = async () =>
  (await Page.find({ published: true }).sort({ title: 1 }).select('slug title').lean<PageLean[]>()).map((p) => ({
    slug: p.slug,
    title: p.title,
  }));
export const listAdminPages = async () => (await Page.find().sort({ title: 1 }).lean<PageLean[]>()).map(pageDto);

export async function createPage(input: {
  slug: string;
  title: string;
  body?: string;
  published?: boolean;
  seoTitle?: string;
  seoDescription?: string;
}) {
  try {
    return pageDto((await Page.create(input)).toObject());
  } catch (err) {
    if (isDuplicateKeyError(err)) throw new AppError(409, 'CONFLICT', 'A page with this slug already exists.');
    throw err;
  }
}

export async function updatePage(id: string, patch: Record<string, unknown>) {
  const page = await Page.findById(id);
  if (!page) throw new AppError(404, 'NOT_FOUND', 'Page not found.');
  page.set(patch);
  try {
    await page.save();
  } catch (err) {
    if (isDuplicateKeyError(err)) throw new AppError(409, 'CONFLICT', 'A page with this slug already exists.');
    throw err;
  }
  return pageDto(page.toObject());
}
