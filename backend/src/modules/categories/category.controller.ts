import { asyncHandler } from '../../common/asyncHandler';
import { sendOk } from '../../common/response';
import { auditContext, recordAudit } from '../audit/audit.service';
import { toCategoryDto } from './category.model';
import * as service from './category.service';

export const listPublic = asyncHandler(async (_req, res) => {
  sendOk(res, { categories: await service.listCategoriesPublic() });
});

export const listAdmin = asyncHandler(async (_req, res) => {
  sendOk(res, { categories: await service.listCategoriesAdmin() });
});

export const create = asyncHandler(async (req, res) => {
  const category = await service.createCategory(req.body);
  await recordAudit({
    ...auditContext(req),
    action: 'category.create',
    resourceType: 'category',
    resourceId: String(category._id),
    metadata: { name: category.name },
  });
  sendOk(res, { category: toCategoryDto(category.toObject()) }, 201);
});

export const update = asyncHandler(async (req, res) => {
  const category = await service.updateCategory(req.params.id as string, req.body);
  await recordAudit({
    ...auditContext(req),
    action: 'category.update',
    resourceType: 'category',
    resourceId: String(category._id),
    metadata: { fields: Object.keys(req.body) },
  });
  sendOk(res, { category: toCategoryDto(category.toObject()) });
});
