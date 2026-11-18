import { Router } from 'express';
import { requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as ctrl from './inventory.controller';
import { adjustmentSchema, inventoryQuerySchema, movementsQuerySchema } from './inventory.schemas';

export const inventoryAdminRouter = Router();

inventoryAdminRouter.get(
  '/',
  requirePermission('inventory:read'),
  validate({ query: inventoryQuerySchema }),
  ctrl.list,
);
inventoryAdminRouter.get(
  '/movements',
  requirePermission('inventory:read'),
  validate({ query: movementsQuerySchema }),
  ctrl.movements,
);
inventoryAdminRouter.post(
  '/adjustments',
  requirePermission('inventory:write'),
  validate({ body: adjustmentSchema }),
  ctrl.adjust,
);
