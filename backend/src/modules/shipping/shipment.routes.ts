import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/asyncHandler';
import { pageMeta } from '../../common/pagination';
import { sendOk } from '../../common/response';
import { idParamSchema } from '../../common/validators';
import { requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { auditContext, recordAudit } from '../audit/audit.service';
import { SHIPMENT_STATUSES } from '../orders/orderStatus';
import { Shipment, type ShipmentLean } from './shipment.model';
import * as svc from './shipment.service';

const bookSchema = z
  .object({
    courier: z.enum(['tcs', 'leopards', 'manual']).optional(),
    weightKg: z.number().min(0.5).max(100).optional(),
    pieces: z.number().int().min(1).max(50).optional(),
    remarks: z.string().trim().max(300).optional(),
    trackingNumber: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9-]{4,30}$/, 'Use letters, numbers and dashes (4-30 characters)')
      .optional(),
  })
  .strict();

const trackingSchema = z
  .object({
    trackingNumber: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9-]{4,30}$/, 'Use letters, numbers and dashes (4-30 characters)'),
  })
  .strict();
const manualStatusSchema = z
  .object({
    status: z.enum([
      'picked_up',
      'in_transit',
      'out_for_delivery',
      'delivered',
      'delivery_failed',
      'return_initiated',
      'returned_to_origin',
    ]),
    note: z.string().trim().max(200).optional(),
  })
  .strict();
const listQuery = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(SHIPMENT_STATUSES).optional(),
  courier: z.enum(['tcs', 'leopards', 'manual']).optional(),
  needsReview: z.enum(['true']).optional(),
});

const write = requirePermission('shipments:write');
const read = requirePermission('orders:read');

// Mounted at the admin root: it owns both /orders/:id/shipments and /shipments/...
export const shipmentsAdminRouter = Router();

shipmentsAdminRouter.get(
  '/couriers',
  write,
  asyncHandler(async (_req, res) => sendOk(res, { configured: svc.courierStatus() })),
);

shipmentsAdminRouter.get(
  '/orders/:id/shipments',
  read,
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const items = await Shipment.find({ orderId: req.params.id }).sort({ createdAt: -1 }).lean<ShipmentLean[]>();
    sendOk(res, { shipments: items.map(svc.toShipmentDto) });
  }),
);

shipmentsAdminRouter.post(
  '/orders/:id/shipments',
  write,
  validate({ params: idParamSchema, body: bookSchema }),
  asyncHandler(async (req, res) => {
    const shipment = await svc.bookShipment(req.params.id as string, req.body, {
      id: req.auth!.userId,
      role: req.auth!.role,
    });
    await recordAudit({
      ...auditContext(req),
      action: 'shipment.book',
      resourceType: 'shipment',
      resourceId: String(shipment._id),
      metadata: { order: shipment.orderNumber, courier: shipment.courier, trackingNumber: shipment.trackingNumber },
    });
    sendOk(res, { shipment: svc.toShipmentDto(shipment) }, 201);
  }),
);

shipmentsAdminRouter.get(
  '/shipments',
  read,
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as {
      page: number;
      limit: number;
      status?: string;
      courier?: string;
      needsReview?: string;
    };
    const filter: Record<string, unknown> = {};
    if (q.status) filter.status = q.status;
    if (q.courier) filter.courier = q.courier;
    if (q.needsReview) filter.needsReview = true;
    const [items, total] = await Promise.all([
      Shipment.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .lean<ShipmentLean[]>(),
      Shipment.countDocuments(filter),
    ]);
    sendOk(res, { items: items.map(svc.toShipmentDto), pagination: pageMeta(q.page, q.limit, total) });
  }),
);

shipmentsAdminRouter.post(
  '/shipments/:id/sync',
  write,
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const { shipment, newEvents } = await svc.syncShipment(req.params.id as string);
    sendOk(res, { shipment: svc.toShipmentDto(shipment), newEvents });
  }),
);

shipmentsAdminRouter.patch(
  '/shipments/:id',
  write,
  validate({ params: idParamSchema, body: trackingSchema }),
  asyncHandler(async (req, res) => {
    const shipment = await svc.attachTracking(req.params.id as string, req.body.trackingNumber);
    await recordAudit({
      ...auditContext(req),
      action: 'shipment.attach_tracking',
      resourceType: 'shipment',
      resourceId: String(shipment._id),
      metadata: { trackingNumber: req.body.trackingNumber },
    });
    sendOk(res, { shipment: svc.toShipmentDto(shipment) });
  }),
);

shipmentsAdminRouter.post(
  '/shipments/:id/status',
  write,
  validate({ params: idParamSchema, body: manualStatusSchema }),
  asyncHandler(async (req, res) => {
    const shipment = await svc.setManualStatus(req.params.id as string, req.body.status, req.body.note);
    await recordAudit({
      ...auditContext(req),
      action: 'shipment.manual_status',
      resourceType: 'shipment',
      resourceId: String(shipment._id),
      metadata: { status: req.body.status },
    });
    sendOk(res, { shipment: svc.toShipmentDto(shipment) });
  }),
);

shipmentsAdminRouter.post(
  '/shipments/:id/cancel',
  write,
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const shipment = await svc.cancelShipment(req.params.id as string);
    await recordAudit({
      ...auditContext(req),
      action: 'shipment.cancel',
      resourceType: 'shipment',
      resourceId: String(shipment._id),
    });
    sendOk(res, { shipment: svc.toShipmentDto(shipment) });
  }),
);
