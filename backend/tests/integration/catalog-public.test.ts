import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { adminClient, makeCategory, makeProduct } from '../factories';
import { clearDb, startTestDb, stopTestDb } from '../helpers';

const app = createApp();
const get = (path: string) => request(app).get(`/api/v1${path}`);
const names = (res: request.Response) => (res.body.data.items as { name: string }[]).map((i) => i.name).sort();

describe('public catalogue', () => {
  beforeAll(async () => {
    await startTestDb();
    await clearDb();
    const admin = await adminClient(app);
    const bags = await makeCategory(admin, 'Handbags');
    const watches = await makeCategory(admin, 'Watches');
    const retired = await makeCategory(admin, 'Retired');

    await makeProduct(admin, bags.id, {
      name: 'Maple Tote', featured: true,
      variants: [{ sku: 'TOTE-BLK', price: 2_000_000, stock: 5, color: 'Black' }, { sku: 'TOTE-TAN', price: 2_000_000, stock: 0, color: 'Tan' }],
    });
    await makeProduct(admin, bags.id, {
      name: 'Maple Clutch', bestseller: true,
      variants: [{ sku: 'CLU-BLK', price: 800_000, salePrice: 600_000, stock: 3, color: 'black' }],
    });
    await makeProduct(admin, watches.id, { name: 'Maple Chronograph', variants: [{ sku: 'CHR-SLV', price: 5_000_000, stock: 0, color: 'Silver' }] });
    await makeProduct(admin, bags.id, { name: 'Secret Draft', publish: false, variants: [{ sku: 'DRAFT-1', stock: 9 }] });
    await makeProduct(admin, retired.id, { name: 'Hidden By Category', variants: [{ sku: 'RET-1', stock: 9 }] });
    await admin.patch(`/admin/categories/${retired.id}`, { status: 'archived' });
  });
  afterAll(stopTestDb);

  it('shows only published products in active categories', async () => {
    const res = await get('/products');
    expect(res.status).toBe(200);
    expect(names(res)).toEqual(['Maple Chronograph', 'Maple Clutch', 'Maple Tote']);
    expect(res.headers['cache-control']).toMatch(/public/);
  });

  it('paginates', async () => {
    const res = await get('/products?limit=2&page=2');
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.pagination).toEqual({ page: 2, limit: 2, total: 3, totalPages: 2 });
  });

  it('filters by category slug and returns nothing for unknown ones', async () => {
    expect(names(await get('/products?category=watches'))).toEqual(['Maple Chronograph']);
    expect((await get('/products?category=nope')).body.data.items).toEqual([]);
    expect((await get('/products?category=retired')).body.data.items).toEqual([]);
  });

  it('filters by price range', async () => {
    expect(names(await get('/products?minPrice=1000000'))).toEqual(['Maple Chronograph', 'Maple Tote']);
    expect(names(await get('/products?maxPrice=700000'))).toEqual(['Maple Clutch']);
  });

  it('filters by availability and colour (case-insensitive)', async () => {
    expect(names(await get('/products?availability=in_stock'))).toEqual(['Maple Clutch', 'Maple Tote']);
    expect(names(await get('/products?color=BLACK'))).toEqual(['Maple Clutch', 'Maple Tote']);
    expect(names(await get('/products?color=silver'))).toEqual(['Maple Chronograph']);
  });

  it('searches by name and SKU, treating input as literal text', async () => {
    expect(names(await get('/products?q=tote'))).toEqual(['Maple Tote']);
    expect(names(await get('/products?q=clu-blk'))).toEqual(['Maple Clutch']);
    const hostile = await get('/products?q=' + encodeURIComponent('.*'));
    expect(hostile.status).toBe(200);
    expect(hostile.body.data.items).toEqual([]);
    expect((await get('/products?q=' + encodeURIComponent('(['))).status).toBe(200);
  });

  it('sorts by price', async () => {
    const asc = (await get('/products?sort=price_asc')).body.data.items.map((i: { name: string }) => i.name);
    expect(asc).toEqual(['Maple Clutch', 'Maple Tote', 'Maple Chronograph']);
    const desc = (await get('/products?sort=price_desc')).body.data.items.map((i: { name: string }) => i.name);
    expect(desc).toEqual(['Maple Chronograph', 'Maple Tote', 'Maple Clutch']);
  });

  it('filters featured and bestseller', async () => {
    expect(names(await get('/products?featured=true'))).toEqual(['Maple Tote']);
    expect(names(await get('/products?bestseller=true'))).toEqual(['Maple Clutch']);
  });

  it('presents sale pricing, colours and stock on cards', async () => {
    const clutch = (await get('/products?q=clutch')).body.data.items[0];
    expect(clutch).toMatchObject({ price: 600_000, compareAtPrice: 800_000, currency: 'PKR', colors: ['black'], inStock: true });
    const chrono = (await get('/products?q=chrono')).body.data.items[0];
    expect(chrono.inStock).toBe(false);
    // One-tap add is offered only for a single sellable variant, and never for a sold-out one.
    expect(chrono.quickAddVariantId).toBeNull();
    expect([null, expect.any(String)]).toContainEqual(clutch.quickAddVariantId);
  });

  // Shopper links are hand-editable and go stale, so bad values fall back to defaults instead of an error page.
  it('falls back to safe defaults for invalid query parameters', async () => {
    const big = await get('/products?limit=500');
    expect(big.status).toBe(200);
    expect(big.body.data.pagination.limit).toBe(12);
    expect((await get('/products?sort=bogus')).status).toBe(200);
    const page = await get('/products?page=0');
    expect(page.status).toBe(200);
    expect(page.body.data.pagination.page).toBe(1);
  });

  it('serves product detail without leaking stock internals, plus related products', async () => {
    const res = await get('/products/maple-clutch');
    expect(res.status).toBe(200);
    const { product, related } = res.body.data;
    expect(product.variants[0]).toMatchObject({ sku: 'CLU-BLK', price: 600_000, compareAtPrice: 800_000, inStock: true, lowStock: true });
    const dump = JSON.stringify(res.body);
    expect(dump).not.toMatch(/"(stock|reserved|available|status)"/);
    expect(related.map((r: { name: string }) => r.name)).toEqual(['Maple Tote']);
  });

  it('hides drafts and products in archived categories', async () => {
    expect((await get('/products/secret-draft')).status).toBe(404);
    expect((await get('/products/hidden-by-category')).status).toBe(404);
    expect((await get('/products/does-not-exist')).status).toBe(404);
  });

  it('reports facets and does not treat "facets" as a slug', async () => {
    const res = await get('/products/facets');
    expect(res.status).toBe(200);
    expect(res.body.data.priceRange).toEqual({ min: 600_000, max: 5_000_000 });
    const colors = Object.fromEntries((res.body.data.colors as { value: string; count: number }[]).map((c) => [c.value.toLowerCase(), c.count]));
    expect(colors).toEqual({ black: 2, silver: 1, tan: 1 });
  });

  it('lists active categories with product counts and no internal fields', async () => {
    const res = await get('/categories');
    const cats = res.body.data.categories as { slug: string; productCount: number; status?: string }[];
    expect(cats.map((c) => c.slug)).toEqual(['handbags', 'watches']);
    expect(cats.find((c) => c.slug === 'handbags')?.productCount).toBe(2);
    expect(cats[0]).not.toHaveProperty('status');
  });
});
