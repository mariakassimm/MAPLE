import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { adminClient, orderBody, seedStore, type AdminClient } from '../factories';
import { clearDb, createUser, loginAs, startTestDb, stopTestDb } from '../helpers';
import { randomUUID } from 'crypto';

const app = createApp();

describe('customers and support notes', () => {
  let admin: AdminClient;
  let v1: string;
  let ayeshaId: string;

  beforeAll(startTestDb);
  afterAll(stopTestDb);
  beforeEach(async () => {
    await clearDb();
    admin = await adminClient(app);
    v1 = (await seedStore(admin)).v1;
    ayeshaId = String((await createUser({ email: 'ayesha@example.com', name: 'Ayesha Khan' }))._id);
    await createUser({ email: 'sara@example.com', name: 'Sara Ali' });
    const s = await loginAs(app, 'ayesha@example.com');
    const order = () => s.agent.post('/api/v1/orders').set('Idempotency-Key', randomUUID()).set('X-CSRF-Token', s.csrf).send(orderBody([{ variantId: v1, quantity: 1 }]));
    await order();
    const second = await order();
    const orderNumber = second.body.data.order.orderNumber as string;
    await request(app).post('/api/v1/orders/cancel').send({ orderNumber, phone: '03001234567' });
  });

  it('lists registered customers with their order count and spend (cancelled orders excluded)', async () => {
    const res = await admin.get('/admin/customers');
    const byEmail = Object.fromEntries(res.body.data.items.map((c: { email: string }) => [c.email, c]));
    expect(res.body.data.pagination.total).toBe(2);
    expect(byEmail['ayesha@example.com']).toMatchObject({ name: 'Ayesha Khan', orders: 1, totalSpent: 2_030_000 });
    expect(byEmail['ayesha@example.com'].lastOrderAt).toBeTruthy();
    expect(byEmail['sara@example.com']).toMatchObject({ orders: 0, totalSpent: 0, lastOrderAt: null });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|resetToken|Hash/);
  });

  it('never lists staff as customers, and searches by name, email and phone formats', async () => {
    expect((await admin.get('/admin/customers')).body.data.items.some((c: { email: string }) => c.email === 'root@example.com')).toBe(false);
    const names = async (q: string) => (await admin.get(`/admin/customers?q=${encodeURIComponent(q)}`)).body.data.items.map((c: { name: string }) => c.name);
    expect(await names('ayesha')).toEqual(['Ayesha Khan']);
    expect(await names('SARA@EXAMPLE')).toEqual(['Sara Ali']);
    expect(await names('nobody')).toEqual([]);
    expect(await names('.*')).toEqual([]); // text, not a pattern
    expect((await admin.get('/admin/customers?limit=1&page=2')).body.data.items).toHaveLength(1);
  });

  it('shows one customer with recent orders and notes', async () => {
    const res = await admin.get(`/admin/customers/${ayeshaId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.customer).toMatchObject({ email: 'ayesha@example.com', role: 'customer' });
    expect(res.body.data.stats).toMatchObject({ orders: 1, totalSpent: 2_030_000, cancelled: 1, addresses: 0, returns: 0 });
    expect(res.body.data.recentOrders).toHaveLength(2);
    expect(res.body.data.notes).toEqual([]);
    expect((await admin.get(`/admin/customers/${'0'.repeat(24)}`)).status).toBe(404);
    expect((await admin.get('/admin/customers/not-an-id')).status).toBe(400);
  });

  it('keeps an append-only trail of support notes with the author', async () => {
    const support = await adminClient(app, 'support@example.com', 'support_staff');
    expect((await support.post(`/admin/customers/${ayeshaId}/notes`, { body: 'Called about a late parcel' })).status).toBe(201);
    expect((await admin.post(`/admin/customers/${ayeshaId}/notes`, { body: 'Resolved, offered free delivery' })).status).toBe(201);
    const notes = (await admin.get(`/admin/customers/${ayeshaId}`)).body.data.notes;
    expect(notes.map((n: { body: string }) => n.body)).toEqual(['Resolved, offered free delivery', 'Called about a late parcel']);
    expect(notes[1].author).toBe('Test User');
    expect((await admin.post(`/admin/customers/${ayeshaId}/notes`, { body: 'x' })).status).toBe(400);
    expect((await admin.post(`/admin/customers/${ayeshaId}/notes`, { body: 'ok note', author: 'someone else' })).status).toBe(400);
    expect((await admin.patch(`/admin/customers/${ayeshaId}/notes/${notes[0].id}`, { body: 'edited' })).status).toBe(404);
  });

  it('limits who can read customers and who can write notes', async () => {
    const om = await adminClient(app, 'om@example.com', 'order_manager');
    const pm = await adminClient(app, 'pm@example.com', 'product_manager');
    expect((await om.get('/admin/customers')).status).toBe(200);
    expect((await om.post(`/admin/customers/${ayeshaId}/notes`, { body: 'not allowed' })).status).toBe(403);
    expect((await pm.get('/admin/customers')).status).toBe(403);
    expect((await request(app).get('/api/v1/admin/customers')).status).toBe(401);
  });
});
