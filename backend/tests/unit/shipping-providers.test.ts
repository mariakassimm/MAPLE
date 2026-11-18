import { describe, expect, it } from 'vitest';
import type { HttpClient, HttpRequest } from '../../src/modules/payments/types';
import { LeopardsProvider, parseLeopardsDate } from '../../src/modules/shipping/providers/leopards';
import { TcsProvider, buildTcsBooking, parseTcsDate, type TcsConfig } from '../../src/modules/shipping/providers/tcs';
import { isForward, latestStatus, normalizeCourierStatus } from '../../src/modules/shipping/statusMap';
import { CourierRejected, CourierUncertain, type BookingInput } from '../../src/modules/shipping/types';

const NOW = new Date('2026-11-07T10:00:00Z');
const input: BookingInput = {
  orderNumber: 'MPL-AB12CD34', recipientName: 'Ayesha Bibi Khan', phone: '+923001234567', email: 'a@example.com', province: 'Sindh', city: 'Karachi',
  area: 'Gulshan-e-Iqbal', address: 'House 12, Street 4', codAmount: 2_030_000, weightKg: 0.3, pieces: 1,
  items: [{ name: 'Maple Leather Tote', quantity: 1, unitPrice: 2_000_000 }],
};
const tcsCfg: TcsConfig = {
  baseUrl: 'https://devconnect.tcscourier.com', username: 'user', password: 'secret-pw', accountNumber: '04011K1', costCenterCode: 'MAPLE-01', serviceCode: 'O',
  shipFrom: { name: 'MAPLE Store', phone: '03451234567', city: 'Karachi', address: 'Warehouse 1, Korangi' },
};

interface Call { url: string; req: HttpRequest }
const script = (handler: (c: Call) => { status: number; body: unknown } | Error) => {
  const calls: Call[] = [];
  const http: HttpClient = async (url, req) => {
    const call = { url, req };
    calls.push(call);
    const r = handler(call);
    if (r instanceof Error) throw r;
    return { status: r.status, body: typeof r.body === 'string' ? r.body : JSON.stringify(r.body) };
  };
  return { calls, http };
};
const AUTH_OK = { status: 200, body: { accesstoken: 'tok-1', expiry: '2099-01-01T00:00:00Z', message: 'success' } };

describe('courier status wording', () => {
  it.each([
    ['Shipment Delivered', 'delivered'],
    ['Delivered', 'delivered'],
    ['Out For Delivery', 'out_for_delivery'],
    ['Arrived at TCS Facility', 'in_transit'],
    ['Departed from origin hub', 'in_transit'],
    ['Awaiting Receiver Collection', 'delivery_failed'],
    ['Consignee not available', 'delivery_failed'],
    ['Returned to Shipper', 'returned_to_origin'],
    ['Return to Origin', 'returned_to_origin'],
    ['Shipment picked up', 'picked_up'],
    ['Booked', 'booked'],
  ])('"%s" -> %s', (text, expected) => expect(normalizeCourierStatus(text)).toBe(expected));
  it('leaves unrecognised wording unmapped rather than guessing', () => {
    expect(normalizeCourierStatus('Weather delay')).toBeNull();
    expect(normalizeCourierStatus('')).toBeNull();
    expect(normalizeCourierStatus(undefined)).toBeNull();
  });
  it('only moves forward and never out of a finished state', () => {
    expect(isForward('booked', 'in_transit')).toBe(true);
    expect(isForward('in_transit', 'booked')).toBe(false);
    expect(isForward('out_for_delivery', 'delivery_failed')).toBe(true);
    expect(isForward('delivery_failed', 'out_for_delivery')).toBe(true);
    expect(isForward('delivered', 'in_transit')).toBe(false);
    expect(isForward('returned_to_origin', 'delivered')).toBe(false);
    expect(isForward('booked', 'booked')).toBe(false);
  });
  it('picks the newest recognised status by time, not by list order', () => {
    const at = (h: number) => new Date(Date.UTC(2026, 0, 1, h));
    expect(latestStatus([{ at: at(5), status: 'delivered' }, { at: at(1), status: 'in_transit' }, { at: at(9), status: null }])).toBe('delivered');
    expect(latestStatus([{ at: at(1), status: null }])).toBeNull();
  });
});

describe('date parsing', () => {
  it('reads TCS and Leopards local times as Pakistan time', () => {
    expect(parseTcsDate('Thursday Oct 17, 2024 12:58')?.toISOString()).toBe('2024-10-17T07:58:00.000Z');
    expect(parseTcsDate('Monday Oct 14, 2024 23:19')?.toISOString()).toBe('2024-10-14T18:19:00.000Z');
    expect(parseTcsDate('garbage')).toBeNull();
    expect(parseLeopardsDate('2024-10-17 12:58:00')?.toISOString()).toBe('2024-10-17T07:58:00.000Z');
    expect(parseLeopardsDate('2024-10-17')?.toISOString()).toBe('2024-10-16T19:00:00.000Z');
    expect(parseLeopardsDate(undefined)).toBeNull();
  });
});

describe('TCS booking payload', () => {
  const body = buildTcsBooking(tcsCfg, input, 'tok', NOW) as Record<string, any>;
  it('follows the documented structure and units', () => {
    expect(body.accesstoken).toBe('tok');
    expect(body.shipperinfo).toMatchObject({ tcsaccount: '04011K1', countrycode: 'PK', cityname: 'Karachi', mobile: '03451234567' });
    expect(body.consigneeinfo).toMatchObject({ firstname: 'Ayesha', lastname: 'Bibi Khan', countrycode: 'PK', cityname: 'Karachi', mobile: '03001234567', areaname: 'Gulshan-e-Iqbal' });
    expect(body.shipmentinfo).toMatchObject({ costcentercode: 'MAPLE-01', referenceno: 'MPL-AB12CD34', servicecode: 'O', currency: 'PKR', shipmentdate: '07/11/2026 15:00:00', pieces: 1, fragile: false });
  });
  it('sends COD in whole rupees, weight of at least 0.5 kg, and item prices of at least Rs 1', () => {
    expect(body.shipmentinfo.codamount).toBe(20_300);
    expect(body.shipmentinfo.weightinkg).toBe(0.5);
    expect(body.shipmentinfo.skus[0]).toMatchObject({ quantity: 1, unitprice: 20_000, weight: 0.5 });
    const prepaid = buildTcsBooking(tcsCfg, { ...input, codAmount: 0, items: [{ name: 'x', quantity: 1, unitPrice: 10 }] }, 't', NOW) as Record<string, any>;
    expect(prepaid.shipmentinfo.codamount).toBe(0);
    expect(prepaid.shipmentinfo.skus[0].unitprice).toBe(1);
  });
  it('refuses COD above the TCS limit instead of sending a booking that would fail', () => {
    expect(() => buildTcsBooking(tcsCfg, { ...input, codAmount: 25_000_100 }, 't', NOW)).toThrow(CourierRejected);
    expect(() => buildTcsBooking(tcsCfg, { ...input, codAmount: 25_000_000 }, 't', NOW)).not.toThrow();
  });
});

describe('TcsProvider', () => {
  const ok = { response: 'SUCCESS', consignmentNo: '99210301520', code: '200', status: true, message: 'success' };

  it('authenticates once, reuses the token, and books', async () => {
    const { http, calls } = script((c) => (c.url.endsWith('/authentication/token') ? AUTH_OK : { status: 200, body: ok }));
    const tcs = new TcsProvider(tcsCfg, http, () => NOW);
    expect(await tcs.book(input)).toEqual({ trackingNumber: '99210301520' });
    await tcs.book(input);
    expect(calls.filter((c) => c.url.endsWith('/authentication/token'))).toHaveLength(1);
    const booking = calls.find((c) => c.url.endsWith('/booking/create'))!;
    expect(booking.req.headers?.Authorization).toBe('Bearer tok-1');
    expect(JSON.parse(booking.req.body!).shipmentinfo.codamount).toBe(20_300);
    const auth = calls[0]!;
    expect(auth.req.method).toBe('GET');
    expect(JSON.parse(auth.req.body!)).toEqual({ username: 'user', password: 'secret-pw' });
    expect(auth.url).not.toContain('secret-pw');
  });
  it('re-authenticates once when the token is rejected', async () => {
    let creates = 0;
    let auths = 0;
    const { http } = script((c) => {
      if (c.url.endsWith('/authentication/token')) return { status: 200, body: { ...AUTH_OK.body, accesstoken: `tok-${++auths}` } };
      return ++creates === 1 ? { status: 401, body: { code: 401, message: 'Invalid Bearer token' } } : { status: 200, body: ok };
    });
    expect((await new TcsProvider(tcsCfg, http, () => NOW).book(input)).trackingNumber).toBe('99210301520');
    expect(auths).toBe(2);
  });
  it('separates a definite refusal from an unknown outcome', async () => {
    const refuse = (res: { status: number; body: unknown } | Error) => new TcsProvider(tcsCfg, script((c) => (c.url.endsWith('/authentication/token') ? AUTH_OK : res)).http, () => NOW).book(input);
    await expect(refuse({ status: 400, body: { error: [{ errorname: 'Invalid city' }], message: 'Validation failed' } })).rejects.toThrow(/Validation failed - Invalid city/);
    await expect(refuse({ status: 200, body: { status: false, message: 'Cost center not found' } })).rejects.toBeInstanceOf(CourierRejected);
    await expect(refuse({ status: 500, body: 'oops' })).rejects.toBeInstanceOf(CourierUncertain);
    await expect(refuse({ status: 200, body: 'not json' })).rejects.toBeInstanceOf(CourierUncertain);
    await expect(refuse(new Error('socket hang up'))).rejects.toBeInstanceOf(CourierUncertain);
    await expect(new TcsProvider(tcsCfg, script(() => ({ status: 401, body: {} })).http).book(input)).rejects.toBeInstanceOf(CourierRejected);
  });
  it('reads the documented tracking response', async () => {
    const sample = {
      shipmentinfo: [{ consignmentno: '779412326902' }],
      deliveryinfo: [
        { station: 'BAGH', datetime: 'Thursday Oct 17, 2024 12:58', recievedby: 'IMROOZ', status: 'Delivered', code: 'OK', allowshow: 'Y' },
        { station: 'BAGH', datetime: 'Wednesday Oct 16, 2024 11:58', recievedby: null, status: 'Awaiting Receiver Collection', code: 'SC', allowshow: 'Y' },
      ],
      checkpoints: [
        { datetime: 'Thursday Oct 17, 2024 12:58', status: 'Shipment Delivered' },
        { datetime: 'Thursday Oct 17, 2024 09:35', status: 'Out For Delivery' },
        { datetime: 'Wednesday Oct 16, 2024 10:52', status: 'Arrived at TCS Facility' },
      ],
      message: 'SUCCESS',
    };
    const { http, calls } = script((c) => (c.url.endsWith('/authentication/token') ? AUTH_OK : { status: 200, body: sample }));
    const { events } = await new TcsProvider(tcsCfg, http, () => NOW).track('779412326902');
    expect(calls.find((c) => c.url.includes('GetDynamicTrackDetail'))!.url).toContain('consignee=779412326902');
    expect(events.map((e) => [e.description, e.status])).toEqual([
      ['Delivered', 'delivered'], ['Awaiting Receiver Collection', 'delivery_failed'], ['Shipment Delivered', 'delivered'], ['Out For Delivery', 'out_for_delivery'], ['Arrived at TCS Facility', 'in_transit'],
    ]);
    expect(latestStatus(events)).toBe('delivered');
  });
  it('treats "no data" as an empty history and an outage as unknown', async () => {
    const empty = script((c) => (c.url.endsWith('/authentication/token') ? AUTH_OK : { status: 200, body: { shipmentinfo: null, deliveryinfo: null, checkpoints: null, message: 'FAIL' } }));
    expect((await new TcsProvider(tcsCfg, empty.http).track('1')).events).toEqual([]);
    const down = script((c) => (c.url.endsWith('/authentication/token') ? AUTH_OK : { status: 503, body: '' }));
    await expect(new TcsProvider(tcsCfg, down.http).track('1')).rejects.toBeInstanceOf(CourierUncertain);
  });
  it('cancels with the documented body', async () => {
    const { http, calls } = script((c) => (c.url.endsWith('/authentication/token') ? AUTH_OK : { status: 200, body: { message: 'SUCCESS' } }));
    await new TcsProvider(tcsCfg, http).cancel('173000008151');
    expect(JSON.parse(calls.find((c) => c.url.endsWith('/booking/cancel'))!.req.body!)).toMatchObject({ consignmentNumber: '173000008151', accesstoken: 'tok-1' });
    const no = script((c) => (c.url.endsWith('/authentication/token') ? AUTH_OK : { status: 200, body: { message: 'Failure: No Record Founds' } }));
    await expect(new TcsProvider(tcsCfg, no.http).cancel('1')).rejects.toBeInstanceOf(CourierRejected);
  });
});

describe('LeopardsProvider', () => {
  const cfg = { baseUrl: 'https://leopards.example/api/', apiKey: 'KEY', apiPassword: 'PASS' };
  const cities = { status: 1, city_list: [{ id: 789, name: 'Lahore' }, { id: 790, name: 'Karachi' }] };
  const form = (c: Call) => Object.fromEntries(new URLSearchParams(c.req.body));

  it('looks up the destination city id once and books with the documented fields', async () => {
    const { http, calls } = script((c) => (c.url.includes('getAllCities') ? { status: 200, body: cities } : { status: 200, body: { status: 1, error: 0, track_number: 'LE100200300' } }));
    const lcs = new LeopardsProvider(cfg, http, () => NOW);
    expect(await lcs.book(input)).toEqual({ trackingNumber: 'LE100200300' });
    await lcs.book({ ...input, city: ' KARACHI ' });
    expect(calls.filter((c) => c.url.includes('getAllCities'))).toHaveLength(1);
    const booking = form(calls.find((c) => c.url.includes('bookPacket'))!);
    expect(booking).toMatchObject({
      api_key: 'KEY', api_password: 'PASS', booked_packet_weight: '300', booked_packet_no_piece: '1', booked_packet_collect_amount: '20300', booked_packet_order_id: 'MPL-AB12CD34',
      origin_city: 'self', destination_city: '790', shipment_name_eng: 'self', consignment_name_eng: 'Ayesha Bibi Khan', consignment_phone: '03001234567',
    });
    expect(calls.find((c) => c.url.includes('bookPacket'))!.url).toBe('https://leopards.example/api/bookPacket/format/json/');
    expect(calls.find((c) => c.url.includes('bookPacket'))!.req.headers?.['Content-Type']).toBe('application/x-www-form-urlencoded');
  });
  it('rejects unknown cities and refusals, and reports unclear answers as unknown', async () => {
    const run = (book: { status: number; body: unknown } | Error, city = 'Karachi') =>
      new LeopardsProvider(cfg, script((c) => (c.url.includes('getAllCities') ? { status: 200, body: cities } : book)).http).book({ ...input, city });
    await expect(run({ status: 200, body: {} }, 'Atlantis')).rejects.toThrow(/does not list "Atlantis"/);
    await expect(run({ status: 200, body: { status: 0, error: 'Invalid API credentials' } })).rejects.toThrow(/Invalid API credentials/);
    await expect(run({ status: 200, body: { status: 1 } })).rejects.toBeInstanceOf(CourierUncertain);
    await expect(run({ status: 502, body: 'bad gateway' })).rejects.toBeInstanceOf(CourierUncertain);
    await expect(run(new Error('ECONNRESET'))).rejects.toBeInstanceOf(CourierUncertain);
  });
  it('parses tracking history and cancels', async () => {
    const tracking = { status: 1, packet_list: [{ 'Tracking Detail': [{ Status: 'Pending', Activity_Date: '2026-11-01 10:00:00' }, { Status: 'Delivered', Activity_Date: '2026-11-03 15:30:00' }, { Status: 'Delivered', Activity_Date: 'bad' }] }] };
    const lcs = new LeopardsProvider(cfg, script((c) => (c.url.includes('trackBookedPacket') ? { status: 200, body: tracking } : { status: 200, body: { status: 1 } })).http);
    const { events } = await lcs.track('LE1');
    expect(events.map((e) => e.status)).toEqual([null, 'delivered']);
    await expect(lcs.cancel('LE1')).resolves.toBeUndefined();
    await expect(new LeopardsProvider(cfg, script(() => ({ status: 200, body: { status: 0, error: 'Not allowed' } })).http).cancel('LE1')).rejects.toBeInstanceOf(CourierRejected);
  });
});
