import type { Express } from 'express';
import { Order } from '../src/modules/orders/order.model';
import { createUser, loginAs } from './helpers';

export const IMAGE = { url: 'https://res.cloudinary.com/demo/image/upload/sample.jpg', alt: 'Product photograph' };

export async function adminClient(app: Express, email = 'root@example.com', role: 'super_admin' | 'product_manager' | 'order_manager' | 'support_staff' = 'super_admin') {
  await createUser({ email, role });
  const { agent, csrf } = await loginAs(app, email);
  return {
    agent,
    get: (path: string) => agent.get(`/api/v1${path}`),
    post: (path: string, body?: object) => agent.post(`/api/v1${path}`).set('X-CSRF-Token', csrf).send(body),
    patch: (path: string, body?: object) => agent.patch(`/api/v1${path}`).set('X-CSRF-Token', csrf).send(body),
  };
}
export type AdminClient = Awaited<ReturnType<typeof adminClient>>;

export async function makeCategory(admin: AdminClient, name = 'Handbags') {
  const res = await admin.post('/admin/categories', { name });
  if (res.status !== 201) throw new Error(`category failed: ${JSON.stringify(res.body)}`);
  return res.body.data.category as { id: string; slug: string };
}

export interface VariantSeed { sku: string; price?: number; salePrice?: number; stock?: number; color?: string }

export interface ProductSeed {
  name: string;
  variants?: VariantSeed[];
  publish?: boolean;
  featured?: boolean;
  bestseller?: boolean;
  allowBackorder?: boolean;
}

export async function makeProduct(admin: AdminClient, categoryId: string, seed: ProductSeed) {
  const variants = (seed.variants ?? [{ sku: `SKU-${seed.name.replace(/\W/g, '').toUpperCase()}` }]).map((v) => ({
    sku: v.sku,
    price: v.price ?? 1_000_000,
    salePrice: v.salePrice,
    initialStock: v.stock ?? 0,
    options: v.color ? [{ name: 'Color', value: v.color }] : [],
  }));
  const created = await admin.post('/admin/products', {
    name: seed.name, categoryId, images: [IMAGE], featured: seed.featured, bestseller: seed.bestseller, allowBackorder: seed.allowBackorder, variants,
  });
  if (created.status !== 201) throw new Error(`product failed: ${JSON.stringify(created.body)}`);
  let product = created.body.data.product;
  if (seed.publish !== false) {
    const published = await admin.post(`/admin/products/${product.id}/publish`);
    if (published.status !== 200) throw new Error(`publish failed: ${JSON.stringify(published.body)}`);
    product = published.body.data.product;
  }
  return product as { id: string; slug: string; variants: { id: string; sku: string }[] };
}

// ---- Phase 3 helpers ----
import { randomUUID } from 'crypto';
import request from 'supertest';

export async function seedStore(admin: AdminClient) {
  const category = await makeCategory(admin);
  const product = await makeProduct(admin, category.id, {
    name: 'Tote',
    variants: [{ sku: 'TOTE-1', price: 2_000_000, stock: 5, color: 'Black' }, { sku: 'TOTE-2', price: 1_000_000, stock: 1 }],
  });
  await admin.post('/admin/service-areas', { city: 'Karachi', province: 'Sindh', codAvailable: true });
  await admin.post('/admin/service-areas', { city: 'Quetta', province: 'Balochistan', codAvailable: false });
  return { product, v1: product.variants[0]!.id, v2: product.variants[1]!.id };
}

export const orderBody = (items: { variantId: string; quantity: number }[], extra: object = {}) => ({
  items,
  paymentMethod: 'cod',
  customer: { name: 'Ayesha Khan', phone: '0300 1234567', email: 'ayesha@example.com' },
  shippingAddress: { province: 'Sindh', city: 'karachi', area: 'Gulshan-e-Iqbal', line1: 'House 12, Street 4' },
  ...extra,
});

export const placeOrder = (app: Express, payload: object, key: string = randomUUID()) =>
  request(app).post('/api/v1/orders').set('Idempotency-Key', key).send(payload);

// Takes an order all the way to delivered through the real admin endpoints (manual courier), like a store would.
export async function placeDeliveredOrder(
  app: Express,
  admin: AdminClient,
  variantId: string,
  opts: { quantity?: number; session?: { agent: ReturnType<typeof request.agent>; csrf: string }; extra?: Record<string, unknown> } = {},
) {
  const body = orderBody([{ variantId, quantity: opts.quantity ?? 1 }], opts.extra);
  const res = opts.session
    ? await opts.session.agent.post('/api/v1/orders').set('Idempotency-Key', randomUUID()).set('X-CSRF-Token', opts.session.csrf).send(body)
    : await placeOrder(app, body);
  if (res.status !== 201) throw new Error(`order failed: ${JSON.stringify(res.body)}`);
  const orderNumber = res.body.data.order.orderNumber as string;
  const id = String((await Order.findOne({ orderNumber }).lean())!._id);
  await admin.patch(`/admin/orders/${id}/status`, { status: 'confirmed' });
  const shipment = await admin.post(`/admin/orders/${id}/shipments`, { courier: 'manual', trackingNumber: 'MAN-0001' });
  await admin.post(`/admin/shipments/${shipment.body.data.shipment.id}/status`, { status: 'delivered' });
  return { id, orderNumber };
}
