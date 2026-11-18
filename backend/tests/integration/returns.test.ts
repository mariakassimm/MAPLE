import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { InventoryMovement } from '../../src/modules/inventory/inventoryMovement.model';
import { Order } from '../../src/modules/orders/order.model';
import { Product } from '../../src/modules/products/product.model';
import { Return } from '../../src/modules/returns/return.model';
import { adminClient, orderBody, placeDeliveredOrder, placeOrder, seedStore, type AdminClient } from '../factories';
import { clearDb, startTestDb, stopTestDb } from '../helpers';

const app = createApp();
const post = (path: string, body: object) => request(app).post(`/api/v1${path}`).send(body);

describe('returns and refunds', () => {
  let admin: AdminClient;
  let v1: string;
  let productId: string;

  beforeAll(startTestDb);
  afterAll(stopTestDb);
  beforeEach(async () => {
    await clearDb();
    admin = await adminClient(app);
    const seeded = await seedStore(admin);
    v1 = seeded.v1;
    productId = seeded.product.id;
  });

  const stock = async () => (await Product.findById(productId).lean())!.variants.find((v) => String(v._id) === v1)!.stock;
  const delivered = (quantity = 2) => placeDeliveredOrder(app, admin, v1, { quantity });
  const ask = (orderNumber: string, over: object = {}) =>
    post('/returns', { orderNumber, phone: '03001234567', type: 'refund', reason: 'defective', items: [{ variantId: v1, quantity: 1 }], ...over });
  const patch = (id: string, body: object) => admin.patch(`/admin/returns/${id}`, body);
  const idOf = async (reference: string) => String((await Return.findOne({ reference }).lean())!._id);

  describe('requesting', () => {
    it('opens a return for a delivered order, with order number and phone only', async () => {
      const { orderNumber } = await delivered();
      const res = await ask(orderNumber, { details: 'Strap came loose' });
      expect(res.status).toBe(201);
      expect(res.body.data.return).toMatchObject({ orderNumber, type: 'refund', reason: 'defective', status: 'requested', details: 'Strap came loose', items: [{ sku: 'TOTE-1', quantity: 1 }] });
      expect(res.body.data.return.reference).toMatch(/^RTN-[A-Z0-9]{8}$/);
      expect(JSON.stringify(res.body)).not.toMatch(/customer|actorId|orderId/);
      const lookup = await post('/returns/lookup', { orderNumber, phone: '0300 1234567' });
      expect(lookup.body.data.returns).toHaveLength(1);
      expect((await post('/returns/lookup', { orderNumber, phone: '03451234567' })).status).toBe(404);
    });

    it('allows only one open return per order, and a new one after it is closed', async () => {
      const { orderNumber } = await delivered();
      const first = await ask(orderNumber);
      expect((await ask(orderNumber)).status).toBe(409);
      const id = await idOf(first.body.data.return.reference);
      await patch(id, { status: 'rejected', note: 'Outside warranty' });
      expect((await ask(orderNumber)).status).toBe(201);
    });

    it('refuses undelivered orders, outsiders, and items or quantities that were not ordered', async () => {
      const early = await placeOrder(app, orderBody([{ variantId: v1, quantity: 1 }]));
      expect((await ask(early.body.data.order.orderNumber)).status).toBe(409);
      const { orderNumber } = await delivered(2);
      expect((await ask(orderNumber, { items: [{ variantId: v1, quantity: 3 }] })).status).toBe(400);
      expect((await ask(orderNumber, { items: [{ variantId: '0'.repeat(24), quantity: 1 }] })).status).toBe(400);
      expect((await ask(orderNumber, { items: [] })).status).toBe(400);
      expect((await ask(orderNumber, { reason: 'because' })).status).toBe(400);
      expect((await ask('MPL-AAAAAAAA')).status).toBe(404);
    });

    it('enforces the return period, which staff can change', async () => {
      const { id, orderNumber } = await delivered();
      const old = new Date(Date.now() - 10 * 86_400_000);
      await Order.updateOne({ _id: id }, { $set: { 'statusHistory.$[h].at': old } }, { arrayFilters: [{ 'h.status': 'delivered' }] });
      const late = await ask(orderNumber);
      expect(late.status).toBe(409);
      expect(late.body.error.message).toMatch(/7-day return period/);
      expect((await admin.patch('/admin/settings', { returns: { windowDays: 30 } })).status).toBe(200);
      expect((await ask(orderNumber)).status).toBe(201);
    });
  });

  describe('processing', () => {
    const open = async (over: object = {}) => {
      const { id, orderNumber } = await delivered(2);
      const res = await ask(orderNumber, over);
      return { orderId: id, orderNumber, returnId: await idOf(res.body.data.return.reference), reference: res.body.data.return.reference as string };
    };

    it('walks approve, receive and refund, recording who did what', async () => {
      const { returnId, orderId } = await open();
      expect((await patch(returnId, { status: 'approved' })).body.data.return.status).toBe('approved');
      expect((await patch(returnId, { status: 'received' })).status).toBe(200);
      const refunded = await patch(returnId, { status: 'refunded', refundAmount: 2_000_000, note: 'Refunded to JazzCash' });
      expect(refunded.body.data.return).toMatchObject({ status: 'refunded', refundAmount: 2_000_000, active: false });
      expect(refunded.body.data.return.history.map((h: { status: string }) => h.status)).toEqual(['requested', 'approved', 'received', 'refunded']);
      expect(refunded.body.data.return.history[3].actorId).toBeTruthy();
      expect((await Order.findById(orderId).lean())!.refundedAmount).toBe(2_000_000);
    });

    it('does not put anything back on sale until staff inspect and say so', async () => {
      const { returnId, orderId } = await open({ items: [{ variantId: v1, quantity: 2 }] });
      expect(await stock()).toBe(3);
      await patch(returnId, { status: 'approved' });
      expect(await stock()).toBe(3);
      expect((await patch(returnId, { status: 'received', restock: [{ variantId: v1, quantity: 2 }] })).status).toBe(200);
      expect(await stock()).toBe(5);
      const moves = await InventoryMovement.find({ type: 'return' }).lean();
      expect(moves).toHaveLength(1);
      expect(moves[0]!.stockDelta).toBe(2);
      expect(String(moves[0]!.orderId)).toBe(orderId);
    });

    it('can restock only some of the returned units, and only at the receiving step', async () => {
      const first = await open();
      await patch(first.returnId, { status: 'approved' });
      expect((await patch(first.returnId, { status: 'received', restock: [{ variantId: v1, quantity: 5 }] })).status).toBe(400);
      expect((await patch(first.returnId, { status: 'received', restock: [{ variantId: '0'.repeat(24), quantity: 1 }] })).status).toBe(400);
      await patch(first.returnId, { status: 'received', restock: [{ variantId: v1, quantity: 1 }] });
      expect(await stock()).toBe(4);
      expect((await patch(first.returnId, { status: 'closed', restock: [{ variantId: v1, quantity: 1 }] })).status).toBe(400);
    });

    it('validates the status flow', async () => {
      const { returnId } = await open();
      expect((await patch(returnId, { status: 'received' })).status).toBe(409); // not approved yet
      expect((await patch(returnId, { status: 'refunded', refundAmount: 100 })).status).toBe(409);
      expect((await patch(returnId, { status: 'rejected' })).status).toBe(400); // reason required
      expect((await patch(returnId, { status: 'approved', refundAmount: 100 })).status).toBe(400);
      await patch(returnId, { status: 'approved' });
      expect((await patch(returnId, { status: 'approved' })).status).toBe(409);
      await patch(returnId, { status: 'received' });
      expect((await patch(returnId, { status: 'refunded' })).status).toBe(400); // amount required
      expect((await patch(returnId, { status: 'exchanged' })).status).toBe(400); // a refund request is not an exchange
      expect((await patch(returnId, { status: 'closed' })).status).toBe(200);
      expect((await patch(returnId, { status: 'refunded', refundAmount: 100 })).status).toBe(409);
    });

    it('handles exchanges without touching money', async () => {
      const { returnId, orderId } = await open({ type: 'exchange', reason: 'size_fit' });
      await patch(returnId, { status: 'approved' });
      await patch(returnId, { status: 'received' });
      expect((await patch(returnId, { status: 'refunded', refundAmount: 100 })).status).toBe(400);
      expect((await patch(returnId, { status: 'exchanged', note: 'Replacement dispatched' })).body.data.return.status).toBe('exchanged');
      expect((await Order.findById(orderId).lean())!.refundedAmount ?? 0).toBe(0);
    });

    it('never refunds more than the order total, across several returns', async () => {
      const { orderId, orderNumber } = await (async () => {
        const o = await delivered(2);
        return { orderId: o.id, orderNumber: o.orderNumber };
      })();
      await Order.updateOne({ _id: orderId }, { $set: { paymentStatus: 'paid' } }); // e.g. paid online
      const total = (await Order.findById(orderId).lean())!.total;

      const run = async (amount: number) => {
        const created = await ask(orderNumber);
        const id = await idOf(created.body.data.return.reference);
        await patch(id, { status: 'approved' });
        await patch(id, { status: 'received' });
        const outcome = await patch(id, { status: 'refunded', refundAmount: amount });
        if (outcome.status !== 200) await patch(id, { status: 'closed' }); // a refused refund must not leave the return open
        return outcome;
      };
      expect((await run(1_000_000)).status).toBe(200);
      expect((await Order.findById(orderId).lean())).toMatchObject({ paymentStatus: 'partially_refunded', refundedAmount: 1_000_000 });
      expect((await run(total)).status).toBe(409); // would exceed what was paid
      expect((await run(total - 1_000_000)).status).toBe(200);
      expect((await Order.findById(orderId).lean())).toMatchObject({ paymentStatus: 'refunded', refundedAmount: total });
    });

    it('leaves an unpaid COD order unpaid when a refund is recorded', async () => {
      const { returnId, orderId } = await open();
      await patch(returnId, { status: 'approved' });
      await patch(returnId, { status: 'received' });
      await patch(returnId, { status: 'refunded', refundAmount: 500_000 });
      expect((await Order.findById(orderId).lean())!.paymentStatus).toBe('unpaid');
    });

    it('serialises two staff acting on the same return', async () => {
      const { returnId } = await open();
      const [a, b] = await Promise.all([patch(returnId, { status: 'approved' }), patch(returnId, { status: 'rejected', note: 'Declined' })]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
    });
  });

  describe('visibility and permissions', () => {
    it('lists and filters returns for staff', async () => {
      const { orderNumber } = await delivered();
      const res = await ask(orderNumber);
      const id = await idOf(res.body.data.return.reference);
      expect((await admin.get('/admin/returns?status=requested')).body.data.items).toHaveLength(1);
      expect((await admin.get('/admin/returns?status=approved')).body.data.items).toHaveLength(0);
      expect((await admin.get(`/admin/returns/${id}`)).body.data.return).toMatchObject({ reference: res.body.data.return.reference, customer: { name: 'Ayesha Khan' } });
      expect((await admin.get(`/admin/returns/${'0'.repeat(24)}`)).status).toBe(404);
    });

    it('lets support see returns but only order managers decide them', async () => {
      const { orderNumber } = await delivered();
      const id = await idOf((await ask(orderNumber)).body.data.return.reference);
      const support = await adminClient(app, 'support@example.com', 'support_staff');
      const om = await adminClient(app, 'om@example.com', 'order_manager');
      const pm = await adminClient(app, 'pm@example.com', 'product_manager');
      expect((await support.get('/admin/returns')).status).toBe(200);
      expect((await support.patch(`/admin/returns/${id}`, { status: 'approved' })).status).toBe(403);
      expect((await pm.get('/admin/returns')).status).toBe(403);
      expect((await om.patch(`/admin/returns/${id}`, { status: 'approved' })).status).toBe(200);
    });
  });
});
