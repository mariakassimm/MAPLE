import { randomInt } from 'crypto';
import type { BookingInput, BookingResult, CourierId, CourierProvider, TrackingEvent, TrackingResult } from '../types';

const MIN = 60_000;
// Minutes after booking at which each scan appears. The wording is chosen to match the real status mapping.
const STAGES: { after: number; description: string; location: string }[] = [
  { after: 0, description: 'Shipment booked', location: 'Origin' },
  { after: 1, description: 'Picked up from shipper', location: 'Origin' },
  { after: 3, description: 'In transit - arrived at sorting hub', location: 'Sorting hub' },
  { after: 6, description: 'Out for delivery', location: 'Destination' },
  { after: 10, description: 'Delivered', location: 'Destination' },
];

/**
 * Stands in for TCS or Leopards when DEMO_MODE is on and that courier has no credentials. The booking time is encoded in
 * the tracking number, so tracking stays stateless and moves forward on its own as the clock does.
 */
export class DemoCourier implements CourierProvider {
  constructor(readonly id: CourierId) {}

  async book(_input: BookingInput): Promise<BookingResult> {
    return {
      trackingNumber: `DEMO-${this.id.toUpperCase()}-${Date.now().toString(36).toUpperCase()}${randomInt(100, 999)}`,
    };
  }

  async track(trackingNumber: string): Promise<TrackingResult> {
    const stamp = trackingNumber.split('-')[2]?.slice(0, -3) ?? '';
    const bookedAt = parseInt(stamp, 36);
    if (!Number.isFinite(bookedAt)) return { events: [] };
    const elapsed = Date.now() - bookedAt;
    const statuses: Record<string, TrackingEvent['status']> = {
      'Shipment booked': 'booked',
      'Picked up from shipper': 'picked_up',
      'In transit - arrived at sorting hub': 'in_transit',
      'Out for delivery': 'out_for_delivery',
      Delivered: 'delivered',
    };
    return {
      events: STAGES.filter((s) => elapsed >= s.after * MIN).map((s) => ({
        at: new Date(bookedAt + s.after * MIN),
        description: `${s.description} (demo)`,
        status: statuses[s.description] ?? null,
        location: s.location,
      })),
    };
  }

  async cancel(_trackingNumber: string): Promise<void> {}
}
