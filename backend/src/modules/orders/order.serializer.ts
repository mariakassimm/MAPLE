import type { OrderLean } from './order.model';

const items = (o: OrderLean) =>
  o.items.map((i) => ({
    productId: String(i.productId),
    variantId: String(i.variantId),
    sku: i.sku,
    name: i.name,
    options: i.options,
    image: i.image ?? null,
    unitPrice: i.unitPrice,
    compareAtPrice: i.compareAtPrice ?? null,
    quantity: i.quantity,
    lineTotal: i.lineTotal,
  }));

// What the shopper (or a guest holding order number + phone) sees. No actor ids, stock state or internal fields.
export const toCustomerOrder = (o: OrderLean) => ({
  orderNumber: o.orderNumber,
  placedAt: o.createdAt,
  status: o.status,
  paymentMethod: o.paymentMethod,
  paymentStatus: o.paymentStatus,
  shipmentStatus: o.shipmentStatus,
  currency: o.currency,
  customer: o.customer,
  shippingAddress: o.shippingAddress,
  items: items(o),
  subtotal: o.subtotal,
  discountTotal: o.discountTotal,
  couponCode: o.couponCode ?? null,
  shippingFee: o.shippingFee,
  total: o.total,
  notes: o.notes ?? null,
  timeline: o.statusHistory.map((h) => ({ status: h.status, at: h.at })),
  cancellation: o.cancellation ? { reason: o.cancellation.reason, at: o.cancellation.at } : null,
});

const maskPhone = (p: string) => (p.length > 5 ? `${p.slice(0, 2)}${'•'.repeat(p.length - 4)}${p.slice(-2)}` : '••••');
const maskEmail = (e?: string) => {
  if (!e) return undefined;
  const [local = '', domain = ''] = e.split('@');
  return `${local.slice(0, 1)}•••@${domain}`;
};

// What a guest sees after proving only "order number + phone". Those two are weak credentials (a phone number is not a
// secret), so the page shows the order's progress and contents but not enough personal data to be worth harvesting:
// no street address, postal code, delivery notes or full contact details. The signed-in owner still gets everything.
export const toGuestOrder = (o: OrderLean) => {
  const full = toCustomerOrder(o);
  return {
    ...full,
    customer: { name: o.customer.name, phone: maskPhone(o.customer.phone), email: maskEmail(o.customer.email) },
    shippingAddress: {
      recipientName: o.shippingAddress.recipientName,
      phone: o.shippingAddress.phone ? maskPhone(o.shippingAddress.phone) : undefined,
      province: o.shippingAddress.province,
      city: o.shippingAddress.city,
      area: o.shippingAddress.area,
      line1: '',
    },
    notes: null,
  };
};

export const toCustomerOrderSummary = (o: OrderLean) => ({
  orderNumber: o.orderNumber,
  placedAt: o.createdAt,
  status: o.status,
  paymentMethod: o.paymentMethod,
  paymentStatus: o.paymentStatus,
  total: o.total,
  currency: o.currency,
  itemCount: o.items.reduce((n, i) => n + i.quantity, 0),
  thumbnail: o.items[0]?.image ?? null,
});

export const toAdminOrder = (o: OrderLean) => ({
  ...toCustomerOrder(o),
  id: String(o._id),
  userId: o.userId ? String(o.userId) : null,
  couponId: o.couponId ? String(o.couponId) : null,
  demoPayment: !!o.demoPayment,
  inventoryState: o.inventoryState,
  cod: o.cod ?? null,
  statusHistory: o.statusHistory.map((h) => ({
    status: h.status,
    at: h.at,
    actorId: h.actorId ? String(h.actorId) : null,
    actorRole: h.actorRole ?? null,
    reason: h.reason ?? null,
  })),
});

export const toAdminOrderListItem = (o: OrderLean) => ({
  id: String(o._id),
  orderNumber: o.orderNumber,
  placedAt: o.createdAt,
  customerName: o.customer.name,
  phone: o.customer.phone,
  city: o.shippingAddress.city,
  total: o.total,
  status: o.status,
  paymentMethod: o.paymentMethod,
  paymentStatus: o.paymentStatus,
  demoPayment: !!o.demoPayment,
  itemCount: o.items.reduce((n, i) => n + i.quantity, 0),
});
