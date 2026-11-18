import { Router } from 'express';
import { asyncHandler } from '../../common/asyncHandler';
import { env } from '../../config/env';
import { publicCache } from '../../middleware/publicCache';
import { Category } from '../categories/category.model';
import { Page } from '../content/content.model';
import { Product } from '../products/product.model';

const xml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export const seoRouter = Router();

// Frontend routes: /, /shop, /collections/:slug, /products/:slug, /pages/:slug. Serve this from the storefront's own
// domain (proxy /sitemap.xml to it) so the URLs and the host agree.
seoRouter.get(
  '/sitemap.xml',
  publicCache(3600),
  asyncHandler(async (_req, res) => {
    const base = env.CLIENT_ORIGINS[0]!.replace(/\/+$/, '');
    const [categories, products, pages] = await Promise.all([
      Category.find({ status: 'active' }).select('slug updatedAt').lean(),
      Product.find({ status: 'published' })
        .select('slug updatedAt categoryId')
        .sort({ updatedAt: -1 })
        .limit(45_000)
        .lean(),
      Page.find({ published: true }).select('slug updatedAt').lean(),
    ]);
    const activeCats = new Set(categories.map((c) => String(c._id)));
    const entry = (path: string, lastmod?: Date) =>
      `<url><loc>${xml(base + path)}</loc>${lastmod ? `<lastmod>${lastmod.toISOString()}</lastmod>` : ''}</url>`;
    const body = [
      entry('/'),
      entry('/shop'),
      ...categories.map((c) => entry(`/collections/${c.slug}`, c.updatedAt)),
      ...products
        .filter((p) => activeCats.has(String(p.categoryId)))
        .map((p) => entry(`/products/${p.slug}`, p.updatedAt)),
      ...pages.map((p) => entry(`/pages/${p.slug}`, p.updatedAt)),
    ].join('');
    res
      .type('application/xml')
      .send(
        `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`,
      );
  }),
);
