import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/asyncHandler';
import { AppError } from '../../common/errors';
import { sendOk } from '../../common/response';
import { idParamSchema, slugSchema } from '../../common/validators';
import { requirePermission } from '../../middleware/auth';
import { publicCache } from '../../middleware/publicCache';
import { validate } from '../../middleware/validate';
import { auditContext, recordAudit } from '../audit/audit.service';
import type { ContentKey } from './content.model';
import { homePatchSchema, pageCreateSchema, pageUpdateSchema, sitePatchSchema } from './content.schemas';
import * as svc from './content.service';

export const contentPublicRouter = Router();
contentPublicRouter.get(
  '/site',
  publicCache(60),
  asyncHandler(async (_req, res) => sendOk(res, { site: await svc.publicSite() })),
);
contentPublicRouter.get(
  '/home',
  publicCache(60),
  asyncHandler(async (_req, res) => sendOk(res, await svc.assembleHome())),
);
contentPublicRouter.get(
  '/pages',
  publicCache(60),
  asyncHandler(async (_req, res) => sendOk(res, { pages: await svc.listPublicPages() })),
);
contentPublicRouter.get(
  '/pages/:slug',
  publicCache(60),
  validate({ params: z.object({ slug: slugSchema }).strict() }),
  asyncHandler(async (req, res) => sendOk(res, { page: await svc.getPublicPage(req.params.slug as string) })),
);

const keyParam = z.object({ key: z.enum(['site', 'home']) }).strict();

export const contentAdminRouter = Router();
contentAdminRouter.use(requirePermission('content:write'));

contentAdminRouter.get(
  '/content/:key',
  validate({ params: keyParam }),
  asyncHandler(async (req, res) => {
    sendOk(res, { content: await svc.getContent(req.params.key as ContentKey) });
  }),
);

contentAdminRouter.patch(
  '/content/:key',
  validate({ params: keyParam }),
  asyncHandler(async (req, res) => {
    const key = req.params.key as ContentKey;
    const parsed = (key === 'site' ? sitePatchSchema : homePatchSchema).safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'Some fields are invalid.',
        parsed.error.issues.map((i) => ({ field: ['body', ...i.path].join('.'), message: i.message })),
      );
    }
    const content = await svc.updateContent(key, parsed.data as Record<string, unknown>, req.auth!.userId);
    await recordAudit({
      ...auditContext(req),
      action: 'content.update',
      resourceType: 'content',
      resourceId: key,
      metadata: { sections: Object.keys(parsed.data) },
    });
    sendOk(res, { content });
  }),
);

contentAdminRouter.get(
  '/pages',
  asyncHandler(async (_req, res) => sendOk(res, { pages: await svc.listAdminPages() })),
);
contentAdminRouter.post(
  '/pages',
  validate({ body: pageCreateSchema }),
  asyncHandler(async (req, res) => {
    const page = await svc.createPage(req.body);
    await recordAudit({
      ...auditContext(req),
      action: 'page.create',
      resourceType: 'page',
      resourceId: page.id,
      metadata: { slug: page.slug },
    });
    sendOk(res, { page }, 201);
  }),
);
contentAdminRouter.patch(
  '/pages/:id',
  validate({ params: idParamSchema, body: pageUpdateSchema }),
  asyncHandler(async (req, res) => {
    const page = await svc.updatePage(req.params.id as string, req.body);
    await recordAudit({
      ...auditContext(req),
      action: 'page.update',
      resourceType: 'page',
      resourceId: page.id,
      metadata: { fields: Object.keys(req.body) },
    });
    sendOk(res, { page });
  }),
);
