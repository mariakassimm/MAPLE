import { afterEach, describe, expect, it, vi } from 'vitest';
import { DemoCourier } from '../../src/modules/shipping/providers/demo';
import { latestStatus } from '../../src/modules/shipping/statusMap';

const input = { orderNumber: 'MPL-AAAAAAAA', recipientName: 'A B', phone: '+923001234567', province: 'Sindh', city: 'Karachi', area: 'X', address: 'Y', codAmount: 0, weightKg: 1, pieces: 1, items: [] };

describe('demo courier', () => {
  afterEach(() => vi.useRealTimers());

  it('issues a tracking number and moves a parcel forward as time passes', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-18T10:00:00Z'));
    const c = new DemoCourier('tcs');
    const { trackingNumber } = await c.book(input);
    expect(trackingNumber).toMatch(/^DEMO-TCS-/);

    expect(latestStatus((await c.track(trackingNumber)).events)).toBe('booked');
    vi.setSystemTime(new Date('2026-11-18T10:04:00Z'));
    expect(latestStatus((await c.track(trackingNumber)).events)).toBe('in_transit');
    vi.setSystemTime(new Date('2026-11-18T10:11:00Z'));
    const { events } = await c.track(trackingNumber);
    expect(latestStatus(events)).toBe('delivered');
    expect(events).toHaveLength(5);
  });

  it('keeps event times stable so repeated syncs do not duplicate history', async () => {
    const c = new DemoCourier('leopards');
    const { trackingNumber } = await c.book(input);
    const a = await c.track(trackingNumber);
    const b = await c.track(trackingNumber);
    expect(a.events.map((e) => e.at.getTime())).toEqual(b.events.map((e) => e.at.getTime()));
  });

  it('returns nothing for a number it did not issue', async () => {
    expect((await new DemoCourier('tcs').track('garbage')).events).toEqual([]);
  });
});
