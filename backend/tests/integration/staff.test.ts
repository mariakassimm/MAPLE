import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { AuditLog } from '../../src/modules/audit/auditLog.model';
import { User } from '../../src/modules/users/user.model';
import { TEST_PASSWORD, clearDb, createUser, loginAs, startTestDb, stopTestDb } from '../helpers';

const app = createApp();
const newStaff = { name: 'Sara Ali', email: 'sara@example.com', password: TEST_PASSWORD, role: 'order_manager' };

describe('admin staff management (RBAC)', () => {
  beforeAll(startTestDb);
  afterAll(stopTestDb);
  beforeEach(clearDb);

  it('returns 401 when signed out', async () => {
    expect((await request(app).get('/api/v1/admin/staff')).status).toBe(401);
  });

  it('returns 403 for customers', async () => {
    await createUser({ email: 'c@example.com' });
    const { agent } = await loginAs(app, 'c@example.com');
    expect((await agent.get('/api/v1/admin/staff')).status).toBe(403);
  });

  it('returns 403 for staff roles without staff:manage', async () => {
    await createUser({ email: 'om@example.com', role: 'order_manager' });
    const { agent } = await loginAs(app, 'om@example.com');
    expect((await agent.get('/api/v1/admin/staff')).status).toBe(403);
  });

  it('lets a super admin create staff, requires csrf, and writes audit entries', async () => {
    await createUser({ email: 'root@example.com', role: 'super_admin' });
    const { agent, csrf } = await loginAs(app, 'root@example.com');

    const noCsrf = await agent.post('/api/v1/admin/staff').send(newStaff);
    expect(noCsrf.status).toBe(403);

    const created = await agent.post('/api/v1/admin/staff').set('X-CSRF-Token', csrf).send(newStaff);
    expect(created.status).toBe(201);
    expect(created.body.data.user).toMatchObject({ email: 'sara@example.com', role: 'order_manager' });

    const list = await agent.get('/api/v1/admin/staff');
    expect(list.body.data.staff.map((s: { email: string }) => s.email)).toContain('sara@example.com');

    const logs = await AuditLog.find({ action: 'staff.create' });
    expect(logs).toHaveLength(1);
    expect(JSON.stringify(logs[0])).not.toMatch(/password/i);
  });

  it('refuses to create a super_admin through the API', async () => {
    await createUser({ email: 'root@example.com', role: 'super_admin' });
    const { agent, csrf } = await loginAs(app, 'root@example.com');
    const res = await agent.post('/api/v1/admin/staff').set('X-CSRF-Token', csrf).send({ ...newStaff, role: 'super_admin' });
    expect(res.status).toBe(400);
  });

  it('revokes the target\'s sessions when their role changes', async () => {
    await createUser({ email: 'root@example.com', role: 'super_admin' });
    const target = await createUser({ email: 'pm@example.com', role: 'product_manager' });
    const root = await loginAs(app, 'root@example.com');
    const pm = await loginAs(app, 'pm@example.com');

    const res = await root.agent.patch(`/api/v1/admin/staff/${target._id}`).set('X-CSRF-Token', root.csrf).send({ role: 'support_staff' });
    expect(res.status).toBe(200);
    expect((await pm.agent.get('/api/v1/auth/me')).status).toBe(401);
  });

  it('suspension takes effect immediately', async () => {
    await createUser({ email: 'root@example.com', role: 'super_admin' });
    const target = await createUser({ email: 'pm@example.com', role: 'product_manager' });
    const root = await loginAs(app, 'root@example.com');
    const pm = await loginAs(app, 'pm@example.com');

    await root.agent.patch(`/api/v1/admin/staff/${target._id}`).set('X-CSRF-Token', root.csrf).send({ status: 'suspended' });
    expect((await pm.agent.get('/api/v1/auth/me')).status).toBe(401);
    const relogin = await request(app).post('/api/v1/auth/login').send({ email: 'pm@example.com', password: TEST_PASSWORD });
    expect(relogin.status).toBe(401);
  });

  it('blocks self-edits, customers and other super admins as targets', async () => {
    const root = await createUser({ email: 'root@example.com', role: 'super_admin' });
    const other = await createUser({ email: 'root2@example.com', role: 'super_admin' });
    const customer = await createUser({ email: 'c@example.com' });
    const { agent, csrf } = await loginAs(app, 'root@example.com');
    const patch = (id: unknown) => agent.patch(`/api/v1/admin/staff/${id}`).set('X-CSRF-Token', csrf).send({ status: 'suspended' });

    expect((await patch(root._id)).status).toBe(400);
    expect((await patch(other._id)).status).toBe(403);
    expect((await patch(customer._id)).status).toBe(404);
    expect((await patch('not-an-id')).status).toBe(400);
    expect((await User.findById(other._id))?.status).toBe('active');
  });
});
