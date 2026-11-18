import { createHash } from 'crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { adminClient, makeCategory, makeProduct, seedStore, type AdminClient } from '../factories';
import { clearDb, startTestDb, stopTestDb } from '../helpers';

const app = createApp();

describe('image upload signing', () => {
  let admin: AdminClient;
  beforeAll(startTestDb);
  afterAll(stopTestDb);
  beforeEach(async () => {
    await clearDb();
    admin = await adminClient(app);
  });

  it('signs one folder at a time without ever returning the secret', async () => {
    const res = await admin.post('/admin/media/signature', { folder: 'products' });
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d).toMatchObject({ cloudName: 'demo-cloud', apiKey: '123456789012345', uploadUrl: 'https://api.cloudinary.com/v1_1/demo-cloud/image/upload' });
    expect(d.params).toMatchObject({ folder: 'maple/products', allowed_formats: 'jpg,jpeg,png,webp,avif' });
    expect(Math.abs(d.params.timestamp - Date.now() / 1000)).toBeLessThan(10);
    const expected = createHash('sha1').update(`allowed_formats=jpg,jpeg,png,webp,avif&folder=maple/products&timestamp=${d.params.timestamp}test-cloudinary-secret`).digest('hex');
    expect(d.signature).toBe(expected);
    expect(JSON.stringify(res.body)).not.toContain('test-cloudinary-secret');
  });

  it('rejects other folders and unknown fields', async () => {
    expect((await admin.post('/admin/media/signature', { folder: 'secrets' })).status).toBe(400);
    expect((await admin.post('/admin/media/signature', { folder: 'products', public_id: 'x' })).status).toBe(400);
    expect((await admin.post('/admin/media/signature', {})).status).toBe(400);
  });

  it('is open to catalogue and content editors only', async () => {
    const pm = await adminClient(app, 'pm@example.com', 'product_manager');
    const om = await adminClient(app, 'om@example.com', 'order_manager');
    expect((await pm.post('/admin/media/signature', { folder: 'content' })).status).toBe(200);
    expect((await om.post('/admin/media/signature', { folder: 'content' })).status).toBe(403);
    expect((await request(app).post('/api/v1/admin/media/signature').send({ folder: 'products' })).status).toBe(401);
    expect((await pm.agent.post('/api/v1/admin/media/signature').send({ folder: 'products' })).status).toBe(403); // no CSRF token
  });
});

describe('sitemap', () => {
  let admin: AdminClient;
  beforeAll(startTestDb);
  afterAll(stopTestDb);
  beforeEach(async () => {
    await clearDb();
    admin = await adminClient(app);
  });

  it('lists only what shoppers can actually see', async () => {
    const { product } = await seedStore(admin);
    const gone = await makeCategory(admin, 'Retired');
    await makeProduct(admin, gone.id, { name: 'Hidden Item', variants: [{ sku: 'HID-1' }] });
    await admin.patch(`/admin/categories/${gone.id}`, { status: 'archived' });
    const cat = (await admin.get('/admin/categories')).body.data.categories.find((c: { slug: string }) => c.slug === 'handbags');
    await makeProduct(admin, cat.id, { name: 'Draft Piece', publish: false, variants: [{ sku: 'DRF-1' }] });
    await admin.post('/admin/pages', { slug: 'about', title: 'About', published: true });
    await admin.post('/admin/pages', { slug: 'secret', title: 'Secret' });

    const res = await request(app).get('/api/v1/seo/sitemap.xml');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/xml/);
    expect(res.headers['cache-control']).toMatch(/max-age=3600/);
    const locs = [...res.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toEqual(expect.arrayContaining(['http://localhost:5173/', 'http://localhost:5173/shop', 'http://localhost:5173/collections/handbags', `http://localhost:5173/products/${product.slug}`, 'http://localhost:5173/pages/about']));
    expect(locs.join(' ')).not.toMatch(/retired|hidden-item|draft-piece|secret/);
    expect(res.text).toMatch(/<lastmod>\d{4}-\d{2}-\d{2}T/);
  });
});
