import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { Session } from '../../src/modules/auth/session.model';
import { adminClient, orderBody, seedStore } from '../factories';
import { TEST_PASSWORD, clearDb, createUser, loginAs, startTestDb, stopTestDb } from '../helpers';

const app = createApp();
const API = '/api/v1';

// A representative read endpoint from every admin area. Each must be closed to guests and customers.
const ADMIN_GETS = [
  '/admin/orders', '/admin/shipments', '/admin/payments', '/admin/cod/summary', '/admin/returns', '/admin/products', '/admin/categories',
  '/admin/inventory', '/admin/reviews', '/admin/customers', '/admin/coupons', '/admin/newsletter', '/admin/settings', '/admin/service-areas',
  '/admin/staff', '/admin/audit', '/admin/dashboard', '/admin/pages',
];

describe('customer and administrator separation', () => {
  beforeAll(startTestDb);
  afterAll(stopTestDb);
  beforeEach(clearDb);

  it('closes every admin endpoint to guests (401) and customers (403)', async () => {
    await createUser({ email: 'c@example.com' });
    const { agent } = await loginAs(app, 'c@example.com');
    for (const path of ADMIN_GETS) {
      expect((await request(app).get(API + path)).status, `guest ${path}`).toBe(401);
      expect((await agent.get(API + path)).status, `customer ${path}`).toBe(403);
    }
  });

  it('keeps each staff role inside its own permissions', async () => {
    await createUser({ email: 'support@example.com', role: 'support_staff' });
    const { agent } = await loginAs(app, 'support@example.com');
    for (const path of ['/admin/payments', '/admin/settings', '/admin/staff', '/admin/audit', '/admin/coupons', '/admin/service-areas', '/admin/dashboard']) {
      expect((await agent.get(API + path)).status, `support ${path}`).toBe(403);
    }
    expect((await agent.get(API + '/admin/orders')).status).toBe(200);
  });

  it('never lets a staff account use the shop: bag, orders, addresses, reviews, returns', async () => {
    const root = await adminClient(app);
    const { v1 } = await seedStore(root);
    await createUser({ email: 'om@example.com', role: 'order_manager' });
    const { agent, csrf } = await loginAs(app, 'om@example.com');

    const blocked = async (res: request.Test) => { const r = await res; expect(r.status).toBe(403); expect(r.body.error.code).toBe('STAFF_ACCOUNT'); };
    await blocked(agent.get(`${API}/cart`));
    await blocked(agent.put(`${API}/cart`).set('X-CSRF-Token', csrf).send({ items: [{ variantId: v1, quantity: 1 }] }));
    await blocked(agent.post(`${API}/orders`).set('X-CSRF-Token', csrf).set('Idempotency-Key', randomUUID()).send(orderBody([{ variantId: v1, quantity: 1 }])));
    await blocked(agent.get(`${API}/account/orders`));
    await blocked(agent.get(`${API}/account/addresses`));
    await blocked(agent.get(`${API}/account/returns`));
    // Their own identity and password still work.
    expect((await agent.get(`${API}/auth/me`)).body.data.user.role).toBe('order_manager');
    expect((await agent.get(`${API}/account/profile`)).status).toBe(200);
  });

  it('still lets a customer shop and keeps orders private to their owner', async () => {
    const root = await adminClient(app);
    const { v1 } = await seedStore(root);
    await createUser({ email: 'a@example.com' });
    await createUser({ email: 'b@example.com' });
    const a = await loginAs(app, 'a@example.com');
    const b = await loginAs(app, 'b@example.com');
    expect((await a.agent.get(`${API}/cart`)).status).toBe(200);

    const placed = await a.agent.post(`${API}/orders`).set('X-CSRF-Token', a.csrf).set('Idempotency-Key', randomUUID()).send(orderBody([{ variantId: v1, quantity: 1 }]));
    expect(placed.status).toBe(201);
    const number = placed.body.data.order.orderNumber as string;

    expect((await a.agent.get(`${API}/account/orders/${number}`)).status).toBe(200);
    expect((await b.agent.get(`${API}/account/orders/${number}`)).status).toBe(404); // same answer as a number that does not exist
    expect((await b.agent.post(`${API}/account/orders/${number}/cancel`).set('X-CSRF-Token', b.csrf).send({})).status).toBe(404);
    expect((await b.agent.get(`${API}/account/orders`)).body.data.items).toHaveLength(0);
  });

  it('refuses a staff session on the order endpoint, so no order is ever attached to staff', async () => {
    const root = await adminClient(app);
    const { v1 } = await seedStore(root);
    await createUser({ email: 'pm@example.com', role: 'product_manager' });
    const { agent, csrf } = await loginAs(app, 'pm@example.com');
    const r = await agent.post(`${API}/orders`).set('X-CSRF-Token', csrf).set('Idempotency-Key', randomUUID()).send(orderBody([{ variantId: v1, quantity: 1 }]));
    expect(r.status).toBe(403);
  });

  it('has no public way to create an administrator', async () => {
    const reg = await request(app).post(`${API}/auth/register`).send({ name: 'Eve Hacker', email: 'eve@example.com', password: TEST_PASSWORD, role: 'super_admin' });
    expect(reg.status).toBe(400); // unknown fields are rejected, so a role can never be supplied
    const ok = await request(app).post(`${API}/auth/register`).send({ name: 'Eve Hacker', email: 'eve@example.com', password: TEST_PASSWORD });
    expect(ok.body.data.user.role).toBe('customer');
    expect((await request(app).post(`${API}/auth/register-admin`).send({})).status).toBe(404);
    // A customer cannot create staff, and a manager cannot create a super admin.
    const { agent, csrf } = await loginAs(app, 'eve@example.com');
    expect((await agent.post(`${API}/admin/staff`).set('X-CSRF-Token', csrf).send({ name: 'X Y', email: 'x@example.com', password: TEST_PASSWORD, role: 'support_staff' })).status).toBe(403);
    const root = await adminClient(app, 'root2@example.com');
    expect((await root.post('/admin/staff', { name: 'Root Two', email: 'r2@example.com', password: TEST_PASSWORD, role: 'super_admin' })).status).toBe(400);
  });

  it('admin sign-in only opens staff accounts, with no session and no hint for customers', async () => {
    await createUser({ email: 'c@example.com' });
    await createUser({ email: 'staff@example.com', role: 'support_staff' });
    const wrong = await request(app).post(`${API}/auth/login`).send({ email: 'c@example.com', password: 'wrong-password-1' });
    const asCustomer = await request(app).post(`${API}/auth/login`).send({ email: 'c@example.com', password: TEST_PASSWORD, portal: 'admin' });
    expect(asCustomer.status).toBe(401);
    expect(asCustomer.body.error.message).toBe(wrong.body.error.message);
    expect(asCustomer.headers['set-cookie']).toBeUndefined();
    const asStaff = await request(app).post(`${API}/auth/login`).send({ email: 'staff@example.com', password: TEST_PASSWORD, portal: 'admin' });
    expect(asStaff.status).toBe(200);
    expect(asStaff.body.data.user.role).toBe('support_staff');
  });

  it('signing in replaces the session the browser already held, and logout ends it', async () => {
    await createUser({ email: 'a@example.com' });
    await createUser({ email: 'staff@example.com', role: 'support_staff' });
    const agent = request.agent(app);
    await agent.post(`${API}/auth/login`).send({ email: 'a@example.com', password: TEST_PASSWORD });
    expect(await Session.countDocuments()).toBe(1);
    const res = await agent.post(`${API}/auth/login`).send({ email: 'staff@example.com', password: TEST_PASSWORD });
    expect(await Session.countDocuments()).toBe(1); // the first session did not linger
    expect((await agent.get(`${API}/auth/me`)).body.data.user.email).toBe('staff@example.com');
    expect((await agent.post(`${API}/auth/logout`).set('X-CSRF-Token', res.body.data.csrfToken)).status).toBe(200);
    expect((await agent.get(`${API}/auth/me`)).status).toBe(401);
    expect(await Session.countDocuments()).toBe(0);
  });

  it('signs a suspended staff member out at once', async () => {
    const u = await createUser({ email: 'staff@example.com', role: 'support_staff' });
    const { agent } = await loginAs(app, 'staff@example.com');
    expect((await agent.get(`${API}/admin/orders`)).status).toBe(200);
    u.status = 'suspended'; await u.save();
    expect((await agent.get(`${API}/admin/orders`)).status).toBe(401);
  });
});
