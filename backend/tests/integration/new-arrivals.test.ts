import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { NEW_ARRIVAL_PER_CATEGORY } from '../../src/modules/products/product.constants';
import { Product } from '../../src/modules/products/product.model';
import { adminClient, makeCategory, makeProduct } from '../factories';
import { clearDb, startTestDb, stopTestDb } from '../helpers';

const app = createApp();
const get = (path: string) => request(app).get(`/api/v1${path}`);
type Card = { name: string; slug: string; isNew: boolean };

describe('new arrivals: one rule for the badge, the page and the home row', () => {
  const created: { name: string; slug: string }[] = [];
  beforeAll(async () => {
    await startTestDb();
    await clearDb();
    const admin = await adminClient(app);
    const cat = await makeCategory(admin, 'Handbags');
    for (let i = 1; i <= 13; i++) {
      const p = await makeProduct(admin, cat.id, { name: `Bag ${String(i).padStart(2, '0')}`, variants: [{ sku: `BAG-${i}`, price: 1_000_000, stock: 5 }] });
      created.push({ name: `Bag ${String(i).padStart(2, '0')}`, slug: p.slug });
      await new Promise((r) => setTimeout(r, 5)); // distinct publish times
    }
    await makeProduct(admin, cat.id, { name: 'Unpublished', publish: false, variants: [{ sku: 'DRAFT', stock: 1 }] });
  });
  afterAll(stopTestDb);

  const newest = () => created.slice(-NEW_ARRIVAL_PER_CATEGORY).map((c) => c.name).sort();

  it('badges only the newest products, not everything published recently', async () => {
    const items = (await get('/products?limit=48')).body.data.items as Card[];
    expect(items).toHaveLength(13);
    expect(items.filter((i) => i.isNew).map((i) => i.name).sort()).toEqual(newest());
  });

  it('shows exactly the badged products on the New Arrivals page', async () => {
    const page = (await get('/products?new=true&limit=48')).body.data;
    expect((page.items as Card[]).map((i) => i.name).sort()).toEqual(newest());
    expect(page.pagination.total).toBe(NEW_ARRIVAL_PER_CATEGORY);
    expect((page.items as Card[]).every((i) => i.isNew)).toBe(true);
  });

  it('feeds the home "Just arrived" row from the same set, newest first', async () => {
    const row = (await get('/content/home')).body.data.newArrivals as Card[];
    expect(row).toHaveLength(NEW_ARRIVAL_PER_CATEGORY);
    expect(row.every((r) => r.isNew)).toBe(true);
    expect(row[0]!.name).toBe('Bag 13');
  });

  it('agrees on the product page, and never badges unpublished or old products', async () => {
    expect((await get(`/products/${created[12]!.slug}`)).body.data.product.isNew).toBe(true);
    expect((await get(`/products/${created[0]!.slug}`)).body.data.product.isNew).toBe(false);
    // A product published long ago is not new, even if it is among the latest few.
    await Product.updateMany({}, { $set: { publishedAt: new Date(Date.now() - 40 * 86_400_000) } });
    expect(((await get('/products?limit=48')).body.data.items as Card[]).some((i) => i.isNew)).toBe(false);
    expect((await get('/products?new=true')).body.data.items).toEqual([]);
  });
});
