import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { AuditLog } from '../../src/modules/audit/auditLog.model';
import { InventoryMovement } from '../../src/modules/inventory/inventoryMovement.model';
import { adminClient, IMAGE, makeCategory, makeProduct, type AdminClient } from '../factories';
import { clearDb, startTestDb, stopTestDb } from '../helpers';

const app = createApp();

describe('admin catalogue', () => {
  let admin: AdminClient;
  let categoryId: string;

  beforeAll(startTestDb);
  afterAll(stopTestDb);
  beforeEach(async () => {
    await clearDb();
    admin = await adminClient(app);
    categoryId = (await makeCategory(admin)).id;
  });

  describe('access control', () => {
    it('rejects anonymous and customer requests', async () => {
      expect((await request(app).get('/api/v1/admin/products')).status).toBe(401);
    });

    it('lets catalog:read roles list but not write', async () => {
      const support = await adminClient(app, 'support@example.com', 'support_staff');
      expect((await support.get('/admin/products')).status).toBe(200);
      expect((await support.post('/admin/products', {})).status).toBe(403);
      expect((await support.post('/admin/categories', { name: 'Nope' })).status).toBe(403);
    });

    it('lets product managers write but order managers only read', async () => {
      const om = await adminClient(app, 'om@example.com', 'order_manager');
      expect((await om.get('/admin/categories')).status).toBe(200);
      expect((await om.post('/admin/categories', { name: 'Nope' })).status).toBe(403);
      const pm = await adminClient(app, 'pm@example.com', 'product_manager');
      expect((await pm.post('/admin/categories', { name: 'Watches' })).status).toBe(201);
    });
  });

  describe('categories', () => {
    it('generates unique slugs and rejects duplicate explicit slugs', async () => {
      const second = await admin.post('/admin/categories', { name: 'Handbags' });
      expect(second.body.data.category.slug).toBe('handbags-2');
      const dup = await admin.post('/admin/categories', { name: 'Other', slug: 'handbags' });
      expect(dup.status).toBe(409);
    });

    it('rejects non-https image urls and archives via patch', async () => {
      const bad = await admin.post('/admin/categories', { name: 'Eyewear', image: { url: 'http://x.test/a.jpg', alt: 'Eyewear' } });
      expect(bad.status).toBe(400);
      const archived = await admin.patch(`/admin/categories/${categoryId}`, { status: 'archived' });
      expect(archived.body.data.category.status).toBe('archived');
    });
  });

  describe('products', () => {
    const body = () => ({
      name: 'Maple Leather Tote',
      categoryId,
      variants: [{ sku: 'tote-blk', price: 2_000_000, initialStock: 4, options: [{ name: 'Color', value: 'Black' }] }],
    });

    it('creates a draft with normalised data and logs opening stock and an audit entry', async () => {
      const res = await admin.post('/admin/products', body());
      expect(res.status).toBe(201);
      const p = res.body.data.product;
      expect(p).toMatchObject({ status: 'draft', slug: 'maple-leather-tote', priceMin: 2_000_000, priceMax: 2_000_000 });
      expect(p.variants[0]).toMatchObject({ sku: 'TOTE-BLK', available: 4, reserved: 0, options: [{ name: 'color', value: 'Black' }] });
      expect(await InventoryMovement.countDocuments({ type: 'initial' })).toBe(1);
      expect(await AuditLog.countDocuments({ action: 'product.create' })).toBe(1);
    });

    it.each([
      ['float price', { price: 10.5 }],
      ['zero price', { price: 0 }],
      ['sale price not lower', { price: 1000, salePrice: 1000 }],
      ['negative stock', { initialStock: -1 }],
      ['bad sku', { sku: 'a b' }],
    ])('rejects %s', async (_label, override) => {
      const b = body();
      Object.assign(b.variants[0]!, override);
      expect((await admin.post('/admin/products', b)).status).toBe(400);
    });

    it('rejects unknown fields (cannot create a published product directly)', async () => {
      expect((await admin.post('/admin/products', { ...body(), status: 'published' })).status).toBe(400);
    });

    it('rejects duplicate SKUs inside one product and across products', async () => {
      const b = body();
      b.variants.push({ ...b.variants[0]!, options: [{ name: 'Color', value: 'Tan' }] });
      expect((await admin.post('/admin/products', b)).status).toBe(400);

      expect((await admin.post('/admin/products', body())).status).toBe(201);
      const again = await admin.post('/admin/products', { ...body(), name: 'Another Tote' });
      expect(again.status).toBe(409);
    });

    it('requires an active category', async () => {
      expect((await admin.post('/admin/products', { ...body(), categoryId: '0'.repeat(24) })).status).toBe(400);
      await admin.patch(`/admin/categories/${categoryId}`, { status: 'archived' });
      expect((await admin.post('/admin/products', body())).status).toBe(400);
    });

    it('rejects a duplicate explicit slug', async () => {
      await admin.post('/admin/products', { ...body(), slug: 'tote' });
      const dup = await admin.post('/admin/products', { ...body(), name: 'Other Tote', slug: 'tote', variants: [{ sku: 'OTHER-1', price: 1000 }] });
      expect(dup.status).toBe(409);
    });

    it('refuses to publish without images, then publishes and unpublishes', async () => {
      const created = await admin.post('/admin/products', body());
      const id = created.body.data.product.id;

      const blocked = await admin.post(`/admin/products/${id}/publish`);
      expect(blocked.status).toBe(400);
      expect(blocked.body.error.details[0].field).toBe('images');

      await admin.patch(`/admin/products/${id}`, { images: [IMAGE] });
      const published = await admin.post(`/admin/products/${id}/publish`);
      expect(published.body.data.product.status).toBe('published');
      expect(published.body.data.product.publishedAt).toBeTruthy();

      const draft = await admin.post(`/admin/products/${id}/unpublish`);
      expect(draft.body.data.product.status).toBe('draft');
    });

    it('does not allow status changes through PATCH', async () => {
      const id = (await admin.post('/admin/products', body())).body.data.product.id;
      expect((await admin.patch(`/admin/products/${id}`, { status: 'published' })).status).toBe(400);
      expect((await admin.patch(`/admin/products/${id}`, {})).status).toBe(400);
    });

    it('updates fields and lists with filters', async () => {
      const id = (await admin.post('/admin/products', body())).body.data.product.id;
      const upd = await admin.patch(`/admin/products/${id}`, { name: 'Renamed Tote', featured: true });
      expect(upd.body.data.product).toMatchObject({ name: 'Renamed Tote', featured: true });
      const list = await admin.get('/admin/products?status=draft&q=tote-blk');
      expect(list.body.data.items).toHaveLength(1);
      expect((await admin.get('/admin/products?status=published')).body.data.items).toHaveLength(0);
    });

    it('returns 404 for unknown ids and 400 for malformed ids', async () => {
      expect((await admin.get(`/admin/products/${'0'.repeat(24)}`)).status).toBe(404);
      expect((await admin.get('/admin/products/not-an-id')).status).toBe(400);
    });
  });

  describe('variants', () => {
    it('adds variants, updates prices, and protects published products', async () => {
      const product = await makeProduct(admin, categoryId, { name: 'Wallet', variants: [{ sku: 'WAL-1', stock: 2 }] });
      const added = await admin.post(`/admin/products/${product.id}/variants`, { sku: 'wal-2', price: 900_000, initialStock: 6 });
      expect(added.status).toBe(201);
      expect(added.body.data.product.variants).toHaveLength(2);
      expect(await InventoryMovement.countDocuments({ type: 'initial' })).toBe(2);

      expect((await admin.post(`/admin/products/${product.id}/variants`, { sku: 'WAL-2', price: 1 })).status).toBe(400);

      const variantId = product.variants[0]!.id;
      const sale = await admin.patch(`/admin/products/${product.id}/variants/${variantId}`, { salePrice: 800_000 });
      expect(sale.body.data.product.priceMin).toBe(800_000);
      expect((await admin.patch(`/admin/products/${product.id}/variants/${variantId}`, { salePrice: 1_000_000 })).status).toBe(400);

      const [first, second] = added.body.data.product.variants as { id: string }[];
      expect((await admin.patch(`/admin/products/${product.id}/variants/${first!.id}`, { isActive: false })).status).toBe(200);
      const last = await admin.patch(`/admin/products/${product.id}/variants/${second!.id}`, { isActive: false });
      expect(last.status).toBe(400);
    });

    it('does not accept stock edits through the variant endpoint', async () => {
      const product = await makeProduct(admin, categoryId, { name: 'Wallet', variants: [{ sku: 'WAL-1', stock: 2 }] });
      const res = await admin.patch(`/admin/products/${product.id}/variants/${product.variants[0]!.id}`, { stock: 999 });
      expect(res.status).toBe(400);
    });
  });
});
