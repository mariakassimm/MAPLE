import { AppError } from '../../common/errors';
import { asyncHandler } from '../../common/asyncHandler';
import { hasPermission, type Role } from '../../common/permissions';
import { sendOk } from '../../common/response';
import { assertCsrf } from '../../middleware/auth';
import { auditContext, recordAudit } from '../audit/audit.service';
import { Shipment, type ShipmentLean } from '../shipping/shipment.model';
import { customerShipmentView, toShipmentDto } from '../shipping/shipment.service';
import { Payment } from '../payments/payment.model';
import { Product } from '../products/product.model';
import { toPaymentDto } from '../payments/payment.routes';
import * as cod from './cod.service';
import * as orders from './order.service';
import {
  toAdminOrder,
  toAdminOrderListItem,
  toCustomerOrder,
  toCustomerOrderSummary,
  toGuestOrder,
} from './order.serializer';

const KEY = /^[A-Za-z0-9_-]{16,64}$/;

export const place = asyncHandler(async (req, res) => {
  const key = req.get('idempotency-key');
  if (!key || !KEY.test(key))
    throw new AppError(400, 'BAD_REQUEST', 'A valid Idempotency-Key header (16-64 characters) is required.');
  // A signed-in shopper is acting through a cookie, so the same CSRF rule applies as for any other write.
  assertCsrf(req);
  const { order, replayed } = await orders.placeOrder(req.body, key, req.auth?.userId);
  if (replayed) res.setHeader('Idempotent-Replay', 'true');
  sendOk(res, { order: toCustomerOrder(order) }, replayed ? 200 : 201);
});

// Items carry the product's current slug (null once a product is gone) so the storefront can link to it and take reviews.
type Serializer = (
  o: Parameters<typeof toCustomerOrder>[0],
) => ReturnType<typeof toCustomerOrder> | ReturnType<typeof toGuestOrder>;
async function withSlugs(
  order: Awaited<ReturnType<typeof orders.trackGuestOrder>>,
  serialize: Serializer = toCustomerOrder,
) {
  const dto = serialize(order);
  const products = await Product.find({ _id: { $in: order.items.map((i) => i.productId) } })
    .select('slug status')
    .lean<{ _id: unknown; slug: string; status: string }[]>();
  const bySlug = new Map(products.filter((p) => p.status === 'published').map((p) => [String(p._id), p.slug]));
  return { ...dto, items: dto.items.map((i) => ({ ...i, productSlug: bySlug.get(i.productId) ?? null })) };
}
const withShipment = async (
  order: Awaited<ReturnType<typeof orders.trackGuestOrder>>,
  serialize: Serializer = toCustomerOrder,
) => ({ ...(await withSlugs(order, serialize)), shipment: await customerShipmentView(order._id) });

export const track = asyncHandler(async (req, res) => {
  sendOk(res, {
    order: await withShipment(await orders.trackGuestOrder(req.body.orderNumber, req.body.phone), toGuestOrder),
  });
});

export const guestCancel = asyncHandler(async (req, res) => {
  const order = await orders.trackGuestOrder(req.body.orderNumber, req.body.phone);
  sendOk(res, {
    order: await withShipment(await orders.cancelOwnOrder(order, undefined, req.body.reason), toGuestOrder),
  });
});

export const accountCancel = asyncHandler(async (req, res) => {
  const order = await orders.getCustomerOrder(req.auth!.userId, req.params.orderNumber as string);
  sendOk(res, { order: await withShipment(await orders.cancelOwnOrder(order, req.auth!.userId, req.body.reason)) });
});

export const accountList = asyncHandler(async (req, res) => {
  const { items, pagination } = await orders.listCustomerOrders(
    req.auth!.userId,
    Number(req.query.page),
    Number(req.query.limit),
  );
  sendOk(res, { items: items.map(toCustomerOrderSummary), pagination });
});

export const accountGet = asyncHandler(async (req, res) => {
  sendOk(res, {
    order: await withShipment(await orders.getCustomerOrder(req.auth!.userId, req.params.orderNumber as string)),
  });
});

export const adminList = asyncHandler(async (req, res) => {
  const { items, pagination } = await orders.listAdminOrders(req.query as never);
  sendOk(res, { items: items.map(toAdminOrderListItem), pagination });
});

export const adminGet = asyncHandler(async (req, res) => {
  const order = await orders.getAdminOrder(req.params.id as string);
  const payments = await Payment.find({ orderId: order._id }).sort({ createdAt: 1 }).lean();
  const shipments = await Shipment.find({ orderId: order._id }).sort({ createdAt: -1 }).lean<ShipmentLean[]>();
  sendOk(res, {
    order: { ...toAdminOrder(order), payments: payments.map(toPaymentDto), shipments: shipments.map(toShipmentDto) },
  });
});

export const adminUpdateStatus = asyncHandler(async (req, res) => {
  const { status, reason } = req.body as { status: Parameters<typeof orders.transitionOrder>[1]; reason?: string };
  // Cancelling is a separate permission from routine status changes (e.g. packing).
  if (status === 'cancelled' && !hasPermission(req.auth!.role as Role, 'orders:cancel')) {
    throw new AppError(403, 'FORBIDDEN', 'You do not have permission to cancel orders.');
  }
  const before = await orders.getAdminOrder(req.params.id as string);
  const order = await orders.transitionOrder(
    req.params.id as string,
    status,
    { id: req.auth!.userId, role: req.auth!.role },
    reason,
  );
  await recordAudit({
    ...auditContext(req),
    action: 'order.status_change',
    resourceType: 'order',
    resourceId: String(order._id),
    metadata: { orderNumber: order.orderNumber, from: before.status, to: status, reason },
  });
  sendOk(res, { order: toAdminOrder(order) });
});

export const codCollection = asyncHandler(async (req, res) => {
  const order = await cod.recordCollection(req.params.id as string, req.body.amount);
  await recordAudit({
    ...auditContext(req),
    action: 'order.cod_collected',
    resourceType: 'order',
    resourceId: String(order._id),
    metadata: { orderNumber: order.orderNumber, amount: req.body.amount },
  });
  sendOk(res, { order: toAdminOrder(order) });
});

export const codRemittance = asyncHandler(async (req, res) => {
  const order = await cod.recordRemittance(req.params.id as string, req.body);
  await recordAudit({
    ...auditContext(req),
    action: 'order.cod_remitted',
    resourceType: 'order',
    resourceId: String(order._id),
    metadata: {
      orderNumber: order.orderNumber,
      amount: req.body.amount,
      courierCharges: req.body.courierCharges,
      reference: req.body.reference,
    },
  });
  sendOk(res, { order: toAdminOrder(order) });
});

export const codSummary = asyncHandler(async (_req, res) => sendOk(res, await cod.codSummary()));
