import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/asyncHandler';
import { pageMeta } from '../../common/pagination';
import { sendOk } from '../../common/response';
import { escapeRegex } from '../../common/text';
import { requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { AuditLog } from './auditLog.model';

const query = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  action: z.string().trim().min(1).max(60).optional(),
  resourceType: z.string().trim().min(1).max(40).optional(),
});

// Read-only: the log has no update or delete path anywhere in the API.
export const auditAdminRouter = Router();
auditAdminRouter.get(
  '/',
  requirePermission('audit:read'),
  validate({ query }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof query>;
    const filter: Record<string, unknown> = {};
    if (q.action) filter.action = { $regex: `^${escapeRegex(q.action)}`, $options: 'i' };
    if (q.resourceType) filter.resourceType = q.resourceType;
    const [items, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .lean(),
      AuditLog.countDocuments(filter),
    ]);
    sendOk(res, {
      items: items.map((a) => ({
        id: String(a._id),
        at: a.createdAt,
        action: a.action,
        resourceType: a.resourceType,
        resourceId: a.resourceId ?? null,
        actorId: a.actorId ? String(a.actorId) : null,
        actorRole: a.actorRole ?? null,
        requestId: a.requestId ?? null,
        metadata: a.metadata ?? null,
      })),
      pagination: pageMeta(q.page, q.limit, total),
    });
  }),
);
