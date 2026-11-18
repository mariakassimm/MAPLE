import type { ShipmentStatus } from '../orders/orderStatus';

export type CourierId = 'tcs' | 'leopards';
export type ShipmentCourier = CourierId | 'manual';

export interface BookingInput {
  orderNumber: string;
  recipientName: string;
  /** E.164, e.g. +923001234567 */
  phone: string;
  email?: string;
  province: string;
  city: string;
  area: string;
  address: string;
  postalCode?: string;
  /** Integer paisa the courier must collect on delivery; 0 for prepaid orders. */
  codAmount: number;
  weightKg: number;
  pieces: number;
  remarks?: string;
  items: { name: string; quantity: number; unitPrice: number }[];
}

export interface BookingResult {
  trackingNumber: string;
}

export interface TrackingEvent {
  at: Date;
  /** The courier's own wording. */
  description: string;
  /** Our normalized status when the wording is recognised, otherwise null (kept as history only). */
  status: ShipmentStatus | null;
  location?: string;
}

export interface TrackingResult {
  events: TrackingEvent[];
}

export interface CourierProvider {
  readonly id: CourierId;
  book(input: BookingInput): Promise<BookingResult>;
  track(trackingNumber: string): Promise<TrackingResult>;
  cancel(trackingNumber: string): Promise<void>;
}

/** The courier definitively refused the request (validation, limits, bad credentials): nothing was booked. */
export class CourierRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CourierRejected';
  }
}

/** The call may or may not have reached the courier (timeout, dropped connection, garbled reply). */
export class CourierUncertain extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CourierUncertain';
  }
}
