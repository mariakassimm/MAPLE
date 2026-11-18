import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { waitForNotifications } from '../../src/modules/notifications/notify';
import { setMailer, type MailMessage } from '../../src/services/mailer';
import { TEST_PASSWORD, clearDb, createUser, loginAs, startTestDb, stopTestDb } from '../helpers';

const app = createApp();
const address = { label: 'Home', recipientName: 'Ayesha Khan', phone: '0300 1234567', province: 'Sindh', city: 'Karachi', area: 'Gulshan', line1: 'House 12, Street 4', postalCode: '75300' };

describe('customer account', () => {
  let mails: MailMessage[];
  beforeAll(startTestDb);
  afterAll(stopTestDb);
  beforeEach(async () => {
    await clearDb();
    mails = [];
    setMailer({ send: async (m) => void mails.push(m) });
  });

  const signedIn = async (email = 'ayesha@example.com') => {
    await createUser({ email, name: 'Ayesha Khan' });
    const s = await loginAs(app, email);
    return {
      get: (p: string) => s.agent.get(`/api/v1${p}`),
      post: (p: string, b: object = {}) => s.agent.post(`/api/v1${p}`).set('X-CSRF-Token', s.csrf).send(b),
      patch: (p: string, b: object = {}) => s.agent.patch(`/api/v1${p}`).set('X-CSRF-Token', s.csrf).send(b),
      del: (p: string) => s.agent.delete(`/api/v1${p}`).set('X-CSRF-Token', s.csrf),
      agent: s.agent,
      csrf: s.csrf,
    };
  };

  it('sends a welcome email and an email-confirmation link on registration, and the link works once', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({ name: 'Sara Ali', email: 'sara@example.com', password: TEST_PASSWORD });
    expect(res.status).toBe(201);
    expect(res.body.data.user.emailVerified).toBe(false);
    await waitForNotifications();
    expect(mails.map((m) => m.template).sort()).toEqual(['verify_email', 'welcome']);
    const token = new URL(mails.find((m) => m.template === 'verify_email')!.meta!.verifyUrl!).searchParams.get('token')!;

    expect((await request(app).post('/api/v1/auth/verify-email').send({ token: 'x'.repeat(30) })).status).toBe(400);
    expect((await request(app).post('/api/v1/auth/verify-email').send({ token })).status).toBe(200);
    expect((await request(app).post('/api/v1/auth/verify-email').send({ token })).status).toBe(400);
    const agent = request.agent(app);
    await agent.post('/api/v1/auth/login').send({ email: 'sara@example.com', password: TEST_PASSWORD });
    expect((await agent.get('/api/v1/auth/me')).body.data.user.emailVerified).toBe(true);
  });

  it('survives a mail outage during registration', async () => {
    setMailer({ send: async () => { throw new Error('Resend is down'); } });
    const res = await request(app).post('/api/v1/auth/register').send({ name: 'Sara Ali', email: 'sara@example.com', password: TEST_PASSWORD });
    expect(res.status).toBe(201);
    await waitForNotifications();
    expect((await request(app).post('/api/v1/auth/login').send({ email: 'sara@example.com', password: TEST_PASSWORD })).status).toBe(200);
  });

  it('can resend the confirmation email only while unverified', async () => {
    const me = await signedIn();
    expect((await me.post('/auth/resend-verification')).body.data.sent).toBe(true);
    await waitForNotifications();
    expect(mails.filter((m) => m.template === 'verify_email')).toHaveLength(1);
    expect((await request(app).post('/api/v1/auth/resend-verification')).status).toBe(401);
  });

  it('requires sign-in (and CSRF for writes) everywhere', async () => {
    expect((await request(app).get('/api/v1/account/profile')).status).toBe(401);
    expect((await request(app).get('/api/v1/account/addresses')).status).toBe(401);
    const me = await signedIn();
    expect((await me.agent.patch('/api/v1/account/profile').send({ name: 'No Csrf' })).status).toBe(403);
  });

  it('updates the profile with a normalised phone and rejects unknown fields', async () => {
    const me = await signedIn();
    const res = await me.patch('/account/profile', { name: 'Ayesha Bibi', phone: '0300-1234567' });
    expect(res.body.data.user).toMatchObject({ name: 'Ayesha Bibi', phone: '+923001234567' });
    expect((await me.patch('/account/profile', { phone: null })).body.data.user.phone).toBeNull();
    expect((await me.patch('/account/profile', { role: 'super_admin' })).status).toBe(400);
    expect((await me.patch('/account/profile', {})).status).toBe(400);
    expect((await me.patch('/account/profile', { phone: '123' })).status).toBe(400);
  });

  it('changes the password, keeps this session and signs every other device out', async () => {
    const me = await signedIn();
    const other = await loginAs(app, 'ayesha@example.com');
    expect((await me.post('/account/change-password', { currentPassword: 'wrong-password-1', newPassword: 'Br4ndNew-password' })).status).toBe(400);
    expect((await me.post('/account/change-password', { currentPassword: TEST_PASSWORD, newPassword: 'short' })).status).toBe(400);
    expect((await me.post('/account/change-password', { currentPassword: TEST_PASSWORD, newPassword: 'Br4ndNew-password' })).status).toBe(200);
    expect((await me.get('/account/profile')).status).toBe(200);
    expect((await other.agent.get('/api/v1/auth/me')).status).toBe(401);
    expect((await request(app).post('/api/v1/auth/login').send({ email: 'ayesha@example.com', password: TEST_PASSWORD })).status).toBe(401);
    expect((await request(app).post('/api/v1/auth/login').send({ email: 'ayesha@example.com', password: 'Br4ndNew-password' })).status).toBe(200);
  });

  describe('addresses', () => {
    it('makes the first address the default and lets a later one take over', async () => {
      const me = await signedIn();
      const first = (await me.post('/account/addresses', address)).body.data.address;
      expect(first).toMatchObject({ isDefault: true, phone: '+923001234567', city: 'Karachi' });
      const second = (await me.post('/account/addresses', { ...address, label: 'Office', line1: 'Plot 5, Clifton' })).body.data.address;
      expect(second.isDefault).toBe(false);
      await me.patch(`/account/addresses/${second.id}`, { isDefault: true });
      const list = (await me.get('/account/addresses')).body.data.addresses as { id: string; isDefault: boolean }[];
      expect(list.map((a) => [a.id, a.isDefault])).toEqual([[second.id, true], [first.id, false]]);
      expect((await me.patch(`/account/addresses/${second.id}`, { isDefault: false })).status).toBe(400);
    });

    it('promotes another address when the default is deleted', async () => {
      const me = await signedIn();
      const a = (await me.post('/account/addresses', address)).body.data.address;
      const b = (await me.post('/account/addresses', { ...address, label: 'Office' })).body.data.address;
      expect((await me.del(`/account/addresses/${a.id}`)).status).toBe(200);
      const list = (await me.get('/account/addresses')).body.data.addresses;
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ id: b.id, isDefault: true });
    });

    it('validates fields, caps the number saved, and keeps accounts apart', async () => {
      const me = await signedIn();
      expect((await me.post('/account/addresses', { ...address, province: 'Mars' })).status).toBe(400);
      expect((await me.post('/account/addresses', { ...address, postalCode: '12' })).status).toBe(400);
      expect((await me.post('/account/addresses', { ...address, userId: 'x' })).status).toBe(400);
      for (let i = 0; i < 10; i++) expect((await me.post('/account/addresses', { ...address, label: `A${i}` })).status).toBe(201);
      expect((await me.post('/account/addresses', address)).status).toBe(409);

      const intruder = await signedIn('other@example.com');
      const id = (await me.get('/account/addresses')).body.data.addresses[0].id;
      expect((await intruder.patch(`/account/addresses/${id}`, { city: 'Lahore' })).status).toBe(404);
      expect((await intruder.del(`/account/addresses/${id}`)).status).toBe(404);
      expect((await intruder.get('/account/addresses')).body.data.addresses).toEqual([]);
    });
  });
});
