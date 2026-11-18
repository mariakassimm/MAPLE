import { randomUUID } from 'crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { AuditLog } from '../../src/modules/audit/auditLog.model';
import { Order } from '../../src/modules/orders/order.model';
import type { HttpClient, HttpRequest } from '../../src/modules/payments/types';
import { Shipment } from '../../src/modules/shipping/shipment.model';
import { syncActiveShipments } from '../../src/modules/shipping/shipment.service';
import { LeopardsProvider } from '../../src/modules/shipping/providers/leopards';
import { TcsProvider } from '../../src/modules/shipping/providers/tcs';
import { resetCouriers, setCouriers } from '../../src/modules/shipping/config';
import { adminClient, orderBody, placeOrder, seedStore, type AdminClient } from '../factories';
import { clearDb, createUser, loginAs, startTestDb, stopTestDb } from '../helpers';

const app = createApp();
interface Call { url: string; req: HttpRequest }
type Reply = { status: number; body: unknown } | Error;

let tcsCalls: Call[];
let lcsCalls: Call[];
let tcsTrack: { datetime: string; status: string; code?: string }[];
let lcsTrack: { Status: string; Activity_Date: string }[];
let tcsReply: ((c: Call) => Reply | undefined) | undefined;
let lcsReply: ((c: Call) => Reply | undefined) | undefined;

const tcsDefault = (c: Call): Reply => {
  if (c.url.endsWith('/authentication/token')) return { status: 200, body: { accesstoken: 'tok', expiry: '2099-01-01T00:00:00Z', message: 'success' } };
  if (c.url.endsWith('/booking/create')) return { status: 200, body: { response: 'SUCCESS', consignmentNo: '779412300001', code: '200', status: true, message: 'success' } };
  if (c.url.endsWith('/booking/cancel')) return { status: 200, body: { message: 'SUCCESS' } };
  if (c.url.includes('GetDynamicTrackDetail')) return { status: 200, body: { deliveryinfo: tcsTrack.map((t) => ({ ...t, station: 'KHI' })), checkpoints: [], message: 'SUCCESS' } };
  return { status: 404, body: {} };
};
const lcsDefault = (c: Call): Reply => {
  if (c.url.includes('getAllCities')) return { status: 200, body: { status: 1, city_list: [{ id: 789, name: 'Lahore' }, { id: 790, name: 'Karachi' }] } };
  if (c.url.includes('bookPacket')) return { status: 200, body: { status: 1, error: 0, track_number: 'LE000000001' } };
  if (c.url.includes('trackBookedPacket')) return { status: 200, body: { status: 1, packet_list: [{ 'Tracking Detail': lcsTrack }] } };
  if (c.url.includes('cancelBookedPackets')) return { status: 200, body: { status: 1 } };
  return { status: 404, body: {} };
};
const wrap = (calls: () => Call[], reply: () => ((c: Call) => Reply | undefined) | undefined, dflt: (c: Call) => Reply): HttpClient => async (url, req) => {
  const call = { url, req };
  calls().push(call);
  const r = reply()?.(call) ?? dflt(call);
  if (r instanceof Error) throw r;
  return { status: r.status, body: typeof r.body === 'string' ? r.body : JSON.stringify(r.body) };
};

const tcsConfig = {
  baseUrl: 'https://devconnect.tcscourier.com', username: 'u', password: 'p', accountNumber: '04011K1', costCenterCode: 'MAPLE-01', serviceCode: 'O',
  shipFrom: { name: 'MAPLE Store', phone: '03451234567', city: 'Karachi', address: 'Warehouse 1, Korangi' },
};

describe('shipping, COD reconciliation and customer cancellation', () => {
  let admin: AdminClient;
  let v1: string;

  beforeAll(startTestDb);
  afterAll(async () => {
    resetCouriers();
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearDb();
    tcsCalls = [];
    lcsCalls = [];
    tcsTrack = [];
    lcsTrack = [];
    tcsReply = undefined;
    lcsReply = undefined;
    setCouriers({
      tcs: new TcsProvider(tcsConfig, wrap(() => tcsCalls, () => tcsReply, tcsDefault)),
      leopards: new LeopardsProvider({ baseUrl: 'https://leopards.example/api/', apiKey: 'K', apiPassword: 'P' }, wrap(() => lcsCalls, () => lcsReply, lcsDefault)),
    });
    admin = await adminClient(app);
    v1 = (await seedStore(admin)).v1;
    await admin.post('/admin/service-areas', { city: 'Lahore', province: 'Punjab', codAvailable: true, couriers: { tcs: false, leopards: true } });
  });

  const orderIn = async (city = 'Karachi', province = 'Sindh', extra: object = {}) => {
    const res = await placeOrder(app, orderBody([{ variantId: v1, quantity: 1 }], { shippingAddress: { province, city, area: 'Gulshan', line1: 'House 12, Street 4' }, ...extra }));
    expect(res.status).toBe(201);
    const order = (await Order.findOne({ orderNumber: res.body.data.order.orderNumber }).lean())!;
    return { id: String(order._id), orderNumber: order.orderNumber };
  };
  const confirmed = async (city?: string, province?: string) => {
    const o = await orderIn(city, province);
    expect((await admin.patch(`/admin/orders/${o.id}/status`, { status: 'confirmed' })).status).toBe(200);
    return o;
  };
  const book = (id: string, body: object = {}) => admin.post(`/admin/orders/${id}/shipments`, body);
  const orderDoc = (id: string) => Order.findById(id).lean();
  const bookings = () => tcsCalls.filter((c) => c.url.endsWith('/booking/create')).length;
  const trackOrder = (orderNumber: string) => request(app).post('/api/v1/orders/track').send({ orderNumber, phone: '03001234567' });

  describe('booking', () => {
    it('defaults to TCS where it serves the city and sends COD in rupees', async () => {
      const { id } = await confirmed();
      const res = await book(id, { weightKg: 1.2 });
      expect(res.status).toBe(201);
      expect(res.body.data.shipment).toMatchObject({ courier: 'tcs', mode: 'api', trackingNumber: '779412300001', status: 'booked', active: true, codAmount: 2_030_000 });
      const sent = JSON.parse(tcsCalls.find((c) => c.url.endsWith('/booking/create'))!.req.body!);
      expect(sent.shipmentinfo).toMatchObject({ codamount: 20_300, weightinkg: 1.2, referenceno: expect.stringMatching(/^MPL-/) });
      expect(sent.consigneeinfo).toMatchObject({ cityname: 'Karachi', mobile: '03001234567' });
      expect((await orderDoc(id))!.shipmentStatus).toBe('booked');
      expect(await AuditLog.countDocuments({ action: 'shipment.book' })).toBe(1);
    });

    it('falls to Leopards where TCS does not serve the city', async () => {
      const { id } = await confirmed('Lahore', 'Punjab');
      const res = await book(id);
      expect(res.body.data.shipment).toMatchObject({ courier: 'leopards', trackingNumber: 'LE000000001' });
      expect(bookings()).toBe(0);
    });

    it('lets staff choose the backup courier explicitly', async () => {
      const { id } = await confirmed();
      expect((await book(id, { courier: 'leopards' })).body.data.shipment.courier).toBe('leopards');
    });

    it('only books confirmed orders', async () => {
      const { id } = await orderIn();
      expect((await book(id)).status).toBe(409);
      expect(bookings()).toBe(0);
    });

    it('never books an order twice, even when two staff click at once', async () => {
      const { id } = await confirmed();
      const [a, b] = await Promise.all([book(id), book(id)]);
      expect([a.status, b.status].sort()).toEqual([201, 409]);
      expect(bookings()).toBe(1);
      expect((await book(id, { courier: 'leopards' })).status).toBe(409);
      expect(lcsCalls.filter((c) => c.url.includes('bookPacket'))).toHaveLength(0);
      expect(await Shipment.countDocuments({ orderId: id, active: true })).toBe(1);
    });

    it('keeps a refused booking visible, frees the slot, and allows the backup courier', async () => {
      const { id } = await confirmed();
      tcsReply = (c) => (c.url.endsWith('/booking/create') ? { status: 200, body: { status: false, message: 'Invalid city', error: [{ errorname: 'City not found' }] } } : undefined);
      const refused = await book(id);
      expect(refused.status).toBe(422);
      expect(refused.body.error.code).toBe('COURIER_REJECTED');
      const failed = await Shipment.findOne({ orderId: id }).lean();
      expect(failed).toMatchObject({ active: false, status: 'cancelled' });
      expect(failed!.bookingError).toMatch(/Invalid city/);

      const backup = await book(id, { courier: 'leopards' });
      expect(backup.status).toBe(201);
      expect(await Shipment.countDocuments({ orderId: id, active: true })).toBe(1);
      const list = await admin.get(`/admin/orders/${id}/shipments`);
      expect(list.body.data.shipments).toHaveLength(2);
    });

    it('holds the slot when the outcome is unclear, until a person resolves it', async () => {
      const { id } = await confirmed();
      tcsReply = (c) => (c.url.endsWith('/booking/create') ? new Error('socket hang up') : undefined);
      const unclear = await book(id);
      expect(unclear.status).toBe(502);
      expect(unclear.body.error.code).toBe('COURIER_UNCERTAIN');
      const held = (await Shipment.findOne({ orderId: id }).lean())!;
      expect(held).toMatchObject({ active: true, needsReview: true, status: 'booking_pending' });

      tcsReply = undefined;
      expect((await book(id)).status).toBe(409);
      expect(bookings()).toBe(1);

      const flagged = await admin.get('/admin/shipments?needsReview=true');
      expect(flagged.body.data.items).toHaveLength(1);
      const attached = await admin.patch(`/admin/shipments/${held._id}`, { trackingNumber: '779412399999' });
      expect(attached.body.data.shipment).toMatchObject({ trackingNumber: '779412399999', status: 'booked', needsReview: false, bookingError: null });
      expect((await admin.patch(`/admin/shipments/${held._id}`, { trackingNumber: '779412399998' })).status).toBe(409);
    });

    it('reports an unconfigured courier and supports manual booking', async () => {
      setCouriers({});
      const { id } = await confirmed();
      const none = await book(id, { courier: 'tcs' });
      expect(none.status).toBe(400);
      expect(none.body.error.code).toBe('COURIER_UNAVAILABLE');
      expect((await book(id, { courier: 'manual' })).status).toBe(400);
      const manual = await book(id, { courier: 'manual', trackingNumber: 'TCS-778899' });
      expect(manual.status).toBe(201);
      expect(manual.body.data.shipment).toMatchObject({ courier: 'manual', mode: 'manual', trackingNumber: 'TCS-778899', status: 'booked' });
      expect(await AuditLog.countDocuments({ action: 'shipment.book' })).toBe(1);
    });

    it('applies the courier COD limit instead of sending a doomed request', async () => {
      const { id } = await confirmed();
      await Order.updateOne({ _id: id }, { $set: { 'cod.amountDue': 30_000_000 } });
      const res = await book(id);
      expect(res.status).toBe(422);
      expect(res.body.error.message).toMatch(/250,000/);
      expect(bookings()).toBe(0);
    });
  });

  describe('tracking', () => {
    it('follows the courier: shipped, then delivered, without marking COD paid', async () => {
      const { id, orderNumber } = await confirmed();
      const shipmentId = (await book(id)).body.data.shipment.id as string;

      tcsTrack = [{ datetime: 'Saturday Nov 07, 2026 18:20', status: 'Arrived at TCS Facility' }];
      const first = await admin.post(`/admin/shipments/${shipmentId}/sync`);
      expect(first.body.data).toMatchObject({ newEvents: 1, shipment: { status: 'in_transit' } });
      expect(await orderDoc(id)).toMatchObject({ status: 'shipped', shipmentStatus: 'in_transit' });
      const history = (await admin.get(`/admin/orders/${id}`)).body.data.order.statusHistory.map((h: { status: string }) => h.status);
      expect(history).toEqual(['pending_confirmation', 'confirmed', 'processing', 'packed', 'ready_for_dispatch', 'shipped']);

      tcsTrack.push({ datetime: 'Sunday Nov 08, 2026 12:58', status: 'Delivered', code: 'OK' });
      const second = await admin.post(`/admin/shipments/${shipmentId}/sync`);
      expect(second.body.data).toMatchObject({ newEvents: 1, shipment: { status: 'delivered' } });
      expect(await orderDoc(id)).toMatchObject({ status: 'delivered', shipmentStatus: 'delivered', paymentStatus: 'unpaid' });

      const again = await admin.post(`/admin/shipments/${shipmentId}/sync`);
      expect(again.body.data.newEvents).toBe(0);
      expect(orderNumber).toBeTruthy();
    });

    it('shows the shopper only courier, number, status and history', async () => {
      const { id, orderNumber } = await confirmed();
      expect((await trackOrder(orderNumber)).body.data.order.shipment).toBeNull();
      const shipmentId = (await book(id)).body.data.shipment.id as string;
      tcsTrack = [{ datetime: 'Saturday Nov 07, 2026 18:20', status: 'Arrived at TCS Facility' }];
      await admin.post(`/admin/shipments/${shipmentId}/sync`);
      const { shipment } = (await trackOrder(orderNumber)).body.data.order;
      expect(shipment).toMatchObject({ courier: 'tcs', trackingNumber: '779412300001', status: 'in_transit' });
      expect(shipment.events[0]).toMatchObject({ description: 'Arrived at TCS Facility', location: 'KHI' });
      expect(JSON.stringify(shipment)).not.toMatch(/active|needsReview|bookingError|codAmount|orderId|createdBy/);
    });

    it('records unrecognised wording as history without changing any status', async () => {
      const { id } = await confirmed();
      const shipmentId = (await book(id)).body.data.shipment.id as string;
      tcsTrack = [{ datetime: 'Saturday Nov 07, 2026 18:20', status: 'Weather delay' }];
      const res = await admin.post(`/admin/shipments/${shipmentId}/sync`);
      expect(res.body.data).toMatchObject({ newEvents: 1, shipment: { status: 'booked' } });
      expect((await orderDoc(id))!.status).toBe('confirmed');
    });

    it('handles failed delivery and return to origin', async () => {
      const { id } = await confirmed();
      const shipmentId = (await book(id)).body.data.shipment.id as string;
      tcsTrack = [
        { datetime: 'Saturday Nov 07, 2026 10:00', status: 'Arrived at TCS Facility' },
        { datetime: 'Sunday Nov 08, 2026 11:00', status: 'Consignee not available' },
        { datetime: 'Tuesday Nov 10, 2026 09:00', status: 'Returned to Shipper', code: 'RO' },
      ];
      await admin.post(`/admin/shipments/${shipmentId}/sync`);
      expect(await orderDoc(id)).toMatchObject({ status: 'returned_to_origin', shipmentStatus: 'returned_to_origin' });
    });

    it('leaves an outage as an error and changes nothing', async () => {
      const { id } = await confirmed();
      const shipmentId = (await book(id)).body.data.shipment.id as string;
      tcsReply = (c) => (c.url.includes('GetDynamicTrackDetail') ? { status: 503, body: '' } : undefined);
      expect((await admin.post(`/admin/shipments/${shipmentId}/sync`)).status).toBe(502);
      expect((await Shipment.findById(shipmentId).lean())!.status).toBe('booked');
    });

    it('refreshes every live shipment in the background and skips finished ones', async () => {
      const a = await confirmed();
      const b = await confirmed('Lahore', 'Punjab');
      const sa = (await book(a.id)).body.data.shipment.id as string;
      await book(b.id);
      tcsTrack = [{ datetime: 'Sunday Nov 08, 2026 12:58', status: 'Delivered', code: 'OK' }];
      lcsTrack = [{ Status: 'Dispatched', Activity_Date: '2026-11-08 09:00:00' }];
      expect(await syncActiveShipments()).toBe(2);
      expect((await Shipment.findById(sa).lean())!.status).toBe('delivered');
      expect(await orderDoc(b.id)).toMatchObject({ status: 'shipped' });
      expect(await syncActiveShipments()).toBe(1);
    });

    it('never confirms or ships an order that is not ready, whatever the courier says', async () => {
      const { id } = await orderIn(); // still pending_confirmation, manual shipment forced into the database
      const s = await Shipment.create({ orderId: id, orderNumber: 'MPL-TESTTEST', courier: 'manual', mode: 'manual', trackingNumber: 'X1234', status: 'booked' });
      expect((await admin.post(`/admin/shipments/${s._id}/status`, { status: 'delivered' })).status).toBe(200);
      expect((await orderDoc(id))!.status).toBe('pending_confirmation');
    });
  });

  describe('manual fallback', () => {
    it('lets staff move a manual shipment forward but not backward', async () => {
      const { id } = await confirmed();
      const shipmentId = (await book(id, { courier: 'manual', trackingNumber: 'TCS-778899' })).body.data.shipment.id as string;
      const move = (status: string) => admin.post(`/admin/shipments/${shipmentId}/status`, { status, note: 'phoned the courier' });
      expect((await move('in_transit')).status).toBe(200);
      expect(await orderDoc(id)).toMatchObject({ status: 'shipped' });
      expect((await move('out_for_delivery')).status).toBe(200);
      expect((await move('in_transit')).status).toBe(409);
      expect((await move('delivered')).status).toBe(200);
      expect(await orderDoc(id)).toMatchObject({ status: 'delivered', shipmentStatus: 'delivered' });
      expect((await move('in_transit')).status).toBe(409);
      expect((await admin.post(`/admin/shipments/${shipmentId}/status`, { status: 'booked' })).status).toBe(400);
    });
  });

  describe('cancelling a shipment', () => {
    it('cancels before pickup with the courier, frees the order, and refuses afterwards', async () => {
      const { id } = await confirmed();
      const shipmentId = (await book(id)).body.data.shipment.id as string;
      const res = await admin.post(`/admin/shipments/${shipmentId}/cancel`);
      expect(res.body.data.shipment).toMatchObject({ status: 'cancelled', active: false });
      expect(tcsCalls.some((c) => c.url.endsWith('/booking/cancel'))).toBe(true);
      expect((await orderDoc(id))!.shipmentStatus).toBe('not_booked');
      expect((await book(id, { courier: 'leopards' })).status).toBe(201);

      const other = await confirmed('Lahore', 'Punjab');
      const picked = (await book(other.id, { courier: 'manual', trackingNumber: 'MAN-1234' })).body.data.shipment.id as string;
      await admin.post(`/admin/shipments/${picked}/status`, { status: 'picked_up' });
      expect((await admin.post(`/admin/shipments/${picked}/cancel`)).status).toBe(409);
    });

    it('keeps the shipment when the courier refuses to cancel', async () => {
      const { id } = await confirmed();
      const shipmentId = (await book(id)).body.data.shipment.id as string;
      tcsReply = (c) => (c.url.endsWith('/booking/cancel') ? { status: 200, body: { message: 'Failure: already picked up' } } : undefined);
      expect((await admin.post(`/admin/shipments/${shipmentId}/cancel`)).status).toBe(409);
      expect((await Shipment.findById(shipmentId).lean())).toMatchObject({ active: true, status: 'booked' });
    });
  });

  describe('permissions', () => {
    it('lets order managers ship, and nobody without shipments:write', async () => {
      const { id } = await confirmed();
      const support = await adminClient(app, 'support@example.com', 'support_staff');
      const pm = await adminClient(app, 'pm@example.com', 'product_manager');
      const om = await adminClient(app, 'om@example.com', 'order_manager');
      expect((await support.post(`/admin/orders/${id}/shipments`, {})).status).toBe(403);
      expect((await support.get(`/admin/orders/${id}/shipments`)).status).toBe(200);
      expect((await pm.get(`/admin/orders/${id}/shipments`)).status).toBe(403);
      expect((await request(app).post(`/api/v1/admin/orders/${id}/shipments`).send({})).status).toBe(401);
      expect((await om.post(`/admin/orders/${id}/shipments`, {})).status).toBe(201);
      expect((await om.get('/admin/couriers')).body.data.configured).toEqual({ tcs: true, leopards: true });
    });
  });

  describe('cash on delivery reconciliation', () => {
    const delivered = async () => {
      const o = await confirmed();
      const sid = (await book(o.id, { courier: 'manual', trackingNumber: 'MAN-0001' })).body.data.shipment.id as string;
      await admin.post(`/admin/shipments/${sid}/status`, { status: 'delivered' });
      return o;
    };

    it('records collection once, only after delivery and only for the exact amount', async () => {
      const early = await confirmed();
      expect((await admin.post(`/admin/orders/${early.id}/cod/collection`, { amount: 2_030_000 })).status).toBe(409);

      const { id } = await delivered();
      expect((await admin.post(`/admin/orders/${id}/cod/collection`, { amount: 1_000_000 })).status).toBe(400);
      const ok = await admin.post(`/admin/orders/${id}/cod/collection`, { amount: 2_030_000 });
      expect(ok.status).toBe(200);
      expect(ok.body.data.order.cod).toMatchObject({ collectedAmount: 2_030_000, remittedAmount: 0 });
      expect(ok.body.data.order.paymentStatus).toBe('unpaid');
      expect((await admin.post(`/admin/orders/${id}/cod/collection`, { amount: 2_030_000 })).status).toBe(409);
    });

    it('marks the order paid only when the courier payout accounts for all the cash', async () => {
      const { id } = await delivered();
      await admin.post(`/admin/orders/${id}/cod/collection`, { amount: 2_030_000 });
      const remit = (body: object) => admin.post(`/admin/orders/${id}/cod/remittance`, body);

      expect((await remit({ amount: 1_000_000, courierCharges: 100_000, reference: 'INV-1001' })).body.data.order.paymentStatus).toBe('unpaid');
      expect((await remit({ amount: 1_000_000, courierCharges: 100_000, reference: 'INV-1001' })).status).toBe(409); // same settlement again
      expect((await remit({ amount: 1_000_000, reference: 'INV-1002' })).status).toBe(409); // would exceed the cash collected
      const last = await remit({ amount: 930_000, courierCharges: 0, reference: 'INV-1003' });
      expect(last.body.data.order).toMatchObject({ paymentStatus: 'paid', cod: { collectedAmount: 2_030_000, remittedAmount: 1_930_000, courierCharges: 100_000 } });
      expect((await remit({ amount: 1, reference: 'INV-1004' })).status).toBe(409);
      expect((await remit({ amount: 0, courierCharges: 0, reference: 'INV-1005' })).status).toBe(400);
    });

    it('cannot remit before collection, and not for prepaid or non-COD orders', async () => {
      const { id } = await delivered();
      expect((await admin.post(`/admin/orders/${id}/cod/remittance`, { amount: 100, reference: 'INV-9' })).status).toBe(409);
      await Order.updateOne({ _id: id }, { $unset: { cod: 1 } });
      expect((await admin.post(`/admin/orders/${id}/cod/collection`, { amount: 2_030_000 })).status).toBe(409);
    });

    it('splits permissions: order managers record collection, only finance-level roles reconcile payouts', async () => {
      const { id } = await delivered();
      const om = await adminClient(app, 'om@example.com', 'order_manager');
      const support = await adminClient(app, 'support@example.com', 'support_staff');
      expect((await support.post(`/admin/orders/${id}/cod/collection`, { amount: 2_030_000 })).status).toBe(403);
      expect((await om.post(`/admin/orders/${id}/cod/collection`, { amount: 2_030_000 })).status).toBe(200);
      expect((await om.post(`/admin/orders/${id}/cod/remittance`, { amount: 2_030_000, reference: 'INV-1' })).status).toBe(403);
      expect((await om.get('/admin/cod/summary')).status).toBe(200);
      expect((await support.get('/admin/cod/summary')).status).toBe(403);
    });

    it('keeps delivered, collected and remitted money in separate numbers', async () => {
      const a = await delivered();
      const b = await delivered();
      const c = await delivered();
      await admin.post(`/admin/orders/${b.id}/cod/collection`, { amount: 2_030_000 });
      await admin.post(`/admin/orders/${c.id}/cod/collection`, { amount: 2_030_000 });
      await admin.post(`/admin/orders/${c.id}/cod/remittance`, { amount: 1_900_000, courierCharges: 130_000, reference: 'INV-C' });
      await admin.post(`/admin/orders/${b.id}/cod/remittance`, { amount: 500_000, reference: 'INV-B' });

      const summary = (await admin.get('/admin/cod/summary')).body.data;
      expect(summary.awaitingCollection).toEqual({ count: 1, amount: 2_030_000 });
      expect(summary.awaitingRemittance).toMatchObject({ count: 1, amount: 1_530_000 });
      expect(summary.awaitingRemittance.orders[0]).toMatchObject({ orderNumber: b.orderNumber, collected: 2_030_000, outstanding: 1_530_000 });
      expect(summary.settled).toEqual({ count: 1, collected: 2_030_000, received: 1_900_000, courierCharges: 130_000 });
      expect(a.id).toBeTruthy();
    });
  });

  describe('customer cancellation', () => {
    it('lets a guest cancel an unconfirmed order with order number and phone, returning the stock', async () => {
      const { orderNumber } = await orderIn();
      const wrongPhone = await request(app).post('/api/v1/orders/cancel').send({ orderNumber, phone: '03451234567' });
      expect(wrongPhone.status).toBe(404);
      const res = await request(app).post('/api/v1/orders/cancel').send({ orderNumber, phone: '0300 1234567', reason: 'Ordered by mistake' });
      expect(res.status).toBe(200);
      expect(res.body.data.order).toMatchObject({ status: 'cancelled', paymentStatus: 'cancelled', cancellation: { reason: 'Ordered by mistake' } });
      expect((await Order.findOne({ orderNumber }).lean())).toMatchObject({ inventoryState: 'released', cancellation: { by: 'customer' } });
      expect((await request(app).post('/api/v1/orders/cancel').send({ orderNumber, phone: '03001234567' })).status).toBe(409);
    });

    it('refuses once staff have confirmed the order', async () => {
      const { orderNumber } = await confirmed();
      const res = await request(app).post('/api/v1/orders/cancel').send({ orderNumber, phone: '03001234567' });
      expect(res.status).toBe(409);
      expect((await Order.findOne({ orderNumber }).lean())!.status).toBe('confirmed');
    });

    it('lets a signed-in customer cancel their own order only, with CSRF', async () => {
      await createUser({ email: 'ayesha@example.com' });
      await createUser({ email: 'other@example.com' });
      const ayesha = await loginAs(app, 'ayesha@example.com');
      const other = await loginAs(app, 'other@example.com');
      const placed = await ayesha.agent.post('/api/v1/orders').set('Idempotency-Key', randomUUID()).set('X-CSRF-Token', ayesha.csrf).send(orderBody([{ variantId: v1, quantity: 1 }]));
      const { orderNumber } = placed.body.data.order;

      expect((await ayesha.agent.post(`/api/v1/account/orders/${orderNumber}/cancel`).send({})).status).toBe(403);
      expect((await other.agent.post(`/api/v1/account/orders/${orderNumber}/cancel`).set('X-CSRF-Token', other.csrf).send({})).status).toBe(404);
      const ok = await ayesha.agent.post(`/api/v1/account/orders/${orderNumber}/cancel`).set('X-CSRF-Token', ayesha.csrf).send({ reason: 'Found it cheaper' });
      expect(ok.status).toBe(200);
      expect(ok.body.data.order.status).toBe('cancelled');
    });
  });
});
