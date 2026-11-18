import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/asyncHandler';
import { sendOk } from '../../common/response';
import { requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { auditContext, recordAudit } from '../audit/audit.service';
import { getSettings, updateSettings } from './settings.service';

const paisa = z.number().int().min(0).max(100_000_000);
const patchSchema = z
  .object({
    shipping: z
      .object({ flatRate: paisa.optional(), freeShippingThreshold: paisa.nullable().optional() })
      .strict()
      .optional(),
    cod: z.object({ enabled: z.boolean().optional(), maxOrderValue: paisa.nullable().optional() }).strict().optional(),
    maxQuantityPerLine: z.number().int().min(1).max(99).optional(),
    returns: z
      .object({ windowDays: z.number().int().min(0).max(90).optional() })
      .strict()
      .optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one setting');

export const settingsAdminRouter = Router();
settingsAdminRouter.use(requirePermission('settings:write'));

settingsAdminRouter.get(
  '/',
  asyncHandler(async (_req, res) => sendOk(res, { settings: await getSettings() })),
);

settingsAdminRouter.patch(
  '/',
  validate({ body: patchSchema }),
  asyncHandler(async (req, res) => {
    const settings = await updateSettings(req.body);
    await recordAudit({
      ...auditContext(req),
      action: 'settings.update',
      resourceType: 'settings',
      metadata: { changes: req.body },
    });
    sendOk(res, { settings });
  }),
);
