import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { Session } from '../../src/modules/auth/session.model';
import { setMailer } from '../../src/services/mailer';
import { TEST_PASSWORD, clearDb, createUser, loginAs, startTestDb, stopTestDb } from '../helpers';

const app = createApp();
const sent: { to: string; resetUrl: string }[] = [];

describe('auth', () => {
  beforeAll(startTestDb);
  afterAll(stopTestDb);
  beforeEach(async () => {
    await clearDb();
    sent.length = 0;
    setMailer({ send: async (m) => void (m.template === 'password_reset' && sent.push({ to: m.to, resetUrl: m.meta!.resetUrl! })) });
  });

  it('registers a customer with an httpOnly session cookie and a csrf token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Ayesha Khan', email: 'Ayesha@Example.com', phone: '0300-1234567', password: TEST_PASSWORD });
    expect(res.status).toBe(201);
    expect(res.body.data.user).toMatchObject({ email: 'ayesha@example.com', phone: '+923001234567', role: 'customer' });
    expect(res.body.data.user.passwordHash).toBeUndefined();
    expect(typeof res.body.data.csrfToken).toBe('string');
    const cookies = (res.headers['set-cookie'] as unknown as string[]).join(';');
    expect(cookies).toMatch(/maple_sid=/);
    expect(cookies).toMatch(/HttpOnly/i);
  });

  it('rejects duplicate emails', async () => {
    await createUser({ email: 'dup@example.com' });
    const res = await request(app).post('/api/v1/auth/register').send({ name: 'Dup', email: 'dup@example.com', password: TEST_PASSWORD });
    expect(res.status).toBe(409);
  });

  it('returns field-level validation errors and rejects unknown fields', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'A', email: 'nope', password: 'short', role: 'super_admin' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const fields = res.body.error.details.map((d: { field: string }) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['body.name', 'body.email', 'body.password']));
  });

  it('does not let a client choose its own role', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({ name: 'Mallory', email: 'm@example.com', password: TEST_PASSWORD, role: 'super_admin' });
    expect(res.status).toBe(400);
  });

  it('logs in and serves /me from the session cookie', async () => {
    await createUser({ email: 'a@example.com' });
    const { agent } = await loginAs(app, 'a@example.com');
    const me = await agent.get('/api/v1/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.data.user.email).toBe('a@example.com');
  });

  it('requires a session for /me', async () => {
    expect((await request(app).get('/api/v1/auth/me')).status).toBe(401);
  });

  it('gives the same error for a wrong password and an unknown email', async () => {
    await createUser({ email: 'a@example.com' });
    const wrong = await request(app).post('/api/v1/auth/login').send({ email: 'a@example.com', password: 'wrong-password-1' });
    const unknown = await request(app).post('/api/v1/auth/login').send({ email: 'ghost@example.com', password: 'wrong-password-1' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });

  it('locks the account after repeated failures, even for the correct password', async () => {
    await createUser({ email: 'a@example.com' });
    for (let i = 0; i < 5; i++) {
      const res = await request(app).post('/api/v1/auth/login').send({ email: 'a@example.com', password: 'wrong-password-1' });
      expect(res.status).toBe(401);
    }
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'a@example.com', password: TEST_PASSWORD });
    expect(res.status).toBe(401);
  });

  it('refuses suspended users', async () => {
    await createUser({ email: 'a@example.com', status: 'suspended' });
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'a@example.com', password: TEST_PASSWORD });
    expect(res.status).toBe(401);
  });

  it('requires the csrf token to log out, then revokes the session', async () => {
    await createUser({ email: 'a@example.com' });
    const { agent, csrf } = await loginAs(app, 'a@example.com');

    const blocked = await agent.post('/api/v1/auth/logout');
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('CSRF_INVALID');
    expect((await agent.get('/api/v1/auth/me')).status).toBe(200);

    const ok = await agent.post('/api/v1/auth/logout').set('X-CSRF-Token', csrf);
    expect(ok.status).toBe(200);
    expect(await Session.countDocuments()).toBe(0);
    expect((await agent.get('/api/v1/auth/me')).status).toBe(401);
  });

  it('rejects a csrf token from a different session', async () => {
    await createUser({ email: 'a@example.com' });
    await createUser({ email: 'b@example.com' });
    const a = await loginAs(app, 'a@example.com');
    const b = await loginAs(app, 'b@example.com');
    const res = await a.agent.post('/api/v1/auth/logout').set('X-CSRF-Token', b.csrf);
    expect(res.status).toBe(403);
  });

  it('resets a password once, revokes old sessions, and rejects reuse of the token', async () => {
    await createUser({ email: 'a@example.com' });
    const { agent } = await loginAs(app, 'a@example.com');

    const forgot = await request(app).post('/api/v1/auth/forgot-password').send({ email: 'a@example.com' });
    expect(forgot.status).toBe(200);
    expect(sent).toHaveLength(1);
    const token = new URL(sent[0]!.resetUrl).searchParams.get('token')!;

    const newPassword = 'Br4ndNew-password';
    const reset = await request(app).post('/api/v1/auth/reset-password').send({ token, password: newPassword });
    expect(reset.status).toBe(200);

    expect((await agent.get('/api/v1/auth/me')).status).toBe(401);
    const login = await request(app).post('/api/v1/auth/login').send({ email: 'a@example.com', password: newPassword });
    expect(login.status).toBe(200);

    const reuse = await request(app).post('/api/v1/auth/reset-password').send({ token, password: 'An0ther-password' });
    expect(reuse.status).toBe(400);
  });

  it('answers forgot-password identically for unknown emails and sends nothing', async () => {
    const res = await request(app).post('/api/v1/auth/forgot-password').send({ email: 'ghost@example.com' });
    expect(res.status).toBe(200);
    expect(sent).toHaveLength(0);
  });
});
