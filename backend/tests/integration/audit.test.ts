import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { AuditLog } from '../../src/modules/audit/auditLog.model';
import { clearDb, createUser, loginAs, startTestDb, stopTestDb } from '../helpers';

const app = createApp();

describe('admin audit log', () => {
  beforeAll(startTestDb);
  afterAll(stopTestDb);
  beforeEach(clearDb);

  it('requires sign-in and the audit:read permission', async () => {
    expect((await request(app).get('/api/v1/admin/audit')).status).toBe(401);
    await createUser({ email: 'om@example.com', role: 'order_manager' });
    const { agent } = await loginAs(app, 'om@example.com');
    expect((await agent.get('/api/v1/admin/audit')).status).toBe(403);
  });

  it('lets a super admin read and filter entries, newest first', async () => {
    await AuditLog.create([
      { action: 'order.status_change', resourceType: 'order', createdAt: new Date(Date.now() - 60_000) },
      { action: 'coupon.update', resourceType: 'coupon', createdAt: new Date(Date.now() - 30_000) },
    ]);
    await createUser({ email: 'root@example.com', role: 'super_admin' });
    const { agent } = await loginAs(app, 'root@example.com');
    const all = await agent.get('/api/v1/admin/audit');
    expect(all.status).toBe(200);
    // Signing in adds its own (newest) auth.login entry, so compare only the two seeded entries.
    const seeded = all.body.data.items.map((i: { action: string }) => i.action).filter((a: string) => a !== 'auth.login');
    expect(seeded).toEqual(['coupon.update', 'order.status_change']);
    const filtered = await agent.get('/api/v1/admin/audit').query({ action: 'order.' });
    expect(filtered.body.data.items.map((i: { action: string }) => i.action)).toEqual(['order.status_change']);
  });

  it('treats the action filter as text, not a pattern', async () => {
    await AuditLog.create({ action: 'order.status_change', resourceType: 'order' });
    await createUser({ email: 'root@example.com', role: 'super_admin' });
    const { agent } = await loginAs(app, 'root@example.com');
    const res = await agent.get('/api/v1/admin/audit').query({ action: '.*' });
    expect(res.body.data.items).toHaveLength(0);
  });

  it('exposes no way to change the log', async () => {
    await createUser({ email: 'root@example.com', role: 'super_admin' });
    const { agent, csrf } = await loginAs(app, 'root@example.com');
    expect((await agent.delete('/api/v1/admin/audit').set('X-CSRF-Token', csrf)).status).toBe(404);
    expect((await agent.post('/api/v1/admin/audit').set('X-CSRF-Token', csrf).send({})).status).toBe(404);
  });
});
