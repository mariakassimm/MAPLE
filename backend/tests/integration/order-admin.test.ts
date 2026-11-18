import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { AuditLog } from '../../src/modules/audit/auditLog.model';
import { Coupon } from '../../src/modules/coupons/coupon.model';
import { InventoryMovement } from '../../src/modules/inventory/inventoryMovement.model';
import { Order } from '../../src/modules/orders/order.model';
import { Product } from '../../src/modules/products/product.model';
import { adminClient, orderBody, placeOrder, seedStore, type AdminClient } from '../factories';
import { clearDb, startTestDb, stopTestDb } from '../helpers';

const app = createApp();

describe('admin order management', () => {
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

  const stock = async () => {
    const p = await Product.findById(productId).lean();
    const v = p!.variants.find((x) => String(x._id) === v1)!;
    return { stock: v.stock, reserved: v.reserved };
  };
  const place = async (quantity = 2, extra: object = {}) => {
    const res = await placeOrder(app, orderBody([{ variantId: v1, quantity }], extra));
    expect(res.status).toBe(201);
    const order = await Order.findOne({ orderNumber: res.body.data.order.orderNumber }).lean();
    return { id: String(order!._id), orderNumber: order!.orderNumber };
  };
  const move = (id: string, status: string, reason?: string) => admin.patch(`/admin/orders/${id}/status`, { status, reason });

  it('confirming commits the reservation exactly once and records who did it', async () => {
    const { id } = await place(2);
    expect(await stock()).toEqual({ stock: 3, reserved: 2 });

    const res = await move(id, 'confirmed');
    expect(res.status).toBe(200);
    expect(res.body.data.order).toMatchObject({ status: 'confirmed', inventoryState: 'committed' });
    expect(res.body.data.order.statusHistory.map((h: { status: string }) => h.status)).toEqual(['pending_confirmation', 'confirmed']);
    expect(res.body.data.order.statusHistory[1].actorId).toBeTruthy();
    expect(await stock()).toEqual({ stock: 3, reserved: 0 });
    expect(await InventoryMovement.countDocuments({ type: 'commit' })).toBe(1);
    expect(await AuditLog.countDocuments({ action: 'order.status_change' })).toBe(1);
  });

  it('two simultaneous confirmations commit stock only once', async () => {
    const a = await place(2);
    await place(2); // a second order whose reservation must stay untouched
    expect(await stock()).toEqual({ stock: 1, reserved: 4 });

    const [x, y] = await Promise.all([move(a.id, 'confirmed'), move(a.id, 'confirmed')]);
    expect([x.status, y.status].sort()).toEqual([200, 409]);
    expect(await stock()).toEqual({ stock: 1, reserved: 2 });
    expect(await InventoryMovement.countDocuments({ type: 'commit' })).toBe(1);
  });

  it('rejects invalid transitions and terminal states', async () => {
    const { id } = await place(1);
    const skip = await move(id, 'shipped');
    expect(skip.status).toBe(409);
    expect(skip.body.error.code).toBe('INVALID_TRANSITION');
    expect((await move(id, 'cancelled', 'Customer asked')).status).toBe(200);
    expect((await move(id, 'confirmed')).status).toBe(409);
    expect((await move(id, 'cancelled', 'Again please')).status).toBe(409);
  });

  it('requires a reason to cancel', async () => {
    const { id } = await place(1);
    expect((await move(id, 'cancelled')).status).toBe(400);
    expect((await move(id, 'cancelled', 'x')).status).toBe(400);
  });

  it('cancelling before confirmation releases the reservation and the coupon use', async () => {
    await admin.post('/admin/coupons', { code: 'SAVE', type: 'fixed', value: 50_000, usageLimit: 5 });
    const { id } = await place(2, { couponCode: 'SAVE' });
    expect((await Coupon.findOne({ code: 'SAVE' }))!.usedCount).toBe(1);

    const res = await move(id, 'cancelled', 'Customer changed their mind');
    expect(res.body.data.order).toMatchObject({ status: 'cancelled', inventoryState: 'released', paymentStatus: 'cancelled', cancellation: { reason: 'Customer changed their mind' } });
    expect(await stock()).toEqual({ stock: 5, reserved: 0 });
    expect((await Coupon.findOne({ code: 'SAVE' }))!.usedCount).toBe(0);
  });

  it('cancelling after confirmation puts the units back on sale', async () => {
    const { id } = await place(2);
    await move(id, 'confirmed');
    await move(id, 'processing');
    expect(await stock()).toEqual({ stock: 3, reserved: 0 });
    expect((await move(id, 'cancelled', 'Out of packaging')).status).toBe(200);
    expect(await stock()).toEqual({ stock: 5, reserved: 0 });
    expect(await InventoryMovement.countDocuments({ type: 'restock' })).toBe(1);
  });

  it('cannot cancel once shipped', async () => {
    const { id } = await place(1);
    for (const s of ['confirmed', 'processing', 'packed', 'ready_for_dispatch', 'shipped']) expect((await move(id, s)).status).toBe(200);
    expect((await move(id, 'cancelled', 'Too late')).status).toBe(409);
  });

  it('delivery does NOT mark a COD order paid', async () => {
    const { id } = await place(1);
    for (const s of ['confirmed', 'processing', 'packed', 'ready_for_dispatch', 'shipped', 'out_for_delivery', 'delivered']) {
      expect((await move(id, s)).status).toBe(200);
    }
    const order = (await admin.get(`/admin/orders/${id}`)).body.data.order;
    expect(order.status).toBe('delivered');
    expect(order.paymentStatus).toBe('unpaid');
    expect(order.cod).toMatchObject({ amountDue: 2_030_000, collectedAmount: 0, remittedAmount: 0 });
  });

  it('lists and filters orders', async () => {
    const one = await place(1);
    await place(1, { customer: { name: 'Sara Ali', phone: '03211234567', email: 'sara@example.com' } });
    await move(one.id, 'confirmed');

    const all = await admin.get('/admin/orders');
    expect(all.body.data.pagination.total).toBe(2);
    expect((await admin.get('/admin/orders?status=confirmed')).body.data.items).toHaveLength(1);
    expect((await admin.get('/admin/orders?paymentMethod=jazzcash')).body.data.items).toHaveLength(0);
    expect((await admin.get('/admin/orders?q=' + encodeURIComponent('0321 1234567'))).body.data.items).toHaveLength(1); // phone formats are normalised
    expect((await admin.get('/admin/orders?q=03211234567')).body.data.items.map((o: { customerName: string }) => o.customerName)).toEqual(['Sara Ali']);
    expect((await admin.get(`/admin/orders?q=${one.orderNumber.slice(0, 6)}`)).body.data.items.map((o: { orderNumber: string }) => o.orderNumber)).toContain(one.orderNumber);
    expect((await admin.get('/admin/orders?status=bogus')).status).toBe(400);
    expect((await admin.get('/admin/orders?limit=1&page=2')).body.data.items).toHaveLength(1);
  });

  it('enforces order permissions', async () => {
    const { id } = await place(1);
    const om = await adminClient(app, 'om@example.com', 'order_manager');
    const support = await adminClient(app, 'support@example.com', 'support_staff');
    const pm = await adminClient(app, 'pm@example.com', 'product_manager');

    expect((await om.get('/admin/orders')).status).toBe(200);
    expect((await om.patch(`/admin/orders/${id}/status`, { status: 'confirmed' })).status).toBe(200);
    expect((await support.get(`/admin/orders/${id}`)).status).toBe(200);
    expect((await support.patch(`/admin/orders/${id}/status`, { status: 'processing' })).status).toBe(403);
    expect((await pm.get('/admin/orders')).status).toBe(403);
    expect((await om.get(`/admin/orders/${'0'.repeat(24)}`)).status).toBe(404);
  });
});
