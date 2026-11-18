import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { InventoryMovement } from '../../src/modules/inventory/inventoryMovement.model';
import { Order } from '../../src/modules/orders/order.model';
import { Payment, PaymentEvent } from '../../src/modules/payments/payment.model';
import { EasypaisaProvider } from '../../src/modules/payments/providers/easypaisa';
import { JazzCashProvider, jazzCashHash } from '../../src/modules/payments/providers/jazzcash';
import { expireUnpaidOrders } from '../../src/modules/payments/reconcile.service';
import { resetProviders, setProviders } from '../../src/modules/payments/registry';
import type { HttpClient } from '../../src/modules/payments/types';
import { Product } from '../../src/modules/products/product.model';
import { adminClient, orderBody, placeOrder, seedStore, type AdminClient } from '../factories';
import { clearDb, startTestDb, stopTestDb } from '../helpers';

const SALT = 'test-integrity-salt';
const MERCHANT = 'MC000001';
const JAZZ_PASSWORD = 'JC-secret-password';
const TOTAL = 2_030_000; // Rs 20,000 item + Rs 300 shipping, in paisa
const EP_BASE = 'https://easypaystg.easypaisa.com.pk';

const app = createApp();
let jazzHandler: HttpClient;
let epHandler: HttpClient;
let epCalls: string[];
const refuse: HttpClient = async () => ({ status: 500, body: '' });

const signed = (fields: Record<string, string>, salt = SALT) => ({ ...fields, pp_SecureHash: jazzCashHash(fields, salt) });
const jazzReturn = (ref: string, over: Record<string, string> = {}, salt = SALT) =>
  signed({ pp_Amount: String(TOTAL), pp_BillReference: 'x', pp_Language: 'EN', pp_MerchantID: MERCHANT, pp_ResponseCode: '000', pp_ResponseMessage: 'Transaction Successful', pp_RetreivalReferenceNo: '123456789012', pp_TxnRefNo: ref, pp_Version: '2.0', ...over }, salt);
const postReturn = (fields: Record<string, string>) => request(app).post('/api/v1/payments/jazzcash/return').type('form').send(fields);
const inquiryPaid = (ref: string) => signed({ pp_TxnRefNo: ref, pp_PaymentResponseCode: '000', pp_Amount: String(TOTAL), pp_ResponseCode: '000' });
const ipn = (ref: string) => request(app).get('/api/v1/payments/easypaisa/ipn').query({ url: `${EP_BASE}/easypay/ipn/${ref}` });

describe('online payments (JazzCash and Easypaisa)', () => {
  let admin: AdminClient;
  let v1: string;
  let productId: string;

  beforeAll(startTestDb);
  afterAll(async () => {
    resetProviders();
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearDb();
    jazzHandler = refuse;
    epHandler = refuse;
    epCalls = [];
    setProviders({
      jazzcash: new JazzCashProvider(
        { merchantId: MERCHANT, password: JAZZ_PASSWORD, integritySalt: SALT, ppVersion: '2.0', paymentUrl: 'https://sandbox.jazzcash.test/form/', inquiryUrl: 'https://sandbox.jazzcash.test/inquire', returnUrl: 'https://api.test/api/v1/payments/jazzcash/return' },
        (u, r) => jazzHandler(u, r),
      ),
      easypaisa: new EasypaisaProvider(
        { storeId: 'TESTSTORE', hashKey: '0123456789abcdef', baseUrl: EP_BASE, postBackUrl: 'https://api.test/api/v1/payments/easypaisa/postback' },
        (u, r) => (epCalls.push(u), epHandler(u, r)),
      ),
    });
    admin = await adminClient(app);
    const seeded = await seedStore(admin);
    v1 = seeded.v1;
    productId = seeded.product.id;
  });

  const stock = async () => {
    const p = await Product.findById(productId).lean();
    const v = p!.variants.find((x) => String(x._id) === v1)!;
    return { stock: v.stock, reserved: v.reserved };
  };
  const placeOnline = async (method: 'jazzcash' | 'easypaisa' = 'jazzcash') => {
    const res = await placeOrder(app, orderBody([{ variantId: v1, quantity: 1 }], { paymentMethod: method }));
    expect(res.status).toBe(201);
    return res.body.data.order.orderNumber as string;
  };
  const initiate = (orderNumber: string, method: 'jazzcash' | 'easypaisa' = 'jazzcash', phone = '03001234567') =>
    request(app).post(`/api/v1/payments/${method}/initiate`).send({ orderNumber, phone });
  const start = async (method: 'jazzcash' | 'easypaisa' = 'jazzcash') => {
    const orderNumber = await placeOnline(method);
    const res = await initiate(orderNumber, method);
    expect(res.status).toBe(200);
    return { orderNumber, paymentRef: res.body.data.paymentRef as string, redirect: res.body.data.redirect };
  };
  const orderOf = (orderNumber: string) => Order.findOne({ orderNumber }).lean();
  const paymentOf = (paymentRef: string) => Payment.findOne({ paymentRef }).lean();
  const commits = () => InventoryMovement.countDocuments({ type: 'commit' });

  describe('checkout and order creation', () => {
    it('offers online methods only when configured and the destination is known', async () => {
      const quote = (extra: object) => request(app).post('/api/v1/checkout/quote').send({ items: [{ variantId: v1, quantity: 1 }], ...extra });
      const methods = (res: request.Response) => Object.fromEntries(res.body.data.paymentMethods.map((m: { id: string; available: boolean }) => [m.id, m.available]));
      expect(methods(await quote({ province: 'Sindh', city: 'Karachi' }))).toEqual({ cod: true, jazzcash: true, easypaisa: true });
      expect(methods(await quote({}))).toEqual({ cod: false, jazzcash: false, easypaisa: false });
      setProviders({});
      expect(methods(await quote({ province: 'Sindh', city: 'Karachi' }))).toEqual({ cod: true, jazzcash: false, easypaisa: false });
      const refused = await placeOrder(app, orderBody([{ variantId: v1, quantity: 1 }], { paymentMethod: 'jazzcash' }));
      expect(refused.body.error.code).toBe('PAYMENT_METHOD_UNAVAILABLE');
    });

    it('places an online order that holds stock and waits for payment', async () => {
      const orderNumber = await placeOnline();
      const order = await orderOf(orderNumber);
      expect(order).toMatchObject({ status: 'awaiting_payment', paymentStatus: 'pending', paymentMethod: 'jazzcash', inventoryState: 'reserved' });
      expect(order!.cod).toBeUndefined();
      expect(order!.reservationExpiresAt!.getTime()).toBeGreaterThan(Date.now());
      expect(await stock()).toEqual({ stock: 4, reserved: 1 });
    });

    it('stops staff from confirming an unpaid online order but lets them cancel it', async () => {
      const orderNumber = await placeOnline();
      const id = String((await orderOf(orderNumber))!._id);
      const confirm = await admin.patch(`/admin/orders/${id}/status`, { status: 'confirmed' });
      expect(confirm.status).toBe(409);
      expect(confirm.body.error.code).toBe('INVALID_TRANSITION');
      const cancel = await admin.patch(`/admin/orders/${id}/status`, { status: 'cancelled', reason: 'Customer asked to cancel' });
      expect(cancel.status).toBe(200);
      expect(cancel.body.data.order.paymentStatus).toBe('cancelled');
      expect(await stock()).toEqual({ stock: 5, reserved: 0 });
    });
  });

  describe('starting a payment', () => {
    it('returns a signed JazzCash form built from the stored order amount', async () => {
      const { redirect, paymentRef, orderNumber } = await start();
      expect(redirect).toMatchObject({ method: 'POST', action: 'https://sandbox.jazzcash.test/form/' });
      expect(redirect.fields).toMatchObject({ pp_Amount: String(TOTAL), pp_TxnRefNo: paymentRef, pp_MerchantID: MERCHANT });
      const { pp_SecureHash, ...rest } = redirect.fields as Record<string, string>;
      expect(pp_SecureHash).toBe(jazzCashHash(rest, SALT));
      expect(await paymentOf(paymentRef)).toMatchObject({ amount: TOTAL, status: 'initiated', attempt: 1, orderNumber, provider: 'jazzcash' });
    });

    it('requires the matching order number and phone, method and a waiting order', async () => {
      const orderNumber = await placeOnline();
      expect((await initiate(orderNumber, 'jazzcash', '03451234567')).status).toBe(404);
      expect((await initiate('MPL-AAAAAAAA')).status).toBe(404);
      expect((await initiate(orderNumber, 'easypaisa')).status).toBe(400);
      const cod = (await placeOrder(app, orderBody([{ variantId: v1, quantity: 1 }]))).body.data.order.orderNumber;
      expect((await initiate(cod)).status).toBe(400);
      const withAmount = await request(app).post('/api/v1/payments/jazzcash/initiate').send({ orderNumber, phone: '03001234567', amount: 1 });
      expect(withAmount.status).toBe(400);
    });

    it('refuses once the window has expired and caps the number of attempts', async () => {
      const orderNumber = await placeOnline();
      for (let i = 0; i < 5; i++) expect((await initiate(orderNumber)).status).toBe(200);
      expect((await initiate(orderNumber)).status).toBe(409);
      await Order.updateOne({ orderNumber }, { reservationExpiresAt: new Date(Date.now() - 1000) });
      expect((await initiate(orderNumber)).status).toBe(409);
    });
  });

  describe('JazzCash return', () => {
    it('confirms a verified payment exactly once and commits stock once', async () => {
      const { orderNumber, paymentRef } = await start();
      const fields = jazzReturn(paymentRef);
      const res = await postReturn(fields);
      expect(res.status).toBe(303);
      expect(res.headers.location).toContain(`/checkout/result?order=${orderNumber}`);

      expect(await orderOf(orderNumber)).toMatchObject({ status: 'confirmed', paymentStatus: 'paid', inventoryState: 'committed' });
      expect(await paymentOf(paymentRef)).toMatchObject({ status: 'paid', providerRef: '123456789012', responseCode: '000' });
      expect(await stock()).toEqual({ stock: 4, reserved: 0 });
      expect(await commits()).toBe(1);

      // The same callback again, and two at once: still one payment, one confirmation, one stock commit.
      await postReturn(fields);
      await Promise.all([postReturn(fields), postReturn(fields)]);
      expect(await commits()).toBe(1);
      expect(await stock()).toEqual({ stock: 4, reserved: 0 });
      expect(await PaymentEvent.countDocuments({ paymentRef, result: 'paid' })).toBe(1);
    });

    it('shows staff the payment without leaking credentials', async () => {
      const { orderNumber, paymentRef } = await start();
      await postReturn(jazzReturn(paymentRef));
      const id = String((await orderOf(orderNumber))!._id);
      const detail = await admin.get(`/admin/orders/${id}`);
      expect(detail.body.data.order.payments[0]).toMatchObject({ paymentRef, status: 'paid', amount: TOTAL, provider: 'jazzcash' });
      const dump = JSON.stringify(detail.body) + JSON.stringify(await PaymentEvent.find().lean());
      expect(dump).not.toContain(JAZZ_PASSWORD);
      expect(dump).not.toContain(SALT);
      expect(dump).not.toMatch(/pp_SecureHash|pp_Password/i);
    });

    it('ignores tampered, unsigned and wrongly signed responses', async () => {
      const { orderNumber, paymentRef } = await start();
      const good = jazzReturn(paymentRef);
      const { pp_SecureHash: _drop, ...unsigned } = good;
      const attempts = [{ ...good, pp_Amount: '100' }, { ...good, pp_ResponseCode: '000', pp_TxnRefNo: paymentRef.replace(/.$/, paymentRef.endsWith('Z') ? 'Y' : 'Z') }, unsigned, jazzReturn(paymentRef, {}, 'attackers-salt')];
      for (const fields of attempts) {
        const res = await postReturn(fields);
        expect(res.status).toBe(303);
        expect(res.headers.location).toContain('invalid=1');
      }
      expect(await orderOf(orderNumber)).toMatchObject({ status: 'awaiting_payment', paymentStatus: 'pending' });
      expect(await paymentOf(paymentRef)).toMatchObject({ status: 'initiated' });
      expect(await PaymentEvent.countDocuments({ authentic: false })).toBeGreaterThan(0);
      expect(await commits()).toBe(0);
    });

    it('does not accept a correctly signed payment for the wrong amount', async () => {
      const { orderNumber, paymentRef } = await start();
      await postReturn(jazzReturn(paymentRef, { pp_Amount: '100' }));
      expect(await paymentOf(paymentRef)).toMatchObject({ status: 'review' });
      expect(await orderOf(orderNumber)).toMatchObject({ status: 'awaiting_payment', paymentStatus: 'pending' });
      expect(await commits()).toBe(0);
    });

    it('handles a failed attempt, a retry, success, and a late duplicate success', async () => {
      const orderNumber = await placeOnline();
      const first = (await initiate(orderNumber)).body.data.paymentRef as string;
      await postReturn(jazzReturn(first, { pp_ResponseCode: '110', pp_ResponseMessage: 'Declined' }));
      expect(await paymentOf(first)).toMatchObject({ status: 'failed', responseMessage: 'Declined' });
      expect(await orderOf(orderNumber)).toMatchObject({ status: 'awaiting_payment', paymentStatus: 'failed' });

      const second = (await initiate(orderNumber)).body.data.paymentRef as string;
      expect(second).not.toBe(first);
      expect(await orderOf(orderNumber)).toMatchObject({ paymentStatus: 'pending' });
      await postReturn(jazzReturn(second));
      expect(await orderOf(orderNumber)).toMatchObject({ status: 'confirmed', paymentStatus: 'paid' });

      // The first tab's payment finally goes through too: it is flagged for a refund, not double-confirmed.
      await postReturn(jazzReturn(first));
      expect(await paymentOf(first)).toMatchObject({ status: 'review', reviewReason: expect.stringMatching(/duplicate/i) });
      expect(await orderOf(orderNumber)).toMatchObject({ status: 'confirmed', paymentStatus: 'paid' });
      expect(await commits()).toBe(1);
    });

    it('treats code 124 as pending, then accepts the later success', async () => {
      const { orderNumber, paymentRef } = await start();
      await postReturn(jazzReturn(paymentRef, { pp_ResponseCode: '124' }));
      expect(await paymentOf(paymentRef)).toMatchObject({ status: 'pending' });
      expect(await orderOf(orderNumber)).toMatchObject({ status: 'awaiting_payment', paymentStatus: 'processing' });
      await postReturn(jazzReturn(paymentRef));
      expect(await orderOf(orderNumber)).toMatchObject({ status: 'confirmed', paymentStatus: 'paid' });
    });

    it('ignores references it never issued', async () => {
      const res = await postReturn(jazzReturn('T20260101000000ZZZZZ'));
      expect(res.status).toBe(303);
      expect(await Payment.countDocuments()).toBe(0);
    });
  });

  describe('unpaid orders expire', () => {
    const makeDue = (orderNumber: string) => Order.updateOne({ orderNumber }, { reservationExpiresAt: new Date(Date.now() - 1000) });

    it('cancels them, releases stock, and records a late payment for refund', async () => {
      const { orderNumber, paymentRef } = await start();
      await makeDue(orderNumber);
      expect(await expireUnpaidOrders()).toBe(1);
      expect(await orderOf(orderNumber)).toMatchObject({ status: 'cancelled', paymentStatus: 'expired', inventoryState: 'released', cancellation: { by: 'system' } });
      expect(await paymentOf(paymentRef)).toMatchObject({ status: 'expired' });
      expect(await stock()).toEqual({ stock: 5, reserved: 0 });

      await postReturn(jazzReturn(paymentRef));
      expect(await paymentOf(paymentRef)).toMatchObject({ status: 'paid' });
      expect(await orderOf(orderNumber)).toMatchObject({ status: 'cancelled', paymentStatus: 'refund_pending' });
      expect(await stock()).toEqual({ stock: 5, reserved: 0 });
    });

    it('leaves orders that are not yet due or already paid alone', async () => {
      const waiting = await placeOnline();
      const { orderNumber: paid, paymentRef } = await start();
      await postReturn(jazzReturn(paymentRef));
      await makeDue(paid);
      expect(await expireUnpaidOrders()).toBe(0);
      expect(await orderOf(waiting)).toMatchObject({ status: 'awaiting_payment' });
      expect(await orderOf(paid)).toMatchObject({ status: 'confirmed', paymentStatus: 'paid' });
    });

    it('asks the provider one last time and keeps an order that was in fact paid', async () => {
      const { orderNumber, paymentRef } = await start();
      jazzHandler = async (_u, r) => ({ status: 200, body: JSON.stringify(inquiryPaid(JSON.parse(r.body as string).pp_TxnRefNo)) });
      await makeDue(orderNumber);
      expect(await expireUnpaidOrders()).toBe(0);
      expect(await orderOf(orderNumber)).toMatchObject({ status: 'confirmed', paymentStatus: 'paid' });
      expect(await paymentOf(paymentRef)).toMatchObject({ status: 'paid' });
      expect(await PaymentEvent.countDocuments({ paymentRef, source: 'inquiry', result: 'paid' })).toBe(1);
    });
  });

  describe('Easypaisa', () => {
    const paidJson = { store_id: 'TESTSTORE', transaction_status: 'PAID', transaction_amount: '20300.0', transaction_id: '777' };

    it('starts a payment with the hashed Index.jsf request', async () => {
      const { redirect, paymentRef } = await start('easypaisa');
      expect(redirect.action).toBe(`${EP_BASE}/easypay/Index.jsf`);
      expect(redirect.fields).toMatchObject({ storeId: 'TESTSTORE', orderRefNum: paymentRef, amount: '20300.0', mobileNum: '03001234567' });
      expect(redirect.fields.merchantHashedReq).toBeTruthy();
    });

    it('forwards the auth token to Confirm.jsf under a narrow content security policy', async () => {
      const res = await request(app).get('/api/v1/payments/easypaisa/postback').query({ auth_token: 'tok_1234567890' });
      expect(res.status).toBe(200);
      expect(res.text).toContain(`action="${EP_BASE}/easypay/Confirm.jsf"`);
      expect(res.text).toContain('name="auth_token" value="tok_1234567890"');
      const csp = res.headers['content-security-policy'] as string;
      expect(csp).toContain(`form-action ${EP_BASE}`);
      expect(csp).toMatch(/script-src 'nonce-[^']+'/);
      const nonce = /nonce-([^']+)/.exec(csp)![1];
      expect(res.text).toContain(`<script nonce="${nonce}">`);
      expect((await request(app).get('/api/v1/payments/easypaisa/postback').query({ auth_token: '"><script>alert(1)</script>' })).status).toBe(400);
    });

    it('sends the shopper back to the store without trusting the redirect', async () => {
      const { orderNumber, paymentRef } = await start('easypaisa');
      const res = await request(app).get('/api/v1/payments/easypaisa/postback').query({ orderRefNumber: paymentRef, status: 'PAID' });
      expect(res.status).toBe(303);
      expect(res.headers.location).toContain(`order=${orderNumber}`);
      expect(await orderOf(orderNumber)).toMatchObject({ paymentStatus: 'pending', status: 'awaiting_payment' });
    });

    it('confirms payment from a verified notification, once', async () => {
      const { orderNumber, paymentRef } = await start('easypaisa');
      epHandler = async () => ({ status: 200, body: JSON.stringify(paidJson) });
      const first = await ipn(paymentRef);
      expect(first.status).toBe(200);
      expect(await orderOf(orderNumber)).toMatchObject({ status: 'confirmed', paymentStatus: 'paid', inventoryState: 'committed' });
      expect(await paymentOf(paymentRef)).toMatchObject({ status: 'paid', providerRef: '777' });
      await ipn(paymentRef);
      await Promise.all([ipn(paymentRef), ipn(paymentRef)]);
      expect(await commits()).toBe(1);
      expect(await stock()).toEqual({ stock: 4, reserved: 0 });
    });

    it('never fetches a notification url that is not on the Easypay host', async () => {
      await start('easypaisa');
      for (const url of ['https://evil.example/easypay/ipn/TXXXXXXXXXXXXXXXXXXX', 'http://easypaystg.easypaisa.com.pk/x/TXXXXXXXXXXXXXXXXXXX', 'https://169.254.169.254/latest/meta-data/TXXXXXXXXXXXXXXXXXXX', '']) {
        const res = await request(app).get('/api/v1/payments/easypaisa/ipn').query({ url });
        expect(res.status).toBe(400);
      }
      expect(epCalls).toEqual([]);
      expect(await PaymentEvent.countDocuments({ authentic: false, provider: 'easypaisa' })).toBeGreaterThan(0);
    });

    it('records failures, rejects wrong amounts, and shrugs off unknown references', async () => {
      const failed = await start('easypaisa');
      epHandler = async () => ({ status: 200, body: JSON.stringify({ ...paidJson, transaction_status: 'FAILED' }) });
      await ipn(failed.paymentRef);
      expect(await paymentOf(failed.paymentRef)).toMatchObject({ status: 'failed' });

      const wrong = await start('easypaisa');
      epHandler = async () => ({ status: 200, body: JSON.stringify({ ...paidJson, transaction_amount: '1.0' }) });
      await ipn(wrong.paymentRef);
      expect(await paymentOf(wrong.paymentRef)).toMatchObject({ status: 'review' });
      expect(await orderOf(wrong.orderNumber)).toMatchObject({ paymentStatus: 'pending' });

      epHandler = async () => ({ status: 200, body: JSON.stringify(paidJson) });
      expect((await ipn('TUNKNOWNREFERENCE12')).status).toBe(200);
      expect(await commits()).toBe(0);
    });
  });

  describe('admin visibility and reconciliation', () => {
    it('lists payments for staff with payments:read, and only super admins can reconcile', async () => {
      const { paymentRef } = await start();
      const om = await adminClient(app, 'om@example.com', 'order_manager');
      const list = await om.get('/admin/payments?status=initiated');
      expect(list.body.data.items.map((p: { paymentRef: string }) => p.paymentRef)).toEqual([paymentRef]);
      expect((await om.get('/admin/payments?provider=easypaisa')).body.data.items).toEqual([]);
      expect((await om.post(`/admin/payments/${paymentRef}/reconcile`)).status).toBe(403);
      const support = await adminClient(app, 'support@example.com', 'support_staff');
      expect((await support.get('/admin/payments')).status).toBe(403);
    });

    it('reconciles an attempt from the provider when a callback was lost', async () => {
      const { orderNumber, paymentRef } = await start();
      jazzHandler = async () => ({ status: 200, body: JSON.stringify(inquiryPaid(paymentRef)) });
      const res = await admin.post(`/admin/payments/${paymentRef}/reconcile`);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ providerAnswered: true, payment: { status: 'paid' } });
      expect(await orderOf(orderNumber)).toMatchObject({ status: 'confirmed', paymentStatus: 'paid' });
      expect((await admin.post('/admin/payments/TNOSUCHPAYMENT0000000/reconcile')).status).toBe(404);
      expect((await admin.post('/admin/payments/bad-ref/reconcile')).status).toBe(400);
    });

    it('says so when the provider cannot answer, and changes nothing', async () => {
      const { orderNumber, paymentRef } = await start();
      const res = await admin.post(`/admin/payments/${paymentRef}/reconcile`);
      expect(res.body.data.providerAnswered).toBe(false);
      expect(await orderOf(orderNumber)).toMatchObject({ paymentStatus: 'pending' });
    });
  });

  it('hides provider endpoints that are not configured', async () => {
    setProviders({});
    expect((await postReturn(jazzReturn('T20260101000000ZZZZZ'))).status).toBe(404);
    expect((await request(app).get('/api/v1/payments/easypaisa/ipn').query({ url: 'x' })).status).toBe(404);
    expect((await request(app).get('/api/v1/payments/easypaisa/postback')).status).toBe(404);
  });
});
