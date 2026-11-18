import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { Order } from '../../src/modules/orders/order.model';
import { adminClient, orderBody, placeDeliveredOrder, placeOrder, seedStore, type AdminClient } from '../factories';
import { clearDb, createUser, startTestDb, stopTestDb } from '../helpers';

const app = createApp();
const TOTAL = 2_030_000; // one Rs 20,000 tote plus Rs 300 delivery

describe('admin dashboard', () => {
  let admin: AdminClient;
  let v1: string;

  beforeAll(startTestDb);
  afterAll(stopTestDb);
  beforeEach(async () => {
    await clearDb();
    admin = await adminClient(app);
    v1 = (await seedStore(admin)).v1;
  });

  const idOf = async (orderNumber: string) => String((await Order.findOne({ orderNumber }).lean())!._id);
  const place = async () => (await placeOrder(app, orderBody([{ variantId: v1, quantity: 1 }]))).body.data.order.orderNumber as string;

  // A: COD delivered, cash collected, part of it paid out. B: COD waiting. C: cancelled. D: paid online.
  const populate = async () => {
    const a = await placeDeliveredOrder(app, admin, v1);
    await admin.post(`/admin/orders/${a.id}/cod/collection`, { amount: TOTAL });
    await admin.post(`/admin/orders/${a.id}/cod/remittance`, { amount: 1_000_000, courierCharges: 100_000, reference: 'INV-A' });
    await place();
    const c = await idOf(await place());
    await admin.patch(`/admin/orders/${c}/status`, { status: 'cancelled', reason: 'Changed mind' });
    const d = await idOf(await place());
    await admin.patch(`/admin/orders/${d}/status`, { status: 'confirmed' });
    await Order.updateOne({ _id: d }, { $set: { paymentMethod: 'jazzcash', paymentStatus: 'paid' } });
  };
  const dash = (qs = '') => admin.get(`/admin/dashboard${qs}`);

  it('is all zeros and says so on an empty store', async () => {
    await clearDb();
    admin = await adminClient(app);
    const d = (await dash()).body.data;
    expect(d.orders).toMatchObject({ placed: 0, pending: 0, delivered: 0, cancelled: 0 });
    expect(d.sales).toMatchObject({ grossOrderValue: 0, averageOrderValue: 0, onlinePaid: { value: 0, orders: 0 } });
    expect(d.topProducts).toEqual([]);
    expect(d.recentOrders).toEqual([]);
    expect(d.series).toHaveLength(30);
    expect(d.series.every((s: { orders: number }) => s.orders === 0)).toBe(true);
  });

  it('reports orders by status and keeps cancelled orders out of sales', async () => {
    await populate();
    const d = (await dash()).body.data;
    expect(d.orders).toMatchObject({ placed: 4, pending: 1, delivered: 1, cancelled: 1, byStatus: { delivered: 1, pending_confirmation: 1, cancelled: 1, confirmed: 1 } });
    expect(d.sales).toMatchObject({ ordersCounted: 3, grossOrderValue: 3 * TOTAL, averageOrderValue: TOTAL });
    expect(d.paymentMethods).toEqual({ cod: 2, jazzcash: 1 });
  });

  it('keeps online revenue, COD delivered, collected and remitted as separate numbers', async () => {
    await populate();
    const { sales } = (await dash()).body.data;
    expect(sales.onlinePaid).toEqual({ value: TOTAL, orders: 1 });
    expect(sales.cod).toEqual({ deliveredValue: TOTAL, collected: TOTAL, remittedToUs: 1_000_000, courierCharges: 100_000, awaitingRemittance: 930_000 });
  });

  it('ranks products by units sold with real revenue, and lists real recent orders', async () => {
    await populate();
    const d = (await dash()).body.data;
    expect(d.topProducts).toEqual([{ productId: expect.any(String), name: 'Tote', units: 3, revenue: 3 * 2_000_000 }]);
    expect(d.recentOrders).toHaveLength(4);
    expect(d.recentOrders[0]).toMatchObject({ total: TOTAL, orderNumber: expect.stringMatching(/^MPL-/) });
  });

  it('draws a daily series that adds up to the sales total, in Pakistan time', async () => {
    await populate();
    const d = (await dash()).body.data;
    const pk = new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10);
    expect(d.series[d.series.length - 1]).toEqual({ date: pk, orders: 3, gross: 3 * TOTAL });
    expect(d.series.reduce((n: number, s: { gross: number }) => n + s.gross, 0)).toBe(d.sales.grossOrderValue);
    expect(d.series.map((s: { date: string }) => s.date)).toEqual([...d.series.map((s: { date: string }) => s.date)].sort());
  });

  it('flags what needs attention: low stock, open returns, pending reviews, customers', async () => {
    await populate();
    await createUser({ email: 'a@example.com' });
    await createUser({ email: 'b@example.com' });
    const d = (await dash()).body.data;
    expect(d.lowStock.count).toBe(2);
    expect(d.lowStock.items.map((i: { sku: string }) => i.sku).sort()).toEqual(['TOTE-1', 'TOTE-2']);
    expect(d.customers).toEqual({ total: 2, newInRange: 2 });
    expect(d.attention).toEqual({ openReturns: 0, pendingReviews: 0, shipmentsNeedingReview: 0 });
  });

  it('respects a chosen date range', async () => {
    await populate();
    const old = await dash('?from=2020-01-01&to=2020-01-03');
    expect(old.body.data.orders.placed).toBe(0);
    expect(old.body.data.series.map((s: { date: string }) => s.date)).toEqual(['2020-01-01', '2020-01-02', '2020-01-03']);
    const today = new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10);
    expect((await dash(`?from=${today}&to=${today}`)).body.data.orders.placed).toBe(4);
  });

  it('validates the range', async () => {
    for (const qs of ['?from=yesterday', '?from=2026-02-01&to=2026-01-01', '?from=2024-01-01&to=2026-01-01']) expect((await dash(qs)).status).toBe(400);
  });

  it('is limited to roles with reports:read', async () => {
    const om = await adminClient(app, 'om@example.com', 'order_manager');
    const support = await adminClient(app, 'support@example.com', 'support_staff');
    expect((await om.get('/admin/dashboard')).status).toBe(200);
    expect((await support.get('/admin/dashboard')).status).toBe(403);
    expect((await request(app).get('/api/v1/admin/dashboard')).status).toBe(401);
  });
});
