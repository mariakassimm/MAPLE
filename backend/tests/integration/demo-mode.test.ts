import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Must run before ../../src is imported, because env.ts reads the environment once.
vi.hoisted(() => { process.env.DEMO_MODE = 'true'; process.env.API_PUBLIC_URL = 'http://localhost:4000'; });

import { createApp } from '../../src/app';
import { Order } from '../../src/modules/orders/order.model';
import { Payment } from '../../src/modules/payments/payment.model';
import { resetProviders } from '../../src/modules/payments/registry';
import { resetCouriers } from '../../src/modules/shipping/config';
import { adminClient, orderBody, placeOrder, seedStore } from '../factories';
import { clearDb, startTestDb, stopTestDb } from '../helpers';

const app = createApp();
const form = (path: string, fields: Record<string, string>) => request(app).post(`/api/v1/payments/demo${path}`).type('form').send(fields);

describe('demo mode', () => {
  let v1: string;
  beforeAll(startTestDb);
  afterAll(async () => { resetProviders(); resetCouriers(); await stopTestDb(); });
  beforeEach(async () => {
    await clearDb();
    resetProviders(); resetCouriers();
    v1 = (await seedStore(await adminClient(app))).v1;
  });

  const placeOnline = async (method: 'jazzcash' | 'easypaisa') => {
    const res = await placeOrder(app, orderBody([{ variantId: v1, quantity: 1 }], { paymentMethod: method }));
    expect(res.status).toBe(201);
    const { orderNumber } = res.body.data.order;
    const init = await request(app).post(`/api/v1/payments/${method}/initiate`).send({ orderNumber, phone: '03001234567' });
    expect(init.status).toBe(200);
    return { orderNumber, redirect: init.body.data.redirect as { action: string; fields: { paymentRef: string; token: string } } };
  };

  it('offers JazzCash and Easypaisa, marked as demo', async () => {
    const res = await request(app).post('/api/v1/checkout/quote').send({ items: [{ variantId: v1, quantity: 1 }], city: 'Karachi', province: 'Sindh' });
    const online = res.body.data.paymentMethods.filter((m: { id: string }) => m.id !== 'cod');
    expect(online).toHaveLength(2);
    for (const m of online) expect(m).toMatchObject({ available: true, demo: true });
  });

  it('approving the sandbox page pays and confirms the order', async () => {
    const { orderNumber, redirect } = await placeOnline('jazzcash');
    expect(redirect.action).toContain('/api/v1/payments/demo/checkout');
    const page = await form('/checkout', redirect.fields);
    expect(page.status).toBe(200);
    expect(page.text).toContain('No real money');
    const done = await form('/complete', { ...redirect.fields, decision: 'approve' });
    expect(done.status).toBe(303);
    expect(done.headers.location).toContain(`order=${orderNumber}`);
    const order = await Order.findOne({ orderNumber }).lean();
    expect(order).toMatchObject({ status: 'confirmed', paymentStatus: 'paid' });
    expect(await Payment.countDocuments({ orderNumber, status: 'paid' })).toBe(1);
  });

  it('declining leaves the order unpaid and retryable', async () => {
    const { orderNumber, redirect } = await placeOnline('easypaisa');
    expect((await form('/complete', { ...redirect.fields, decision: 'decline' })).status).toBe(303);
    expect(await Order.findOne({ orderNumber }).lean()).toMatchObject({ status: 'awaiting_payment', paymentStatus: 'failed' });
  });

  it('refuses a forged or foreign payment reference', async () => {
    const { redirect } = await placeOnline('jazzcash');
    expect((await form('/complete', { paymentRef: redirect.fields.paymentRef, token: 'f'.repeat(64), decision: 'approve' })).status).toBe(400);
    expect((await form('/checkout', { paymentRef: 'ABCDEF123456', token: redirect.fields.token })).status).toBe(400);
  });

  it('paying twice does not pay or confirm twice', async () => {
    const { orderNumber, redirect } = await placeOnline('jazzcash');
    await form('/complete', { ...redirect.fields, decision: 'approve' });
    await form('/complete', { ...redirect.fields, decision: 'approve' });
    expect(await Payment.countDocuments({ orderNumber, status: 'paid' })).toBe(1);
  });
});
