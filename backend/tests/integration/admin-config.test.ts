import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { adminClient, seedStore, type AdminClient } from '../factories';
import { clearDb, startTestDb, stopTestDb } from '../helpers';

const app = createApp();

describe('store settings and service areas', () => {
  let admin: AdminClient;

  beforeAll(startTestDb);
  afterAll(stopTestDb);
  beforeEach(async () => {
    await clearDb();
    admin = await adminClient(app);
  });

  it('has safe defaults, validates updates, and persists changes', async () => {
    const initial = (await admin.get('/admin/settings')).body.data.settings;
    expect(initial).toMatchObject({ shipping: { flatRate: 30_000, freeShippingThreshold: null }, cod: { enabled: true, maxOrderValue: null }, maxQuantityPerLine: 10 });

    expect((await admin.patch('/admin/settings', {})).status).toBe(400);
    expect((await admin.patch('/admin/settings', { shipping: { flatRate: -5 } })).status).toBe(400);
    expect((await admin.patch('/admin/settings', { shipping: { flatRate: 12.5 } })).status).toBe(400);
    expect((await admin.patch('/admin/settings', { surprise: true })).status).toBe(400);

    const updated = await admin.patch('/admin/settings', { shipping: { flatRate: 25_000, freeShippingThreshold: 1_000_000 }, cod: { enabled: false } });
    expect(updated.body.data.settings).toMatchObject({ shipping: { flatRate: 25_000, freeShippingThreshold: 1_000_000 }, cod: { enabled: false } });
    expect((await admin.get('/admin/settings')).body.data.settings.shipping.flatRate).toBe(25_000);
  });

  it('is restricted to settings:write', async () => {
    const om = await adminClient(app, 'om@example.com', 'order_manager');
    expect((await om.get('/admin/settings')).status).toBe(403);
    expect((await om.patch('/admin/settings', { maxQuantityPerLine: 5 })).status).toBe(403);
    expect((await om.get('/admin/service-areas')).status).toBe(403);
    expect((await request(app).get('/api/v1/admin/settings')).status).toBe(401);
  });

  it('turning COD off removes it from checkout', async () => {
    const { v1 } = await seedStore(admin);
    await admin.patch('/admin/settings', { cod: { enabled: false } });
    const quote = await request(app).post('/api/v1/checkout/quote').send({ items: [{ variantId: v1, quantity: 1 }], province: 'Sindh', city: 'Karachi' });
    expect(quote.body.data.paymentMethods[0]).toMatchObject({ id: 'cod', available: false });
  });

  it('manages coverage: no duplicates, deactivation hides a city', async () => {
    const { v1 } = await seedStore(admin);
    expect((await admin.post('/admin/service-areas', { city: ' karachi ', province: 'Sindh' })).status).toBe(409);
    expect((await admin.post('/admin/service-areas', { city: 'Karachi', province: 'Punjab' })).status).toBe(201);
    expect((await admin.post('/admin/service-areas', { city: 'Nowhere', province: 'Atlantis' })).status).toBe(400);

    const areas = (await admin.get('/admin/service-areas')).body.data.areas as { id: string; city: string; province: string }[];
    const karachi = areas.find((a) => a.city === 'Karachi' && a.province === 'Sindh')!;
    const off = await admin.patch(`/admin/service-areas/${karachi.id}`, { isActive: false, couriers: { leopards: true } });
    expect(off.body.data.area).toMatchObject({ isActive: false, couriers: { tcs: true, leopards: true } });

    const quote = await request(app).post('/api/v1/checkout/quote').send({ items: [{ variantId: v1, quantity: 1 }], province: 'Sindh', city: 'Karachi' });
    expect(quote.body.data.serviceability.serviceable).toBe(false);
  });
});
