import { Router } from 'express';
import { idParamSchema } from '../../common/validators';
import { requirePermission } from '../../middleware/auth';
import { publicCache } from '../../middleware/publicCache';
import { validate } from '../../middleware/validate';
import * as ctrl from './category.controller';
import { categoryCreateSchema, categoryUpdateSchema } from './category.schemas';

export const categoryPublicRouter = Router();
categoryPublicRouter.get('/', publicCache(30), ctrl.listPublic);

export const categoryAdminRouter = Router();
categoryAdminRouter.get('/', requirePermission('catalog:read'), ctrl.listAdmin);
categoryAdminRouter.post(
  '/',
  requirePermission('categories:write'),
  validate({ body: categoryCreateSchema }),
  ctrl.create,
);
categoryAdminRouter.patch(
  '/:id',
  requirePermission('categories:write'),
  validate({ params: idParamSchema, body: categoryUpdateSchema }),
  ctrl.update,
);
