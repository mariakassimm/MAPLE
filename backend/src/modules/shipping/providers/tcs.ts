import { normalizePkMobile } from '../../../common/validators';
import { pktStamp } from '../../../common/time';
import { defaultHttp } from '../../payments/http';
import type { HttpClient } from '../../payments/types';
import { normalizeCourierStatus } from '../statusMap';
import {
  CourierRejected,
  CourierUncertain,
  type BookingInput,
  type BookingResult,
  type CourierProvider,
  type TrackingEvent,
  type TrackingResult,
} from '../types';

export interface ShipFrom {
  name: string;
  phone: string;
  city: string;
  address: string;
}

export interface TcsConfig {
  baseUrl: string;
  username: string;
  password: string;
  accountNumber: string;
  costCenterCode: string;
  serviceCode: string;
  shipFrom: ShipFrom;
}

// Hosts from TCS's "API User Guide v1.0" (sandbox = UAT, production needs UAT sign-off and at least 3 working days).
export const TCS_BASE = {
  sandbox: 'https://devconnect.tcscourier.com',
  production: 'https://ociconnect.tcscourier.com',
} as const;

export const TCS_MAX_COD_RUPEES = 250_000;
const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

/** TCS tracking times look like "Thursday Oct 17, 2024 12:58" in Pakistan time. */
export function parseTcsDate(text: string): Date | null {
  const m = /([A-Za-z]{3})[a-z]* (\d{1,2}), (\d{4}) (\d{1,2}):(\d{2})/.exec(text);
  const month = m ? MONTHS[m[1]!.toLowerCase()] : undefined;
  if (!m || month === undefined) return null;
  return new Date(Date.UTC(Number(m[3]), month, Number(m[2]), Number(m[4]) - 5, Number(m[5])));
}

const localMobile = (phone: string): string => {
  const e164 = normalizePkMobile(phone);
  return e164 ? `0${e164.slice(3)}` : phone;
};
const clip = (s: string, max: number) => s.trim().slice(0, max);
const rupees = (paisa: number) => Math.round(paisa / 100);

export function buildTcsBooking(
  cfg: TcsConfig,
  input: BookingInput,
  accessToken: string,
  now: Date,
): Record<string, unknown> {
  const cod = rupees(input.codAmount);
  if (cod > TCS_MAX_COD_RUPEES) {
    throw new CourierRejected(
      `TCS accepts at most Rs ${TCS_MAX_COD_RUPEES.toLocaleString('en-US')} cash on delivery per consignment; this order is Rs ${cod.toLocaleString('en-US')}. Book it manually or split it.`,
    );
  }
  const [first = input.recipientName, ...rest] = input.recipientName.trim().split(/\s+/);
  const weight = Math.max(0.5, input.weightKg);
  const d = pktStamp(now); // yyyyMMddHHmmss
  const shipmentdate = `${d.slice(6, 8)}/${d.slice(4, 6)}/${d.slice(0, 4)} ${d.slice(8, 10)}:${d.slice(10, 12)}:${d.slice(12, 14)}`;
  return {
    accesstoken: accessToken,
    consignmentno: '',
    shipperinfo: {
      tcsaccount: cfg.accountNumber,
      shippername: clip(cfg.shipFrom.name, 50),
      address1: clip(cfg.shipFrom.address, 120),
      countrycode: 'PK',
      countryname: 'Pakistan',
      cityname: clip(cfg.shipFrom.city, 50),
      mobile: localMobile(cfg.shipFrom.phone),
    },
    consigneeinfo: {
      firstname: clip(first, 50),
      // The guide marks middlename mandatory (3+ characters); there is no such thing in a Pakistani order, so a placeholder is sent.
      middlename: 'N/A',
      lastname: clip(rest.join(' '), 50),
      address1: clip(input.address, 120),
      address2: clip(`${input.area}, ${input.province}`, 120),
      zip: input.postalCode ?? '',
      countrycode: 'PK',
      countryname: 'Pakistan',
      cityname: clip(input.city, 50),
      email: input.email ?? '',
      areaname: clip(input.area, 50),
      mobile: localMobile(input.phone),
    },
    shipmentinfo: {
      costcentercode: cfg.costCenterCode,
      referenceno: input.orderNumber,
      contentdesc: 'MAPLE order',
      servicecode: cfg.serviceCode,
      shipmentdate,
      currency: 'PKR',
      // Whole rupees, not paisa.
      codamount: cod,
      weightinkg: weight,
      pieces: input.pieces,
      fragile: false,
      remarks: clip(input.remarks ?? `Order ${input.orderNumber}`, 500),
      skus: input.items.map((i) => ({
        description: clip(i.name, 50),
        quantity: i.quantity,
        weight,
        uom: 'PCS',
        unitprice: Math.min(250_000, Math.max(1, rupees(i.unitPrice))),
      })),
    },
  };
}

const json = (body: string): Record<string, any> | null => {
  try {
    const v = JSON.parse(body);
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
};

export class TcsProvider implements CourierProvider {
  readonly id = 'tcs' as const;
  private token?: { value: string; expiresAt: number };

  constructor(
    private readonly cfg: TcsConfig,
    private readonly http: HttpClient = defaultHttp,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async send(
    method: 'GET' | 'POST',
    path: string,
    init: { body?: unknown; query?: Record<string, string>; headers?: Record<string, string> } = {},
  ) {
    const url = `${this.cfg.baseUrl}${path}${init.query ? `?${new URLSearchParams(init.query)}` : ''}`;
    try {
      return await this.http(url, {
        method,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...init.headers },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        timeoutMs: 15_000,
      });
    } catch (err) {
      throw new CourierUncertain(`TCS could not be reached (${err instanceof Error ? err.message : 'network error'})`);
    }
  }

  private async accessToken(force = false): Promise<string> {
    if (!force && this.token && this.token.expiresAt - 60_000 > this.now().getTime()) return this.token.value;
    const res = await this.send('GET', '/ecom/api/authentication/token', {
      body: { username: this.cfg.username, password: this.cfg.password },
    });
    const data = json(res.body);
    if (res.status === 200 && typeof data?.accesstoken === 'string' && data.accesstoken) {
      const expiry = typeof data.expiry === 'string' ? Date.parse(data.expiry) : Number.NaN;
      this.token = {
        value: data.accesstoken,
        expiresAt: Number.isFinite(expiry) ? expiry : this.now().getTime() + 30 * 60_000,
      };
      return this.token.value;
    }
    if ([400, 401, 403].includes(res.status)) throw new CourierRejected('TCS rejected the API credentials');
    throw new CourierUncertain(`TCS authentication failed (HTTP ${res.status})`);
  }

  /** Authenticated call; one automatic retry with a fresh token if TCS says the token is no longer valid. */
  private async authed(
    method: 'GET' | 'POST',
    path: string,
    build: (token: string) => { body?: unknown; query?: Record<string, string> },
  ) {
    for (let attempt = 0; ; attempt++) {
      const token = await this.accessToken(attempt > 0);
      const res = await this.send(method, path, { ...build(token), headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401 && attempt === 0) continue;
      return res;
    }
  }

  async book(input: BookingInput): Promise<BookingResult> {
    const res = await this.authed('POST', '/ecom/api/booking/create', (token) => ({
      body: buildTcsBooking(this.cfg, input, token, this.now()),
    }));
    const data = json(res.body);
    if (res.status === 200 && data?.status === true && data.consignmentNo)
      return { trackingNumber: String(data.consignmentNo) };
    const details = Array.isArray(data?.error)
      ? data.error
          .map((e: { errorname?: string }) => e.errorname)
          .filter(Boolean)
          .join('; ')
      : '';
    // 4xx / an explicit failure body means TCS looked at the request and said no. Anything else (5xx, garbage) may have been processed.
    if (res.status === 401 || res.status === 403) throw new CourierRejected('TCS rejected the API credentials');
    if ((res.status >= 400 && res.status < 500) || (res.status === 200 && data && data.status !== true)) {
      throw new CourierRejected(
        `TCS refused the booking: ${[data?.message, details].filter(Boolean).join(' - ') || `HTTP ${res.status}`}`,
      );
    }
    throw new CourierUncertain(`TCS returned an unclear answer (HTTP ${res.status}); the booking may or may not exist`);
  }

  async track(trackingNumber: string): Promise<TrackingResult> {
    const res = await this.authed('GET', '/tracking/api/Tracking/GetDynamicTrackDetail', () => ({
      query: { consignee: trackingNumber },
      body: { consignee: [trackingNumber] },
    }));
    const data = json(res.body);
    if (res.status !== 200 || !data) throw new CourierUncertain(`TCS tracking unavailable (HTTP ${res.status})`);
    const seen = new Set<string>();
    const events: TrackingEvent[] = [];
    const add = (when: unknown, text: unknown, code: unknown, station: unknown) => {
      const at = typeof when === 'string' ? parseTcsDate(when) : null;
      const description = typeof text === 'string' ? text.trim() : '';
      if (!at || !description) return;
      const key = `${at.getTime()}|${description}`;
      if (seen.has(key)) return;
      seen.add(key);
      // Delivery codes from TCS: OK = delivered, RO = returned to origin. Everything else is read from the wording.
      const status =
        code === 'OK' ? 'delivered' : code === 'RO' ? 'returned_to_origin' : normalizeCourierStatus(description);
      events.push({ at, description, status, location: typeof station === 'string' ? station : undefined });
    };
    for (const d of Array.isArray(data.deliveryinfo) ? data.deliveryinfo : [])
      add(d.datetime, d.status, d.code, d.station);
    for (const c of Array.isArray(data.checkpoints) ? data.checkpoints : [])
      add(c.datetime, c.status, undefined, c.recievedby);
    return { events };
  }

  async cancel(trackingNumber: string): Promise<void> {
    const res = await this.authed('POST', '/ecom/api/booking/cancel', (token) => ({
      body: { consignmentNumber: trackingNumber, accesstoken: token },
    }));
    const data = json(res.body);
    if (res.status === 200 && String(data?.message ?? '').toUpperCase() === 'SUCCESS') return;
    if (res.status >= 500 || !data) throw new CourierUncertain(`TCS cancellation unclear (HTTP ${res.status})`);
    throw new CourierRejected(`TCS did not cancel the booking: ${data.message ?? `HTTP ${res.status}`}`);
  }
}
