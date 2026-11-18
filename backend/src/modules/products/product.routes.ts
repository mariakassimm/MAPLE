import { Router } from 'express';
import { idParamSchema } from '../../common/validators';
import { requirePermission } from '../../middleware/auth';
import { publicCache } from '../../middleware/publicCache';
import { validate } from '../../middleware/validate';
import * as ctrl from './product.controller';
import {
  adminProductListQuerySchema,
  facetsQuerySchema,
  productCreateSchema,
  productListQuerySchema,
  productUpdateSchema,
  slugParamSchema,
  variantCreateSchema,
  variantParamsSchema,
  variantUpdateSchema,
} from './product.schemas';

export const productPublicRouter = Router();
productPublicRouter.get('/', publicCache(30), validate({ query: productListQuerySchema }), ctrl.list);
// Declared before '/:slug' so "facets" is never mistaken for a product slug.
productPublicRouter.get('/facets', publicCache(60), validate({ query: facetsQuerySchema }), ctrl.facets);
productPublicRouter.get('/:slug', publicCache(30), validate({ params: slugParamSchema }), ctrl.detail);

export const productAdminRouter = Router();
const read = requirePermission('catalog:read');
const write = requirePermission('products:write');
const id = validate({ params: idParamSchema });

productAdminRouter.get('/', read, validate({ query: adminProductListQuerySchema }), ctrl.adminList);
productAdminRouter.post('/', write, validate({ body: productCreateSchema }), ctrl.adminCreate);
productAdminRouter.get('/:id', read, id, ctrl.adminGet);
productAdminRouter.patch(
  '/:id',
  write,
  validate({ params: idParamSchema, body: productUpdateSchema }),
  ctrl.adminUpdate,
);
productAdminRouter.post('/:id/publish', write, id, ctrl.publish);
productAdminRouter.post('/:id/unpublish', write, id, ctrl.unpublish);
productAdminRouter.post('/:id/archive', write, id, ctrl.archive);
productAdminRouter.post(
  '/:id/variants',
  write,
  validate({ params: idParamSchema, body: variantCreateSchema }),
  ctrl.addVariant,
);
productAdminRouter.patch(
  '/:id/variants/:variantId',
  write,
  validate({ params: variantParamsSchema, body: variantUpdateSchema }),
  ctrl.updateVariant,
);
