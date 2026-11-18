export const ORDER_STATUSES = [
  'awaiting_payment',
  'pending_confirmation',
  'confirmed',
  'processing',
  'packed',
  'ready_for_dispatch',
  'shipped',
  'out_for_delivery',
  'delivered',
  'delivery_failed',
  'returned_to_origin',
  'cancelled',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = [
  'unpaid',
  'pending',
  'processing',
  'paid',
  'failed',
  'cancelled',
  'expired',
  'refund_pending',
  'partially_refunded',
  'refunded',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const SHIPMENT_STATUSES = [
  'not_booked',
  'booking_pending',
  'booked',
  'picked_up',
  'in_transit',
  'out_for_delivery',
  'delivered',
  'delivery_failed',
  'return_initiated',
  'returned_to_origin',
  'cancelled',
] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

// The backend validates every transition (SRS 8.2); the admin UI only offers what is listed here.
const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  // Online-payment orders wait here until the provider confirms payment (then confirmed automatically) or the window expires.
  awaiting_payment: ['confirmed', 'cancelled'],
  pending_confirmation: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['packed', 'cancelled'],
  packed: ['ready_for_dispatch', 'cancelled'],
  ready_for_dispatch: ['shipped', 'cancelled'],
  shipped: ['out_for_delivery', 'delivered', 'delivery_failed'],
  out_for_delivery: ['delivered', 'delivery_failed'],
  delivery_failed: ['out_for_delivery', 'delivered', 'returned_to_origin'],
  delivered: [],
  returned_to_origin: [],
  cancelled: [],
};

export const canTransition = (from: OrderStatus, to: OrderStatus): boolean => TRANSITIONS[from].includes(to);
export const allowedTransitions = (from: OrderStatus): readonly OrderStatus[] => TRANSITIONS[from];
