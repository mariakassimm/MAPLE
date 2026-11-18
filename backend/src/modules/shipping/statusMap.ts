import type { ShipmentStatus } from '../orders/orderStatus';

// Courier wording is free text and varies by branch, so matching is deliberately conservative: order matters
// (most specific first) and anything unrecognised stays null, which records history without changing any status.
const RULES: [RegExp, ShipmentStatus][] = [
  [/return(ed)? to (origin|shipper|sender)|rto\b|return delivered/i, 'returned_to_origin'],
  [/return(ing)?\b|returned/i, 'return_initiated'],
  [/out for delivery|with (the )?courier for delivery|delivery run/i, 'out_for_delivery'],
  [
    /undelivered|delivery (attempt )?(failed|unsuccessful)|refused|not available|consignee (not|unavailable)|awaiting receiver collection|address (incorrect|not found)/i,
    'delivery_failed',
  ],
  [/delivered|shipment delivered/i, 'delivered'],
  [
    /arrived|departed|in transit|dispatched|forwarded|reached|sorting|hub|facility|enroute|en route|on the way|shipment - in transit/i,
    'in_transit',
  ],
  [/picked( up)?|pickup done|collected from shipper|received at origin|booking received/i, 'picked_up'],
  [/booked|booking (created|confirmed)|shipment information received|pending pickup/i, 'booked'],
];

export function normalizeCourierStatus(text: string | undefined | null): ShipmentStatus | null {
  if (!text) return null;
  for (const [pattern, status] of RULES) if (pattern.test(text)) return status;
  return null;
}

// Once a shipment is delivered, returned or cancelled, late or reordered courier scans must not move it again.
export const TERMINAL_SHIPMENT: readonly ShipmentStatus[] = ['delivered', 'returned_to_origin', 'cancelled'];

const RANK: Partial<Record<ShipmentStatus, number>> = {
  booking_pending: 0,
  booked: 1,
  picked_up: 2,
  in_transit: 3,
  out_for_delivery: 4,
  delivery_failed: 4,
  return_initiated: 5,
  delivered: 6,
  returned_to_origin: 6,
};

/** True when `next` is a legitimate move forward from `current` (delivery_failed may retry out_for_delivery). */
export function isForward(current: ShipmentStatus, next: ShipmentStatus): boolean {
  if (TERMINAL_SHIPMENT.includes(current) || current === next) return false;
  if (current === 'delivery_failed' && next === 'out_for_delivery') return true;
  return (RANK[next] ?? -1) > (RANK[current] ?? -1) || (current === 'out_for_delivery' && next === 'delivery_failed');
}

/** The newest recognised status in a list of events, by time. */
export function latestStatus(events: { at: Date; status: ShipmentStatus | null }[]): ShipmentStatus | null {
  const sorted = [...events].filter((e) => e.status).sort((a, b) => a.at.getTime() - b.at.getTime());
  return sorted.length > 0 ? (sorted[sorted.length - 1]!.status as ShipmentStatus) : null;
}
