import { asyncHandler } from '../../common/asyncHandler';
import { sendOk } from '../../common/response';
import { auditContext, recordAudit } from '../audit/audit.service';
import * as catalog from './catalog.service';
import type { FacetsQuery, ProductListQuery } from './product.schemas';
import { toAdminListItem, toAdminProduct } from './product.serializer';
import * as products from './product.service';

// ---- public ----
export const list = asyncHandler(async (req, res) => {
  sendOk(res, await catalog.listProducts(req.query as unknown as ProductListQuery));
});

export const facets = asyncHandler(async (req, res) => {
  sendOk(res, await catalog.getFacets(req.query as unknown as FacetsQuery));
});

export const detail = asyncHandler(async (req, res) => {
  sendOk(res, await catalog.getProductBySlug(req.params.slug as string));
});

// ---- admin ----
export const adminList = asyncHandler(async (req, res) => {
  const { items, pagination } = await products.listAdminProducts(req.query as never);
  sendOk(res, { items: items.map(toAdminListItem), pagination });
});

export const adminGet = asyncHandler(async (req, res) => {
  sendOk(res, { product: toAdminProduct(await products.getAdminProduct(req.params.id as string)) });
});

export const adminCreate = asyncHandler(async (req, res) => {
  const product = await products.createProduct(req.body, req.auth!.userId);
  await recordAudit({
    ...auditContext(req),
    action: 'product.create',
    resourceType: 'product',
    resourceId: String(product._id),
    metadata: { name: product.name, slug: product.slug },
  });
  sendOk(res, { product: toAdminProduct(product) }, 201);
});

export const adminUpdate = asyncHandler(async (req, res) => {
  const product = await products.updateProduct(req.params.id as string, req.body);
  await recordAudit({
    ...auditContext(req),
    action: 'product.update',
    resourceType: 'product',
    resourceId: String(product._id),
    metadata: { fields: Object.keys(req.body) },
  });
  sendOk(res, { product: toAdminProduct(product) });
});

const statusHandler = (status: 'published' | 'draft' | 'archived', action: string) =>
  asyncHandler(async (req, res) => {
    const product = await products.setStatus(req.params.id as string, status);
    await recordAudit({ ...auditContext(req), action, resourceType: 'product', resourceId: String(product._id) });
    sendOk(res, { product: toAdminProduct(product) });
  });

export const publish = statusHandler('published', 'product.publish');
export const unpublish = statusHandler('draft', 'product.unpublish');
export const archive = statusHandler('archived', 'product.archive');

export const addVariant = asyncHandler(async (req, res) => {
  const product = await products.addVariant(req.params.id as string, req.body, req.auth!.userId);
  await recordAudit({
    ...auditContext(req),
    action: 'variant.create',
    resourceType: 'product',
    resourceId: String(product._id),
    metadata: { sku: req.body.sku },
  });
  sendOk(res, { product: toAdminProduct(product) }, 201);
});

export const updateVariant = asyncHandler(async (req, res) => {
  const product = await products.updateVariant(req.params.id as string, req.params.variantId as string, req.body);
  await recordAudit({
    ...auditContext(req),
    action: 'variant.update',
    resourceType: 'product',
    resourceId: String(product._id),
    metadata: { variantId: req.params.variantId, fields: Object.keys(req.body) },
  });
  sendOk(res, { product: toAdminProduct(product) });
});
