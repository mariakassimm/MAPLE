import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { confirmToken, unsubscribeToken, Subscriber } from '../../src/modules/newsletter/newsletter';
import { waitForNotifications } from '../../src/modules/notifications/notify';
import { Order } from '../../src/modules/orders/order.model';
import { JazzCashProvider, jazzCashHash } from '../../src/modules/payments/providers/jazzcash';
import { resetProviders, setProviders } from '../../src/modules/payments/registry';
import { setMailer, type MailMessage } from '../../src/services/mailer';
import { adminClient, orderBody, placeOrder, seedStore, type AdminClient } from '../factories';
import { clearDb, startTestDb, stopTestDb } from '../helpers';

const app = createApp();
const SALT = 'salt-for-email-tests';

describe('transactional emails', () => {
  let admin: AdminClient;
  let v1: string;
  let mails: MailMessage[];

  beforeAll(startTestDb);
  afterAll(async () => {
    resetProviders();
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearDb();
    mails = [];
    setMailer({ send: async (m) => void mails.push(m) });
    setProviders({ jazzcash: new JazzCashProvider({ merchantId: 'MC1', password: 'pw', integritySalt: SALT, ppVersion: '2.0', paymentUrl: 'https://jc.test/', returnUrl: 'https://api.test/return' }) });
    admin = await adminClient(app);
    v1 = (await seedStore(admin)).v1;
  });

  const place = (extra: object = {}) =>
    placeOrder(app, orderBody([{ variantId: v1, quantity: 1 }], { customer: { name: 'Ayesha Khan', phone: '0300 1234567', email: 'ayesha@example.com' }, ...extra }));
  const sent = async () => (await waitForNotifications(), mails.map((m) => m.template));
  const idOf = async (orderNumber: string) => String((await Order.findOne({ orderNumber }).lean())!._id);

  it('confirms a COD order by email, with the real totals', async () => {
    const res = await place();
    expect(res.status).toBe(201);
    expect(await sent()).toEqual(['staff_new_order', 'order_placed']);
    const mail = mails.find((m) => m.template === 'order_placed')!;
    expect(mails.find((m) => m.template === 'staff_new_order')!.to).toBe('root@example.com'); // the store's staff are told at once
    expect(mail.to).toBe('ayesha@example.com');
    expect(mail.subject).toBe(`Order ${res.body.data.order.orderNumber} received`);
    expect(mail.html).toContain('Rs 20,300');
    expect(mail.html).toContain('Cash on delivery');
    expect(mail.meta!.trackUrl).toContain('/order-tracking?order=');
  });

  it('refuses an order with no email, because every update is sent by email', async () => {
    const body = orderBody([{ variantId: v1, quantity: 1 }], { customer: { name: 'Ayesha Khan', phone: '0300 1234567' } });
    const res = await placeOrder(app, body);
    expect(res.status).toBe(400);
    expect(await Order.countDocuments()).toBe(0);
    expect(await sent()).toEqual([]);
  });

  it('never lets a mail outage touch the order', async () => {
    setMailer({ send: async () => { throw new Error('Resend is down'); } });
    const res = await place();
    expect(res.status).toBe(201);
    await waitForNotifications();
    expect(await Order.countDocuments()).toBe(1);
  });

  it('emails the cancellation, dispatch and delivery of an order', async () => {
    const a = await place();
    const aId = await idOf(a.body.data.order.orderNumber);
    await admin.patch(`/admin/orders/${aId}/status`, { status: 'confirmed' });
    const booking = await admin.post(`/admin/orders/${aId}/shipments`, { courier: 'manual', trackingNumber: 'MAN-778899' });
    await waitForNotifications();
    const dispatched = mails.find((m) => m.template === 'order_dispatched')!;
    expect(dispatched.html).toContain('MAN-778899');
    await admin.post(`/admin/shipments/${booking.body.data.shipment.id}/status`, { status: 'out_for_delivery' });
    await admin.post(`/admin/shipments/${booking.body.data.shipment.id}/status`, { status: 'delivered' });
    await waitForNotifications();
    expect(mails.map((m) => m.template)).toEqual(expect.arrayContaining(['order_placed', 'order_confirmed', 'order_dispatched', 'order_tracking', 'order_delivered']));

    mails.length = 0;
    const b = await place();
    await admin.patch(`/admin/orders/${await idOf(b.body.data.order.orderNumber)}/status`, { status: 'cancelled', reason: 'Out of packaging' });
    await waitForNotifications();
    expect(mails.map((m) => m.template)).toContain('order_cancelled');
    expect(mails.find((m) => m.template === 'order_cancelled')!.html).toContain('Out of packaging');
  });

  it('tells online shoppers they are waiting for payment, then confirms or reports failure', async () => {
    const placed = await place({ paymentMethod: 'jazzcash' });
    const orderNumber = placed.body.data.order.orderNumber as string;
    await waitForNotifications();
    expect(mails[0]!.html).toContain('waiting for payment');

    const ref = (await request(app).post('/api/v1/payments/jazzcash/initiate').send({ orderNumber, phone: '03001234567' })).body.data.paymentRef as string;
    const back = (code: string) => {
      const f: Record<string, string> = { pp_Amount: '2030000', pp_MerchantID: 'MC1', pp_ResponseCode: code, pp_TxnRefNo: ref, pp_Version: '2.0' };
      return request(app).post('/api/v1/payments/jazzcash/return').type('form').send({ ...f, pp_SecureHash: jazzCashHash(f, SALT) });
    };
    await back('110');
    await waitForNotifications();
    expect(mails.map((m) => m.template)).toContain('order_payment_failed');
    await request(app).post('/api/v1/payments/jazzcash/initiate').send({ orderNumber, phone: '03001234567' });
    const retry = (await Order.findOne({ orderNumber }).lean())!;
    expect(retry.paymentStatus).toBe('pending');
  });
});

describe('newsletter', () => {
  let mails: MailMessage[];
  beforeAll(startTestDb);
  afterAll(stopTestDb);
  beforeEach(async () => {
    await clearDb();
    mails = [];
    setMailer({ send: async (m) => void mails.push(m) });
  });

  const subscribe = (email: string) => request(app).post('/api/v1/newsletter/subscribe').send({ email });
  const confirm = (email: string, token = confirmToken(email)) => request(app).post('/api/v1/newsletter/confirm').send({ email, token });
  const join = async (email: string) => { await subscribe(email); await confirm(email); };

  it('only subscribes after the mailbox owner confirms, then welcomes once', async () => {
    expect((await subscribe('Reader@Example.com')).body.data.confirmationSent).toBe(true);
    expect(mails.map((m) => m.template)).toEqual(['newsletter_confirm']);
    expect(mails[0]!.to).toBe('reader@example.com');
    // Not subscribed yet, and no consent recorded, until the link is used.
    expect(await Subscriber.findOne().lean()).toMatchObject({ email: 'reader@example.com', status: 'pending' });
    expect((await Subscriber.findOne().lean())!.consentAt).toBeUndefined();
    expect((await subscribe('reader@example.com')).status).toBe(200); // repeat within the cooldown: no second email
    expect(mails).toHaveLength(1);
    expect((await confirm('reader@example.com', 'x'.repeat(43))).status).toBe(400);
    expect((await confirm('reader@example.com')).status).toBe(200);
    expect((await confirm('reader@example.com')).status).toBe(200); // clicking twice is harmless
    await waitForNotifications();
    expect(mails.map((m) => m.template)).toEqual(['newsletter_confirm', 'newsletter_welcome']);
    expect(await Subscriber.findOne().lean()).toMatchObject({ email: 'reader@example.com', status: 'subscribed' });
    expect((await Subscriber.findOne().lean())!.consentAt).toBeInstanceOf(Date);
    expect(await Subscriber.countDocuments()).toBe(1);
    // Already subscribed: same answer, nothing sent.
    expect((await subscribe('reader@example.com')).body.data.confirmationSent).toBe(true);
    expect(mails).toHaveLength(2);
    expect((await subscribe('not-an-email')).status).toBe(400);
  });

  it('tells the visitor when the confirmation email cannot be sent', async () => {
    setMailer({ send: async () => { throw new Error('mail down'); } });
    const res = await subscribe('reader@example.com');
    expect(res.status).toBe(503);
    // A retry is allowed straight away rather than being blocked by the cooldown.
    expect((await Subscriber.findOne().lean())!.lastEmailAt).toBeUndefined();
    setMailer({ send: async (m) => void mails.push(m) });
    expect((await subscribe('reader@example.com')).status).toBe(200);
    expect(mails).toHaveLength(1);
  });

  it('unsubscribes only with a valid signed link, and a resubscribe needs confirming again', async () => {
    await join('reader@example.com');
    const unsub = (token: string) => request(app).post('/api/v1/newsletter/unsubscribe').send({ email: 'reader@example.com', token });
    expect((await unsub('x'.repeat(43))).status).toBe(400);
    expect((await Subscriber.findOne().lean())!.status).toBe('subscribed');
    expect((await unsub(unsubscribeToken('reader@example.com'))).status).toBe(200);
    expect((await Subscriber.findOne().lean())!.status).toBe('unsubscribed');
    expect((await confirm('reader@example.com')).status).toBe(400); // an old confirmation link cannot re-subscribe them
    await subscribe('reader@example.com');
    expect((await Subscriber.findOne().lean())!.status).toBe('pending');
    await confirm('reader@example.com');
    expect((await Subscriber.findOne().lean())!.status).toBe('subscribed');
  });

  it('shows staff the list and the live subscriber count', async () => {
    const admin = await adminClient(app);
    await join('a@example.com');
    await join('b@example.com');
    await subscribe('c@example.com'); // never confirmed
    await request(app).post('/api/v1/newsletter/unsubscribe').send({ email: 'b@example.com', token: unsubscribeToken('b@example.com') });
    const res = await admin.get('/admin/newsletter');
    expect(res.body.data.subscribedTotal).toBe(1);
    expect(res.body.data.pendingTotal).toBe(1);
    expect(res.body.data.items).toHaveLength(3);
    expect((await admin.get('/admin/newsletter?status=unsubscribed')).body.data.items).toHaveLength(1);
    expect((await admin.get('/admin/newsletter?status=pending')).body.data.items).toHaveLength(1);
    const support = await adminClient(app, 'support@example.com', 'support_staff');
    expect((await support.get('/admin/newsletter')).status).toBe(403);
    expect((await request(app).get('/api/v1/admin/newsletter')).status).toBe(401);
  });
});
