import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/asyncHandler';
import { sendOk } from '../../common/response';
import { idParamSchema, objectIdSchema, pkMobileSchema } from '../../common/validators';
import { assertCsrf, forbidStaff, requireCustomer, requirePermission } from '../../middleware/auth';
import { authLimiter, orderLimiter } from '../../middleware/rateLimit';
import { validate } from '../../middleware/validate';
import { auditContext, recordAudit } from '../audit/audit.service';
import { RETURN_REASONS, RETURN_STATUSES } from './return.model';
import * as svc from './return.service';

const orderNumber = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^MPL-[A-Z0-9]{8}$/, 'Invalid order number');

const createSchema = z
  .object({
    orderNumber,
    phone: pkMobileSchema,
    type: z.enum(['refund', 'exchange']),
    reason: z.enum(RETURN_REASONS),
    details: z.string().trim().max(500).optional(),
    items: z
      .array(z.object({ variantId: objectIdSchema, quantity: z.number().int().min(1).max(99) }).strict())
      .min(1)
      .max(20),
  })
  .strict();

// Shoppers: start a return and look one up, with order number + phone (no account needed).
export const returnsRouter = Router();
returnsRouter.post(
  '/',
  forbidStaff,
  orderLimiter,
  validate({ body: createSchema }),
  asyncHandler(async (req, res) => {
    assertCsrf(req);
    sendOk(res, { return: svc.toCustomerReturn(await svc.createReturn(req.body, req.auth?.userId)) }, 201);
  }),
);
returnsRouter.post(
  '/lookup',
  authLimiter,
  validate({ body: z.object({ orderNumber, phone: pkMobileSchema }).strict() }),
  asyncHandler(async (req, res) => {
    sendOk(res, { returns: (await svc.lookupReturns(req.body.orderNumber, req.body.phone)).map(svc.toCustomerReturn) });
  }),
);

export const accountReturnsRouter = Router();
accountReturnsRouter.use(requireCustomer);
accountReturnsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    sendOk(res, { returns: (await svc.listUserReturns(req.auth!.userId)).map(svc.toCustomerReturn) });
  }),
);

const updateSchema = z
  .object({
    status: z.enum(RETURN_STATUSES),
    note: z.string().trim().min(3).max(300).optional(),
    refundAmount: z.number().int().min(1).max(100_000_000).optional(),
    restock: z
      .array(z.object({ variantId: objectIdSchema, quantity: z.number().int().min(1).max(99) }).strict())
      .max(20)
      .optional(),
  })
  .strict();

export const returnsAdminRouter = Router();
returnsAdminRouter.get(
  '/',
  requirePermission('returns:read'),
  validate({
    query: z.object({
      page: z.coerce.number().int().min(1).max(10_000).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20),
      status: z.enum(RETURN_STATUSES).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { items, pagination } = await svc.listAdminReturns(req.query as never);
    sendOk(res, { items: items.map(svc.toAdminReturn), pagination });
  }),
);
returnsAdminRouter.get(
  '/:id',
  requirePermission('returns:read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    sendOk(res, { return: svc.toAdminReturn(await svc.getReturn(req.params.id as string)) });
  }),
);
returnsAdminRouter.patch(
  '/:id',
  requirePermission('returns:manage'),
  validate({ params: idParamSchema, body: updateSchema }),
  asyncHandler(async (req, res) => {
    const updated = await svc.updateReturn(req.params.id as string, req.body, req.auth!.userId);
    await recordAudit({
      ...auditContext(req),
      action: 'return.update',
      resourceType: 'return',
      resourceId: String(updated._id),
      metadata: { reference: updated.reference, status: req.body.status, refundAmount: req.body.refundAmount },
    });
    sendOk(res, { return: svc.toAdminReturn(updated) });
  }),
);
