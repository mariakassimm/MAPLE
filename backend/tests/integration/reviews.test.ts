import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { adminClient, placeDeliveredOrder, seedStore, type AdminClient } from '../factories';
import { clearDb, createUser, loginAs, startTestDb, stopTestDb } from '../helpers';

const app = createApp();

describe('reviews', () => {
  let admin: AdminClient;
  let v1: string;
  let slug: string;

  beforeAll(startTestDb);
  afterAll(stopTestDb);
  beforeEach(async () => {
    await clearDb();
    admin = await adminClient(app);
    const seeded = await seedStore(admin);
    v1 = seeded.v1;
    slug = seeded.product.slug;
  });

  const customer = async (email: string, name: string) => {
    await createUser({ email, name });
    const s = await loginAs(app, email);
    return { ...s, review: (body: object) => s.agent.post('/api/v1/account/reviews').set('X-CSRF-Token', s.csrf).send(body) };
  };
  const buyer = async (email = 'ayesha@example.com', name = 'Ayesha Khan') => {
    const c = await customer(email, name);
    await placeDeliveredOrder(app, admin, v1, { session: c });
    return c;
  };
  const good = { productSlug: '', rating: 5, title: 'Beautiful', body: 'Lovely leather and the stitching is perfect.' };
  const publicList = () => request(app).get(`/api/v1/products/${slug}/reviews`);
  const card = async () => (await request(app).get('/api/v1/products?q=tote')).body.data.items[0];

  it('only lets customers who received the product review it, once', async () => {
    const stranger = await customer('stranger@example.com', 'Sam Stranger');
    expect((await stranger.review({ ...good, productSlug: slug })).status).toBe(403);
    expect((await request(app).post('/api/v1/account/reviews').send({ ...good, productSlug: slug })).status).toBe(401);

    const ayesha = await buyer();
    expect((await ayesha.agent.post('/api/v1/account/reviews').send({ ...good, productSlug: slug })).status).toBe(403); // no CSRF
    const created = await ayesha.review({ ...good, productSlug: slug });
    expect(created.status).toBe(201);
    expect(created.body.data.review.status).toBe('pending');
    expect((await ayesha.review({ ...good, productSlug: slug })).status).toBe(409);
    expect((await ayesha.review({ ...good, productSlug: 'no-such-product' })).status).toBe(404);
  });

  it('rejects bad ratings and empty text', async () => {
    const ayesha = await buyer();
    for (const bad of [{ rating: 6 }, { rating: 0 }, { rating: 4.5 }, { body: 'short' }, { extra: true }]) {
      expect((await ayesha.review({ ...good, productSlug: slug, ...bad })).status).toBe(400);
    }
  });

  it('hides pending reviews, then shows approved ones with a first name and initial only', async () => {
    const ayesha = await buyer();
    const { review } = (await ayesha.review({ ...good, productSlug: slug })).body.data;
    expect((await publicList()).body.data).toMatchObject({ items: [], summary: { count: 0, average: 0 } });
    expect((await card()).rating).toBeNull();

    expect((await admin.patch(`/admin/reviews/${review.id}`, { status: 'approved' })).status).toBe(200);
    const list = (await publicList()).body.data;
    expect(list.summary).toMatchObject({ count: 1, average: 5, distribution: { '5': 1, '1': 0 } });
    expect(list.items[0]).toMatchObject({ rating: 5, title: 'Beautiful', displayName: 'Ayesha K.', verifiedPurchase: true });
    expect(JSON.stringify(list)).not.toMatch(/Khan|ayesha@|userId|orderId/);
    expect((await card()).rating).toEqual({ average: 5, count: 1 });
  });

  it('keeps the average honest across several reviews and when one is withdrawn', async () => {
    const a = await buyer('a@example.com', 'Ayesha Khan');
    const b = await buyer('b@example.com', 'Bilal Ahmed');
    const ra = (await a.review({ ...good, productSlug: slug, rating: 5 })).body.data.review.id;
    const rb = (await b.review({ ...good, productSlug: slug, rating: 2 })).body.data.review.id;
    await admin.patch(`/admin/reviews/${ra}`, { status: 'approved' });
    await admin.patch(`/admin/reviews/${rb}`, { status: 'approved' });
    expect((await card()).rating).toEqual({ average: 3.5, count: 2 });
    await admin.patch(`/admin/reviews/${rb}`, { status: 'hidden' });
    expect((await card()).rating).toEqual({ average: 5, count: 1 });
    await admin.patch(`/admin/reviews/${ra}`, { status: 'rejected' });
    expect((await card()).rating).toBeNull();
  });

  it('features only approved reviews, and withdrawing one un-features it', async () => {
    const a = await buyer();
    const id = (await a.review({ ...good, productSlug: slug })).body.data.review.id;
    expect((await admin.patch(`/admin/reviews/${id}`, { featured: true })).status).toBe(400);
    expect((await admin.patch(`/admin/reviews/${id}`, { status: 'approved', featured: true })).body.data.review).toMatchObject({ status: 'approved', featured: true });
    expect((await admin.patch(`/admin/reviews/${id}`, { status: 'hidden' })).body.data.review.featured).toBe(false);
  });

  it('lists reviews for moderators with product names and filters by status', async () => {
    const a = await buyer();
    await a.review({ ...good, productSlug: slug });
    const pending = await admin.get('/admin/reviews?status=pending');
    expect(pending.body.data.items[0]).toMatchObject({ productName: 'Tote', productSlug: slug, status: 'pending', displayName: 'Ayesha K.' });
    expect((await admin.get('/admin/reviews?status=approved')).body.data.items).toEqual([]);
    expect((await admin.get('/admin/reviews?status=bogus')).status).toBe(400);
  });

  it('is limited to roles with reviews:moderate', async () => {
    const support = await adminClient(app, 'support@example.com', 'support_staff');
    const om = await adminClient(app, 'om@example.com', 'order_manager');
    expect((await support.get('/admin/reviews')).status).toBe(200);
    expect((await om.get('/admin/reviews')).status).toBe(403);
    expect((await request(app).get('/api/v1/admin/reviews')).status).toBe(401);
  });

  it('404s reviews for unpublished or unknown products', async () => {
    expect((await request(app).get('/api/v1/products/nope/reviews')).status).toBe(404);
  });
});
