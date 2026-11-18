// Branded transactional emails. Table layout and inline styles because that is what mail clients render reliably.
// Every dynamic value is HTML-escaped; there are no remote images, scripts or fonts that can fail to load.
const C = { ivory: '#EAE4D9', white: '#F8F7F3', ink: '#282722', bronze: '#77634D', taupe: '#D8D0C5', grey: '#77736B' };
const SERIF = "'Cormorant Garamond', Georgia, 'Times New Roman', serif";
const SANS = 'Inter, Arial, Helvetica, sans-serif';

export const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export function formatPkr(paisa: number): string {
  const rupees = paisa / 100;
  return `Rs ${rupees.toLocaleString('en-US', { minimumFractionDigits: paisa % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

export interface Rendered {
  subject: string;
  html: string;
  text: string;
}

interface Spec {
  subject: string;
  preheader: string;
  heading: string;
  lines: string[];
  rows?: [string, string][];
  cta?: { label: string; url: string };
  note?: string;
}

function render(s: Spec): Rendered {
  const rows = (s.rows ?? [])
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 0;font:14px ${SANS};color:${C.grey}">${esc(k)}</td><td align="right" style="padding:6px 0;font:14px ${SANS};color:${C.ink}">${esc(v)}</td></tr>`,
    )
    .join('');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(s.subject)}</title></head>
<body style="margin:0;padding:0;background:${C.ivory}"><span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(s.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.ivory}"><tr><td align="center" style="padding:32px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td align="center" style="padding:0 0 24px;font:600 26px ${SERIF};letter-spacing:8px;color:${C.ink}">MAPLE</td></tr>
<tr><td style="background:${C.white};border:1px solid ${C.taupe};padding:36px 32px">
<h1 style="margin:0 0 20px;font:500 26px/1.25 ${SERIF};color:${C.ink}">${esc(s.heading)}</h1>
${s.lines.map((l) => `<p style="margin:0 0 14px;font:15px/1.6 ${SANS};color:${C.ink}">${esc(l)}</p>`).join('')}
${rows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;border-top:1px solid ${C.taupe};border-bottom:1px solid ${C.taupe}">${rows}</table>` : ''}
${s.cta ? `<p style="margin:26px 0 8px"><a href="${esc(s.cta.url)}" style="display:inline-block;background:${C.ink};color:${C.white};text-decoration:none;font:600 12px ${SANS};letter-spacing:2px;padding:14px 26px">${esc(s.cta.label.toUpperCase())}</a></p>` : ''}
${s.note ? `<p style="margin:18px 0 0;font:13px/1.5 ${SANS};color:${C.grey}">${esc(s.note)}</p>` : ''}
</td></tr>
<tr><td align="center" style="padding:22px 0 0;font:11px ${SANS};letter-spacing:2px;color:${C.bronze}">THE ART OF EVERYDAY LUXURY</td></tr>
</table></td></tr></table></body></html>`;
  const text = [
    s.heading,
    '',
    ...s.lines,
    ...(s.rows ? ['', ...s.rows.map(([k, v]) => `${k}: ${v}`)] : []),
    ...(s.cta ? ['', `${s.cta.label}: ${s.cta.url}`] : []),
    ...(s.note ? ['', s.note] : []),
    '',
    'MAPLE - The Art of Everyday Luxury',
  ].join('\n');
  return { subject: s.subject, html, text };
}

export interface OrderEmail {
  orderNumber: string;
  customerName: string;
  items: { name: string; options?: string; quantity: number; lineTotal: number }[];
  subtotal: number;
  discountTotal: number;
  shippingFee: number;
  total: number;
  paymentMethod: 'cod' | 'jazzcash' | 'easypaisa';
  address: string;
  trackUrl: string;
}

const first = (name: string) => name.trim().split(/\s+/)[0] ?? name;
const METHOD = { cod: 'Cash on delivery', jazzcash: 'JazzCash', easypaisa: 'Easypaisa' } as const;

function orderRows(o: OrderEmail): [string, string][] {
  return [
    ...o.items.map((i): [string, string] => [
      `${i.name}${i.options ? ` (${i.options})` : ''} x ${i.quantity}`,
      formatPkr(i.lineTotal),
    ]),
    ['Subtotal', formatPkr(o.subtotal)],
    ...(o.discountTotal > 0 ? ([['Discount', `- ${formatPkr(o.discountTotal)}`]] as [string, string][]) : []),
    ['Delivery', o.shippingFee === 0 ? 'Free' : formatPkr(o.shippingFee)],
    ['Total', formatPkr(o.total)],
    ['Payment', METHOD[o.paymentMethod]],
  ];
}

export const welcome = (name: string, shopUrl: string): Rendered =>
  render({
    subject: 'Welcome to MAPLE',
    preheader: 'Your account is ready.',
    heading: `Welcome, ${first(name)}`,
    lines: [
      'Thank you for creating a MAPLE account. You can now save your delivery addresses and follow every order in one place.',
    ],
    cta: { label: 'Explore the collection', url: shopUrl },
  });

export const verifyEmail = (name: string, url: string): Rendered =>
  render({
    subject: 'Confirm your email address',
    preheader: 'One quick step to confirm your MAPLE account.',
    heading: 'Confirm your email',
    lines: [`Hello ${first(name)}, please confirm this email address for your MAPLE account.`],
    cta: { label: 'Confirm email', url },
    note: 'This link works for 48 hours. If you did not create an account, you can ignore this message.',
  });

export const passwordReset = (name: string, url: string): Rendered =>
  render({
    subject: 'Reset your MAPLE password',
    preheader: 'Use this link to choose a new password.',
    heading: 'Reset your password',
    lines: [`Hello ${first(name)}, we received a request to reset your password.`],
    cta: { label: 'Choose a new password', url },
    note: 'This link works for 60 minutes and can be used once. If you did not ask for this, ignore this email; your password has not changed.',
  });

export const orderConfirmation = (o: OrderEmail, awaitingPayment: boolean): Rendered =>
  render({
    subject: `Order ${o.orderNumber} received`,
    preheader: awaitingPayment ? 'Complete your payment to secure your order.' : 'We have received your order.',
    heading: awaitingPayment ? 'Your order is waiting for payment' : 'Thank you for your order',
    lines: [
      `Hello ${first(o.customerName)}, your order ${o.orderNumber} has been received.`,
      awaitingPayment
        ? 'We are holding your items for a short time. Your order is confirmed as soon as the payment goes through.'
        : 'We will confirm it shortly and let you know when it is on its way. You pay the courier in cash on delivery.',
      `Delivering to: ${o.address}`,
    ],
    rows: orderRows(o),
    cta: { label: 'Track your order', url: o.trackUrl },
  });

export const orderConfirmed = (o: OrderEmail): Rendered =>
  render({
    subject: `Order ${o.orderNumber} is confirmed`,
    preheader: 'We are getting your order ready.',
    heading: 'Your order is confirmed',
    lines: [
      `Hello ${first(o.customerName)}, we have confirmed order ${o.orderNumber} and are getting it ready. We will email you again when it is on its way.`,
      o.paymentMethod === 'cod' ? 'You pay the courier in cash when it arrives.' : `Delivering to: ${o.address}`,
    ],
    rows: orderRows(o),
    cta: { label: 'Track your order', url: o.trackUrl },
  });

/** Internal alert for staff: a cash-on-delivery order is waiting for someone to confirm it. Kept short; details live in the admin. */
export const staffNewOrder = (s: {
  orderNumber: string;
  customerName: string;
  city: string;
  total: number;
  itemCount: number;
  adminUrl: string;
}): Rendered =>
  render({
    subject: `New order ${s.orderNumber} is waiting for confirmation`,
    preheader: `${formatPkr(s.total)} · cash on delivery`,
    heading: 'A new order needs confirming',
    lines: [
      `${s.customerName} in ${s.city} placed a cash-on-delivery order for ${s.itemCount} item${s.itemCount === 1 ? '' : 's'} (${formatPkr(s.total)}).`,
      'Open it in the admin to review and confirm or cancel it. The customer is waiting to hear from you.',
    ],
    cta: { label: 'Review order', url: s.adminUrl },
  });

export const paymentConfirmed = (o: OrderEmail): Rendered =>
  render({
    subject: `Payment received for ${o.orderNumber}`,
    preheader: 'Your payment was successful.',
    heading: 'Payment received',
    lines: [
      `Hello ${first(o.customerName)}, we have received your payment of ${formatPkr(o.total)} for order ${o.orderNumber}. Your order is confirmed.`,
    ],
    rows: orderRows(o),
    cta: { label: 'Track your order', url: o.trackUrl },
  });

export const paymentFailed = (o: OrderEmail): Rendered =>
  render({
    subject: `Payment for ${o.orderNumber} did not go through`,
    preheader: 'You can try again.',
    heading: 'Your payment did not go through',
    lines: [
      `Hello ${first(o.customerName)}, the payment for order ${o.orderNumber} was not completed and you have not been charged by us.`,
      'We are still holding your items for a short while. You can try again, or choose another payment method.',
    ],
    cta: { label: 'Try again', url: o.trackUrl },
  });

export const orderDispatched = (o: OrderEmail, courier: string, trackingNumber: string): Rendered =>
  render({
    subject: `Your order ${o.orderNumber} is on its way`,
    preheader: `Tracking number ${trackingNumber}`,
    heading: 'Your order is on its way',
    lines: [
      `Hello ${first(o.customerName)}, order ${o.orderNumber} has been handed to ${courier.toUpperCase()}.`,
      `Tracking number: ${trackingNumber}`,
      `Delivering to: ${o.address}`,
    ],
    cta: { label: 'Track your order', url: o.trackUrl },
  });

export const trackingUpdate = (o: OrderEmail, statusLabel: string, trackingNumber: string): Rendered =>
  render({
    subject: `Update on order ${o.orderNumber}: ${statusLabel}`,
    preheader: statusLabel,
    heading: statusLabel,
    lines: [
      `Hello ${first(o.customerName)}, here is the latest on order ${o.orderNumber} (tracking ${trackingNumber}).`,
    ],
    cta: { label: 'Track your order', url: o.trackUrl },
  });

export const delivered = (o: OrderEmail): Rendered =>
  render({
    subject: `Order ${o.orderNumber} delivered`,
    preheader: 'We hope you love it.',
    heading: 'Delivered',
    lines: [
      `Hello ${first(o.customerName)}, order ${o.orderNumber} has been delivered. We hope you enjoy every detail.`,
      'If anything is not right, you can request a return from your order page within the return period.',
    ],
    cta: { label: 'View your order', url: o.trackUrl },
  });

export const cancelled = (o: OrderEmail, reason?: string): Rendered =>
  render({
    subject: `Order ${o.orderNumber} cancelled`,
    preheader: 'Your order has been cancelled.',
    heading: 'Your order was cancelled',
    lines: [
      `Hello ${first(o.customerName)}, order ${o.orderNumber} has been cancelled.`,
      ...(reason ? [`Reason: ${reason}`] : []),
      'If you paid online, any refund is handled by our team and we will be in touch.',
    ],
    cta: { label: 'View your order', url: o.trackUrl },
  });

export interface ReturnEmail {
  reference: string;
  orderNumber: string;
  customerName: string;
  status: 'requested' | 'approved' | 'rejected' | 'received' | 'refunded' | 'exchanged' | 'closed';
  note?: string;
  refundAmount?: number;
  trackUrl: string;
}

const RETURN_COPY: Record<ReturnEmail['status'], [string, string]> = {
  requested: ['Return request received', 'We have received your request and will review it shortly.'],
  approved: ['Return approved', 'Your return has been approved. We will contact you about sending the item back.'],
  rejected: ['Return request declined', 'We are sorry, but we could not approve this return request.'],
  received: ['Return received', 'We have received your item and will inspect it.'],
  refunded: ['Refund issued', 'Your refund has been processed by our team.'],
  exchanged: ['Exchange arranged', 'Your exchange has been arranged.'],
  closed: ['Return closed', 'This return request has been closed.'],
};

export const returnUpdate = (r: ReturnEmail): Rendered => {
  const [heading, line] = RETURN_COPY[r.status];
  return render({
    subject: `${heading} (${r.reference})`,
    preheader: heading,
    heading,
    lines: [`Hello ${first(r.customerName)}, ${line}`, ...(r.note ? [`Note from our team: ${r.note}`] : [])],
    rows: [
      ['Return', r.reference],
      ['Order', r.orderNumber],
      ...(r.refundAmount ? ([['Refund', formatPkr(r.refundAmount)]] as [string, string][]) : []),
    ],
    cta: { label: 'View order', url: r.trackUrl },
  });
};

export const newsletterConfirm = (confirmUrl: string): Rendered =>
  render({
    subject: 'Confirm your MAPLE subscription',
    preheader: 'One quick step to join the list.',
    heading: 'Confirm your subscription',
    lines: [
      'Thank you for your interest in MAPLE. Please confirm that this is your email address and that you would like to hear from us about new arrivals and stories.',
    ],
    cta: { label: 'Confirm subscription', url: confirmUrl },
    note: 'If you did not ask to join the MAPLE list, simply ignore this email and you will not be subscribed.',
  });

export const newsletterWelcome = (unsubscribeUrl: string): Rendered =>
  render({
    subject: 'You are on the MAPLE list',
    preheader: 'Thank you for subscribing.',
    heading: 'Thank you for subscribing',
    lines: ['You will hear from us about new arrivals and stories from MAPLE. We keep it rare and thoughtful.'],
    note: `You can unsubscribe at any time: ${unsubscribeUrl}`,
  });
