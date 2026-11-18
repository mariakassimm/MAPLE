/** All money is integer paisa end to end; this is the only place it becomes a display string. */
export function formatPKR(paisa: number): string {
  const rupees = paisa / 100;
  const whole = Number.isInteger(rupees);
  return `Rs ${rupees.toLocaleString('en-PK', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

export const formatDate = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));

export const optionLabel = (options: { name: string; value: string }[]) => options.map((o) => o.value).join(' / ');

const STATUS_LABELS: Record<string, string> = {
  awaiting_payment: 'Awaiting payment',
  pending_confirmation: 'Order received',
  confirmed: 'Confirmed',
  processing: 'Being prepared',
  packed: 'Packed',
  ready_for_dispatch: 'Ready for dispatch',
  shipped: 'Shipped',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  delivery_failed: 'Delivery attempt failed',
  returned_to_origin: 'Returned to us',
  cancelled: 'Cancelled',
  unpaid: 'Unpaid',
  pending: 'Pending',
  processing_payment: 'Processing',
  paid: 'Paid',
  failed: 'Failed',
  expired: 'Expired',
  refund_pending: 'Refund pending',
  partially_refunded: 'Partially refunded',
  refunded: 'Refunded',
  requested: 'Requested',
  approved: 'Approved',
  rejected: 'Declined',
  received: 'Received',
  completed: 'Completed',
};
export const statusLabel = (s: string) =>
  STATUS_LABELS[s] ?? s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
export const methodLabel = (m: string) =>
  (({ cod: 'Cash on delivery', jazzcash: 'JazzCash', easypaisa: 'Easypaisa' }) as Record<string, string>)[m] ?? m;
export const formatDateTime = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
export const normalizePhone = (v: string) => v.replace(/[\s-]/g, '');
/** Pakistani mobile: 03xx…, 3xx…, 92 3xx… or +92 3xx… (operators 30–34). MUST stay in step with backend/src/common/validators.ts; the
 *  shared PK_MOBILE_CASES contract test (format.test.ts here, validators.test.ts there) fails if the two drift apart. */
export const PK_MOBILE = /^(?:\+92|92|0)?3[0-4]\d{8}$/;

/** Admin forms take rupees; the API takes integer paisa. Returns null for anything that is not a positive amount with at most 2 decimals. */
export function rupeesToPaisa(input: string): number | null {
  const t = input.trim().replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const n = Math.round(Number(t) * 100);
  return Number.isSafeInteger(n) ? n : null;
}
