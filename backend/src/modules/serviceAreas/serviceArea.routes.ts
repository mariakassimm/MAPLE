import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/asyncHandler';
import { PROVINCES } from '../../common/geo';
import { sendOk } from '../../common/response';
import { idParamSchema } from '../../common/validators';
import { requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { auditContext, recordAudit } from '../audit/audit.service';
import { createArea, listAllAreas, updateArea } from './serviceArea.service';

const dto = (a: {
  _id: unknown;
  city: string;
  province: string;
  isActive: boolean;
  codAvailable: boolean;
  couriers: { tcs: boolean; leopards: boolean };
  note?: string;
}) => ({
  id: String(a._id),
  city: a.city,
  province: a.province,
  isActive: a.isActive,
  codAvailable: a.codAvailable,
  couriers: a.couriers,
  note: a.note ?? null,
});

const fields = {
  city: z.string().trim().min(2).max(60),
  province: z.enum(PROVINCES),
  isActive: z.boolean(),
  codAvailable: z.boolean(),
  couriers: z.object({ tcs: z.boolean().optional(), leopards: z.boolean().optional() }).strict(),
  note: z.string().trim().max(200),
};
const createSchema = z
  .object({
    city: fields.city,
    province: fields.province,
    isActive: fields.isActive.optional(),
    codAvailable: fields.codAvailable.optional(),
    couriers: fields.couriers.optional(),
    note: fields.note.optional(),
  })
  .strict();
const updateSchema = z
  .object(fields)
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field');

export const serviceAreaAdminRouter = Router();
serviceAreaAdminRouter.use(requirePermission('settings:write'));

serviceAreaAdminRouter.get(
  '/',
  asyncHandler(async (_req, res) => sendOk(res, { areas: (await listAllAreas()).map(dto) })),
);

serviceAreaAdminRouter.post(
  '/',
  validate({ body: createSchema }),
  asyncHandler(async (req, res) => {
    const area = await createArea(req.body);
    await recordAudit({
      ...auditContext(req),
      action: 'service_area.create',
      resourceType: 'service_area',
      resourceId: String(area._id),
      metadata: { city: area.city },
    });
    sendOk(res, { area: dto(area.toObject()) }, 201);
  }),
);

serviceAreaAdminRouter.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateSchema }),
  asyncHandler(async (req, res) => {
    const area = await updateArea(req.params.id as string, req.body);
    await recordAudit({
      ...auditContext(req),
      action: 'service_area.update',
      resourceType: 'service_area',
      resourceId: String(area._id),
      metadata: { fields: Object.keys(req.body) },
    });
    sendOk(res, { area: dto(area.toObject()) });
  }),
);
