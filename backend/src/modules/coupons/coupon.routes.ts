import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/asyncHandler';
import { sendOk } from '../../common/response';
import { couponCodeSchema, idParamSchema } from '../../common/validators';
import { requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { auditContext, recordAudit } from '../audit/audit.service';
import { Coupon, type CouponLean } from './coupon.model';
import { createCoupon, updateCoupon } from './coupon.service';

const paisa = z.number().int().min(0).max(100_000_000);
const date = z.coerce.date();

const fields = {
  code: couponCodeSchema,
  description: z.string().trim().max(200),
  type: z.enum(['percent', 'fixed']),
  value: z.number().int().min(1).max(100_000_000),
  minOrderValue: paisa,
  maxDiscount: paisa.nullable(),
  startsAt: date.nullable(),
  expiresAt: date.nullable(),
  usageLimit: z.number().int().min(1).max(10_000_000).nullable(),
  isActive: z.boolean(),
};

const rules = [
  {
    check: (v: { type?: string; value?: number }) => !(v.type === 'percent' && v.value !== undefined && v.value > 100),
    message: 'Percentage cannot exceed 100',
    path: ['value'],
  },
  {
    check: (v: { startsAt?: Date | null; expiresAt?: Date | null }) =>
      !(v.startsAt && v.expiresAt && v.expiresAt <= v.startsAt),
    message: 'Expiry must be after the start date',
    path: ['expiresAt'],
  },
];

const createSchema = z
  .object({
    ...fields,
    description: fields.description.optional(),
    minOrderValue: fields.minOrderValue.optional(),
    maxDiscount: fields.maxDiscount.optional(),
    startsAt: fields.startsAt.optional(),
    expiresAt: fields.expiresAt.optional(),
    usageLimit: fields.usageLimit.optional(),
    isActive: fields.isActive.optional(),
  })
  .strict()
  .superRefine((v, ctx) =>
    rules.forEach((r) => r.check(v) || ctx.addIssue({ code: z.ZodIssueCode.custom, message: r.message, path: r.path })),
  );

const updateSchema = z
  .object(fields)
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field')
  .superRefine((v, ctx) =>
    rules.forEach((r) => r.check(v) || ctx.addIssue({ code: z.ZodIssueCode.custom, message: r.message, path: r.path })),
  );

const dto = (c: CouponLean | (CouponLean & { toObject?: never })) => ({
  id: String(c._id),
  code: c.code,
  description: c.description ?? null,
  type: c.type,
  value: c.value,
  minOrderValue: c.minOrderValue,
  maxDiscount: c.maxDiscount,
  startsAt: c.startsAt,
  expiresAt: c.expiresAt,
  usageLimit: c.usageLimit,
  usedCount: c.usedCount,
  isActive: c.isActive,
});

export const couponAdminRouter = Router();
couponAdminRouter.use(requirePermission('coupons:write'));

couponAdminRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const coupons = await Coupon.find().sort({ createdAt: -1 }).lean<CouponLean[]>();
    sendOk(res, { coupons: coupons.map(dto) });
  }),
);

couponAdminRouter.post(
  '/',
  validate({ body: createSchema }),
  asyncHandler(async (req, res) => {
    const coupon = await createCoupon(req.body);
    await recordAudit({
      ...auditContext(req),
      action: 'coupon.create',
      resourceType: 'coupon',
      resourceId: String(coupon._id),
      metadata: { code: coupon.code },
    });
    sendOk(res, { coupon: dto(coupon.toObject() as CouponLean) }, 201);
  }),
);

couponAdminRouter.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateSchema }),
  asyncHandler(async (req, res) => {
    const coupon = await updateCoupon(req.params.id as string, req.body);
    await recordAudit({
      ...auditContext(req),
      action: 'coupon.update',
      resourceType: 'coupon',
      resourceId: String(coupon._id),
      metadata: { fields: Object.keys(req.body) },
    });
    sendOk(res, { coupon: dto(coupon.toObject() as CouponLean) });
  }),
);
