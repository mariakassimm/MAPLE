import { randomUUID } from 'crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { Coupon } from '../../src/modules/coupons/coupon.model';
import { InventoryMovement } from '../../src/modules/inventory/inventoryMovement.model';
import { Order } from '../../src/modules/orders/order.model';
import { Product } from '../../src/modules/products/product.model';
import { adminClient, orderBody, placeOrder, seedStore, type AdminClient } from '../factories';
import { clearDb, createUser, loginAs, startTestDb, stopTestDb } from '../helpers';

const app = createApp();
const post = (path: string, body: object) => request(app).post(`/api/v1${path}`).send(body);

describe('cart pricing, coupons and checkout', () => {
  let admin: AdminClient;
  let v1: string; // TOTE-1: Rs 20,000, stock 5
  let v2: string; // TOTE-2: Rs 10,000, stock 1
  let productId: string;

  beforeAll(startTestDb);
  afterAll(stopTestDb);
  beforeEach(async () => {
    await clearDb();
    admin = await adminClient(app);
    const seeded = await seedStore(admin);
    ({ v1, v2 } = seeded);
    productId = seeded.product.id;
  });

  const stock = async (variantId: string) => {
    const p = await Product.findById(productId).lean();
    const v = p!.variants.find((x) => String(x._id) === variantId)!;
    return { stock: v.stock, reserved: v.reserved };
  };
  const makeCoupon = (over: object = {}) => admin.post('/admin/coupons', { code: 'welcome10', type: 'percent', value: 10, maxDiscount: 100_000, ...over });

  describe('stateless cart pricing', () => {
    it('merges duplicate lines and recomputes totals on the server', async () => {
      const res = await post('/cart/price', { items: [{ variantId: v1, quantity: 1 }, { variantId: v1, quantity: 1 }] });
      expect(res.status).toBe(200);
      const cart = res.body.data.cart;
      expect(cart.lines).toHaveLength(1);
      expect(cart.lines[0]).toMatchObject({ quantity: 2, unitPrice: 2_000_000, lineTotal: 4_000_000, status: 'ok', sku: 'TOTE-1' });
      expect(cart).toMatchObject({ subtotal: 4_000_000, discount: 0, shippingFee: 30_000, total: 4_030_000, canCheckout: true, currency: 'PKR' });
    });

    it('rejects client-supplied prices', async () => {
      const res = await post('/cart/price', { items: [{ variantId: v1, quantity: 1, unitPrice: 1 }] });
      expect(res.status).toBe(400);
    });

    it('flags unavailable and over-quantity lines and leaves them out of the totals', async () => {
      const res = await post('/cart/price', { items: [{ variantId: v1, quantity: 1 }, { variantId: v2, quantity: 2 }, { variantId: '0'.repeat(24), quantity: 1 }] });
      const cart = res.body.data.cart;
      const status = Object.fromEntries(cart.lines.map((l: { variantId: string; status: string }) => [l.variantId, l.status]));
      expect(status).toEqual({ [v1]: 'ok', [v2]: 'insufficient_stock', ['0'.repeat(24)]: 'unavailable' });
      expect(cart.lines.find((l: { variantId: string }) => l.variantId === v2).availableQuantity).toBe(1);
      expect(cart.subtotal).toBe(2_000_000);
      expect(cart.canCheckout).toBe(false);
    });

    it('treats quantity above the per-line limit as unavailable', async () => {
      const res = await post('/cart/price', { items: [{ variantId: v1, quantity: 11 }] });
      expect(res.body.data.cart.lines[0].status).toBe('insufficient_stock');
    });

    it('applies free shipping above the configured threshold', async () => {
      await admin.patch('/admin/settings', { shipping: { freeShippingThreshold: 5_000_000 } });
      const below = (await post('/cart/price', { items: [{ variantId: v1, quantity: 2 }] })).body.data.cart;
      expect(below).toMatchObject({ shippingFee: 30_000, freeShippingRemaining: 1_000_000 });
      const above = (await post('/cart/price', { items: [{ variantId: v1, quantity: 3 }] })).body.data.cart;
      expect(above).toMatchObject({ shippingFee: 0, freeShippingRemaining: null, total: 6_000_000 });
    });
  });

  describe('coupons', () => {
    it('applies a capped percentage discount to merchandise only', async () => {
      expect((await makeCoupon()).status).toBe(201);
      const cart = (await post('/cart/price', { items: [{ variantId: v1, quantity: 2 }], couponCode: 'WELCOME10' })).body.data.cart;
      expect(cart).toMatchObject({ subtotal: 4_000_000, discount: 100_000, total: 3_930_000, canCheckout: true });
      expect(cart.coupon).toEqual({ code: 'WELCOME10', valid: true, message: null });
    });

    it('reports unknown, expired and below-minimum coupons without failing the quote', async () => {
      await makeCoupon({ code: 'OLD', expiresAt: new Date(Date.now() - 86_400_000).toISOString() });
      await makeCoupon({ code: 'BIGSPEND', type: 'fixed', value: 50_000, minOrderValue: 10_000_000 });
      for (const code of ['NOPE', 'OLD', 'BIGSPEND']) {
        const cart = (await post('/cart/price', { items: [{ variantId: v1, quantity: 1 }], couponCode: code })).body.data.cart;
        expect(cart.coupon.valid).toBe(false);
        expect(cart.discount).toBe(0);
        expect(cart.canCheckout).toBe(false);
      }
      const min = (await post('/cart/price', { items: [{ variantId: v1, quantity: 1 }], couponCode: 'BIGSPEND' })).body.data.cart;
      expect(min.coupon.message).toMatch(/minimum order/i);
    });

    it('enforces the usage limit when orders redeem it', async () => {
      await makeCoupon({ usageLimit: 1 });
      const first = await placeOrder(app, orderBody([{ variantId: v1, quantity: 1 }], { couponCode: 'WELCOME10' }));
      expect(first.status).toBe(201);
      expect(first.body.data.order).toMatchObject({ couponCode: 'WELCOME10', discountTotal: 100_000 });
      const second = await placeOrder(app, orderBody([{ variantId: v1, quantity: 1 }], { couponCode: 'WELCOME10' }));
      expect(second.status).toBe(409);
      expect(second.body.error.code).toBe('COUPON_INVALID');
      expect((await Coupon.findOne({ code: 'WELCOME10' }))!.usedCount).toBe(1);
      expect(await stock(v1)).toEqual({ stock: 4, reserved: 1 });
    });

    it('validates coupon definitions and permissions', async () => {
      expect((await makeCoupon({ value: 150 })).status).toBe(400);
      expect((await makeCoupon({ startsAt: '2026-02-01', expiresAt: '2026-01-01' })).status).toBe(400);
      expect((await makeCoupon()).status).toBe(201);
      expect((await makeCoupon()).status).toBe(409);
      const om = await adminClient(app, 'om@example.com', 'order_manager');
      expect((await om.post('/admin/coupons', { code: 'NOPE', type: 'fixed', value: 100 })).status).toBe(403);
    });
  });

  describe('quote', () => {
    const quote = (extra: object) => post('/checkout/quote', { items: [{ variantId: v1, quantity: 1 }], ...extra });

    it('reports serviceability and payment methods per destination', async () => {
      const khi = (await quote({ province: 'Sindh', city: ' KARACHI ' })).body.data;
      expect(khi.serviceability).toEqual({ serviceable: true, codAvailable: true });
      const methods = Object.fromEntries(khi.paymentMethods.map((m: { id: string; available: boolean }) => [m.id, m.available]));
      expect(methods).toEqual({ cod: true, jazzcash: false, easypaisa: false });

      const quetta = (await quote({ province: 'Balochistan', city: 'Quetta' })).body.data;
      expect(quetta.serviceability).toEqual({ serviceable: true, codAvailable: false });
      expect(quetta.paymentMethods[0]).toMatchObject({ id: 'cod', available: false });

      expect((await quote({ province: 'Sindh', city: 'Atlantis' })).body.data.serviceability).toEqual({ serviceable: false, codAvailable: false });
      expect((await quote({})).body.data.serviceability).toBeNull();
    });

    it('lists active cities', async () => {
      const cities = (await request(app).get('/api/v1/checkout/cities')).body.data.cities.map((c: { city: string }) => c.city);
      expect(cities).toEqual(['Quetta', 'Karachi']);
    });
  });

  describe('placing an order', () => {
    it('creates a COD order, snapshots the data and reserves stock', async () => {
      const res = await placeOrder(app, orderBody([{ variantId: v1, quantity: 2 }], { customer: { name: 'Ayesha Khan', phone: '0300 1234567', email: 'a@example.com' } }));
      expect(res.status).toBe(201);
      const order = res.body.data.order;
      expect(order.orderNumber).toMatch(/^MPL-[A-Z0-9]{8}$/);
      expect(order).toMatchObject({
        status: 'pending_confirmation', paymentMethod: 'cod', paymentStatus: 'unpaid', shipmentStatus: 'not_booked',
        subtotal: 4_000_000, shippingFee: 30_000, total: 4_030_000, currency: 'PKR',
        customer: { phone: '+923001234567' }, shippingAddress: { city: 'Karachi', recipientName: 'Ayesha Khan', phone: '+923001234567' },
      });
      expect(order.items[0]).toMatchObject({ sku: 'TOTE-1', name: 'Tote', unitPrice: 2_000_000, quantity: 2, lineTotal: 4_000_000 });
      expect(JSON.stringify(order)).not.toMatch(/inventoryState|userId|idempotency|requestFingerprint/);

      expect(await stock(v1)).toEqual({ stock: 3, reserved: 2 });
      const stored = await Order.findOne({ orderNumber: order.orderNumber }).lean();
      expect(stored!.inventoryState).toBe('reserved');
      expect(stored!.cod).toMatchObject({ amountDue: 4_030_000, collectedAmount: 0, remittedAmount: 0 });
      expect(await InventoryMovement.countDocuments({ type: 'reserve', orderId: stored!._id })).toBe(1);
    });

    it('does not let later catalogue edits rewrite the order', async () => {
      const res = await placeOrder(app, orderBody([{ variantId: v1, quantity: 1 }]));
      await admin.patch(`/admin/products/${productId}/variants/${v1}`, { price: 9_900_000 });
      await admin.patch(`/admin/products/${productId}`, { name: 'Renamed' });
      const tracked = await post('/orders/track', { orderNumber: res.body.data.order.orderNumber, phone: '03001234567' });
      expect(tracked.body.data.order.items[0]).toMatchObject({ name: 'Tote', unitPrice: 2_000_000 });
      // Tracked orders link back to the live product so the storefront can offer a review.
      expect(typeof tracked.body.data.order.items[0].productSlug).toBe('string');
    });

    describe('idempotency', () => {
      it('requires an Idempotency-Key', async () => {
        const res = await request(app).post('/api/v1/orders').send(orderBody([{ variantId: v1, quantity: 1 }]));
        expect(res.status).toBe(400);
        expect((await request(app).post('/api/v1/orders').set('Idempotency-Key', 'short').send(orderBody([{ variantId: v1, quantity: 1 }]))).status).toBe(400);
      });

      it('returns the original order when the same request is retried', async () => {
        const key = randomUUID();
        const body = orderBody([{ variantId: v1, quantity: 2 }]);
        const first = await placeOrder(app, body, key);
        const retry = await placeOrder(app, body, key);
        expect(first.status).toBe(201);
        expect(retry.status).toBe(200);
        expect(retry.headers['idempotent-replay']).toBe('true');
        expect(retry.body.data.order.orderNumber).toBe(first.body.data.order.orderNumber);
        expect(await Order.countDocuments()).toBe(1);
        expect(await stock(v1)).toEqual({ stock: 3, reserved: 2 });
      });

      it('refuses to reuse a key for a different request', async () => {
        const key = randomUUID();
        await placeOrder(app, orderBody([{ variantId: v1, quantity: 1 }]), key);
        const other = await placeOrder(app, orderBody([{ variantId: v1, quantity: 2 }]), key);
        expect(other.status).toBe(409);
        expect(other.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
      });

      it('creates one order and holds stock once when the same request arrives twice at the same instant', async () => {
        const key = randomUUID();
        const body = orderBody([{ variantId: v1, quantity: 2 }]);
        const [a, b] = await Promise.all([placeOrder(app, body, key), placeOrder(app, body, key)]);
        expect([a.status, b.status].sort()).toEqual([200, 201]);
        expect(a.body.data.order.orderNumber).toBe(b.body.data.order.orderNumber);
        expect(await Order.countDocuments()).toBe(1);
        expect(await stock(v1)).toEqual({ stock: 3, reserved: 2 });
      });
    });

    it('rejects a stale expected total and accepts the current one', async () => {
      const stale = await placeOrder(app, orderBody([{ variantId: v1, quantity: 1 }], { expectedTotal: 1_000 }));
      expect(stale.status).toBe(409);
      expect(stale.body.error).toMatchObject({ code: 'PRICE_CHANGED', details: { total: 2_030_000 } });
      expect(await Order.countDocuments()).toBe(0);
      expect(await stock(v1)).toEqual({ stock: 5, reserved: 0 });
      expect((await placeOrder(app, orderBody([{ variantId: v1, quantity: 1 }], { expectedTotal: 2_030_000 }))).status).toBe(201);
    });

    it('blocks unserviceable destinations and unavailable payment methods without touching stock', async () => {
      const items = [{ variantId: v1, quantity: 1 }];
      const nowhere = await placeOrder(app, orderBody(items, { shippingAddress: { province: 'Sindh', city: 'Atlantis', area: 'Centre', line1: 'House 1, Road 2' } }));
      expect(nowhere.body.error.code).toBe('NOT_SERVICEABLE');
      const wrongProvince = await placeOrder(app, orderBody(items, { shippingAddress: { province: 'Punjab', city: 'Karachi', area: 'Centre', line1: 'House 1, Road 2' } }));
      expect(wrongProvince.body.error.code).toBe('NOT_SERVICEABLE');
      const noCod = await placeOrder(app, orderBody(items, { shippingAddress: { province: 'Balochistan', city: 'Quetta', area: 'Centre', line1: 'House 1, Road 2' } }));
      expect(noCod.body.error.code).toBe('PAYMENT_METHOD_UNAVAILABLE');
      for (const paymentMethod of ['jazzcash', 'easypaisa']) {
        expect((await placeOrder(app, orderBody(items, { paymentMethod }))).body.error.code).toBe('PAYMENT_METHOD_UNAVAILABLE');
      }
      expect(await stock(v1)).toEqual({ stock: 5, reserved: 0 });
      expect(await Order.countDocuments()).toBe(0);
    });

    it('refuses items that are out of stock or gone', async () => {
      const res = await placeOrder(app, orderBody([{ variantId: v2, quantity: 2 }]));
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ITEMS_UNAVAILABLE');
      await admin.post(`/admin/products/${productId}/archive`);
      expect((await placeOrder(app, orderBody([{ variantId: v1, quantity: 1 }]))).body.error.code).toBe('ITEMS_UNAVAILABLE');
      expect(await Order.countDocuments()).toBe(0);
    });

    it('validates customer and address fields', async () => {
      const items = [{ variantId: v1, quantity: 1 }];
      const bad = (extra: object) => placeOrder(app, orderBody(items, extra));
      expect((await bad({ customer: { name: 'A B', phone: '12345' } })).status).toBe(400);
      expect((await bad({ customer: { name: 'A B', phone: '03001234567', email: 'nope' } })).status).toBe(400);
      expect((await bad({ shippingAddress: { province: 'Sindh', city: 'Karachi', area: 'Clifton', line1: 'x' } })).status).toBe(400);
      expect((await bad({ shippingAddress: { province: 'Sindh', city: 'Karachi', area: 'Clifton', line1: 'House 1, Road 2', postalCode: '123' } })).status).toBe(400);
      expect((await bad({ shippingAddress: { province: 'Mars', city: 'Karachi', area: 'Clifton', line1: 'House 1, Road 2' } })).status).toBe(400);
      expect((await bad({ total: 1 })).status).toBe(400);
      expect((await placeOrder(app, { ...orderBody(items), items: [] })).status).toBe(400);
    });

    it('never oversells the last unit to two customers at once', async () => {
      const items = [{ variantId: v2, quantity: 1 }];
      const [a, b] = await Promise.all([placeOrder(app, orderBody(items)), placeOrder(app, orderBody(items, { customer: { name: 'Sara Ali', phone: '03211234567', email: 'sara@example.com' } }))]);
      expect([a.status, b.status].sort()).toEqual([201, 409]);
      expect(await Order.countDocuments()).toBe(1);
      expect(await stock(v2)).toEqual({ stock: 0, reserved: 1 });
    });
  });

  describe('order access', () => {
    it('lets a guest track with order number and phone only', async () => {
      const { body } = await placeOrder(app, orderBody([{ variantId: v1, quantity: 1 }]));
      const { orderNumber } = body.data.order;
      const ok = await post('/orders/track', { orderNumber: orderNumber.toLowerCase(), phone: '+92 300 1234567' });
      expect(ok.status).toBe(200);
      expect(ok.body.data.order.orderNumber).toBe(orderNumber);
      expect((await post('/orders/track', { orderNumber, phone: '03451234567' })).status).toBe(404);
      expect((await post('/orders/track', { orderNumber: 'MPL-AAAAAAAA', phone: '03001234567' })).status).toBe(404);
    });

    it('shows a guest the order but not the street address or full contact details', async () => {
      const { body } = await placeOrder(app, orderBody([{ variantId: v1, quantity: 1 }]));
      const { orderNumber } = body.data.order;
      const tracked = (await post('/orders/track', { orderNumber, phone: '03001234567' })).body.data.order;
      expect(tracked.shippingAddress).toMatchObject({ city: 'Karachi', area: 'Gulshan-e-Iqbal', line1: '' });
      expect(JSON.stringify(tracked)).not.toMatch(/House 12|03001234567|\+923001234567|ayesha@example\.com/);
      expect(tracked.customer.phone).toMatch(/•/);
      expect(tracked.items).toHaveLength(1);
    });

    it('locks one order number after repeated wrong phone numbers, even from many addresses', async () => {
      const { body } = await placeOrder(app, orderBody([{ variantId: v1, quantity: 1 }]));
      const { orderNumber } = body.data.order;
      for (let i = 0; i < 5; i++) expect((await post('/orders/track', { orderNumber, phone: `0345123456${i}` })).status).toBe(404);
      expect((await post('/orders/track', { orderNumber, phone: '03001234567' })).status).toBe(429); // right phone, but locked
    });

    it('takes the email from the signed-in account when the form leaves it out', async () => {
      await createUser({ email: 'fallback@example.com' });
      const client = await loginAs(app, 'fallback@example.com');
      const res = await client.agent.post('/api/v1/orders').set('Idempotency-Key', randomUUID()).set('X-CSRF-Token', client.csrf)
        .send(orderBody([{ variantId: v1, quantity: 1 }], { customer: { name: 'Ayesha Khan', phone: '0300 1234567' } }));
      expect(res.status).toBe(201);
      expect(res.body.data.order.customer.email).toBe('fallback@example.com');
    });

    it('links orders to a signed-in customer, enforces CSRF, and isolates accounts', async () => {
      await createUser({ email: 'ayesha@example.com' });
      await createUser({ email: 'other@example.com' });
      const ayesha = await loginAs(app, 'ayesha@example.com');
      const other = await loginAs(app, 'other@example.com');
      const body = orderBody([{ variantId: v1, quantity: 1 }]);

      const noCsrf = await ayesha.agent.post('/api/v1/orders').set('Idempotency-Key', randomUUID()).send(body);
      expect(noCsrf.status).toBe(403);
      const placed = await ayesha.agent.post('/api/v1/orders').set('Idempotency-Key', randomUUID()).set('X-CSRF-Token', ayesha.csrf).send(body);
      expect(placed.status).toBe(201);
      const { orderNumber } = placed.body.data.order;
      await placeOrder(app, orderBody([{ variantId: v1, quantity: 1 }])); // a guest order, not linked to anyone

      const mine = await ayesha.agent.get('/api/v1/account/orders');
      expect(mine.body.data.items.map((o: { orderNumber: string }) => o.orderNumber)).toEqual([orderNumber]);
      expect((await ayesha.agent.get(`/api/v1/account/orders/${orderNumber}`)).status).toBe(200);
      expect((await other.agent.get(`/api/v1/account/orders/${orderNumber}`)).status).toBe(404);
      expect((await other.agent.get('/api/v1/account/orders')).body.data.items).toEqual([]);
      expect((await request(app).get('/api/v1/account/orders')).status).toBe(401);
    });

    it('persists a signed-in customer cart with duplicate lines merged', async () => {
      await createUser({ email: 'ayesha@example.com' });
      const { agent, csrf } = await loginAs(app, 'ayesha@example.com');
      expect((await agent.put('/api/v1/cart').send({ items: [{ variantId: v1, quantity: 1 }] })).status).toBe(403);
      const saved = await agent.put('/api/v1/cart').set('X-CSRF-Token', csrf).send({ items: [{ variantId: v1, quantity: 1 }, { variantId: v1, quantity: 2 }] });
      expect(saved.body.data.cart.lines).toHaveLength(1);
      const got = await agent.get('/api/v1/cart');
      expect(got.body.data.cart.lines[0]).toMatchObject({ quantity: 3, status: 'ok' });
      await agent.delete('/api/v1/cart').set('X-CSRF-Token', csrf);
      expect((await agent.get('/api/v1/cart')).body.data.cart.lines).toEqual([]);
      expect((await request(app).get('/api/v1/cart')).status).toBe(401);
    });
  });
});
