import { normalizeCity } from '../../../common/geo';
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

export interface LeopardsConfig {
  /** Issued by Leopards for your account (e.g. ends in "/api/"). Deliberately has no default: the sandbox and live hosts differ per merchant. */
  baseUrl: string;
  apiKey: string;
  apiPassword: string;
}

const CITY_CACHE_MS = 24 * 3_600_000;
const rupees = (paisa: number) => Math.round(paisa / 100);

/** Leopards dates are local (PKT): "2024-10-17" or "2024-10-17 12:58:00". */
export function parseLeopardsDate(text: unknown): Date | null {
  if (typeof text !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(text.trim());
  if (!m) return null;
  return new Date(
    Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] ?? 0) - 5, Number(m[5] ?? 0), Number(m[6] ?? 0)),
  );
}

export class LeopardsProvider implements CourierProvider {
  readonly id = 'leopards' as const;
  private cities?: { loadedAt: number; ids: Map<string, string> };

  constructor(
    private readonly cfg: LeopardsConfig,
    private readonly http: HttpClient = defaultHttp,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async post(endpoint: string, fields: Record<string, string>): Promise<Record<string, any>> {
    const base = this.cfg.baseUrl.endsWith('/') ? this.cfg.baseUrl : `${this.cfg.baseUrl}/`;
    let res;
    try {
      res = await this.http(`${base}${endpoint}/format/json/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          api_key: this.cfg.apiKey,
          api_password: this.cfg.apiPassword,
          ...fields,
        }).toString(),
        timeoutMs: 15_000,
      });
    } catch (err) {
      throw new CourierUncertain(
        `Leopards could not be reached (${err instanceof Error ? err.message : 'network error'})`,
      );
    }
    let data: Record<string, any> | null = null;
    try {
      data = JSON.parse(res.body);
    } catch {
      /* handled below */
    }
    if (res.status !== 200 || !data || typeof data !== 'object')
      throw new CourierUncertain(`Leopards returned an unclear answer (HTTP ${res.status})`);
    return data;
  }

  private async cityId(name: string): Promise<string> {
    if (!this.cities || this.now().getTime() - this.cities.loadedAt > CITY_CACHE_MS) {
      const data = await this.post('getAllCities', {});
      const list: { id?: unknown; name?: unknown }[] = Array.isArray(data.city_list) ? data.city_list : [];
      this.cities = {
        loadedAt: this.now().getTime(),
        ids: new Map(
          list
            .filter((c) => c.id !== undefined && typeof c.name === 'string')
            .map((c) => [normalizeCity(c.name as string), String(c.id)]),
        ),
      };
    }
    const id = this.cities.ids.get(normalizeCity(name));
    if (!id) throw new CourierRejected(`Leopards does not list "${name}" as a destination city`);
    return id;
  }

  async book(input: BookingInput): Promise<BookingResult> {
    const destination = await this.cityId(input.city);
    const data = await this.post('bookPacket', {
      booked_packet_weight: String(Math.max(1, Math.round(input.weightKg * 1000))),
      booked_packet_no_piece: String(input.pieces),
      booked_packet_collect_amount: String(rupees(input.codAmount)),
      booked_packet_order_id: input.orderNumber,
      origin_city: 'self',
      destination_city: destination,
      // "self" tells Leopards to use the shipper details registered on the account.
      shipment_name_eng: 'self',
      shipment_email: 'self',
      shipment_phone: 'self',
      shipment_address: 'self',
      consignment_name_eng: input.recipientName,
      consignment_email: input.email ?? '',
      consignment_phone: `0${input.phone.slice(3)}`,
      consignment_address: `${input.address}, ${input.area}`.slice(0, 250),
      special_instructions: (input.remarks ?? `Order ${input.orderNumber}`).slice(0, 250),
    });
    const track = data.track_number ?? data.trackNumber;
    if ((data.status === 1 || data.status === '1') && track) return { trackingNumber: String(track) };
    if (data.status === 0 || data.status === '0' || data.error) {
      throw new CourierRejected(
        `Leopards refused the booking: ${typeof data.error === 'string' ? data.error : JSON.stringify(data.error ?? data).slice(0, 200)}`,
      );
    }
    throw new CourierUncertain('Leopards returned an unclear answer to the booking');
  }

  async track(trackingNumber: string): Promise<TrackingResult> {
    const data = await this.post('trackBookedPacket', { track_numbers: trackingNumber });
    const packet = Array.isArray(data.packet_list) ? data.packet_list[0] : undefined;
    const rows: Record<string, unknown>[] = Array.isArray(packet?.['Tracking Detail'])
      ? packet['Tracking Detail']
      : Array.isArray(packet?.tracking_detail)
        ? packet.tracking_detail
        : [];
    const events: TrackingEvent[] = [];
    for (const row of rows) {
      const at = parseLeopardsDate(row.Activity_datetime ?? row.Activity_Date ?? row.activity_date);
      const description = [row.Status ?? row.status, row.Reason ?? row.reason]
        .filter((v) => typeof v === 'string' && v)
        .join(' - ');
      if (at && description) events.push({ at, description, status: normalizeCourierStatus(description) });
    }
    return { events };
  }

  async cancel(trackingNumber: string): Promise<void> {
    const data = await this.post('cancelBookedPackets', { cn_numbers: trackingNumber });
    if (data.status === 1 || data.status === '1') return;
    throw new CourierRejected(
      `Leopards did not cancel the booking: ${typeof data.error === 'string' ? data.error : 'no reason given'}`,
    );
  }
}
