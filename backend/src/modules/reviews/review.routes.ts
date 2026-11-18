import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/asyncHandler';
import { sendOk } from '../../common/response';
import { idParamSchema, slugSchema } from '../../common/validators';
import { requireCustomer, requirePermission } from '../../middleware/auth';
import { publicCache } from '../../middleware/publicCache';
import { validate } from '../../middleware/validate';
import { auditContext, recordAudit } from '../audit/audit.service';
import { REVIEW_STATUSES } from './review.model';
import * as svc from './review.service';

const paging = {
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
};

// GET /products/:slug/reviews (public, approved only)
export const reviewsPublicRouter = Router();
reviewsPublicRouter.get(
  '/:slug/reviews',
  publicCache(30),
  validate({ params: z.object({ slug: slugSchema }).strict(), query: z.object(paging) }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as { page: number; limit: number };
    sendOk(res, await svc.listPublicReviews(req.params.slug as string, q.page, q.limit));
  }),
);

// POST /account/reviews (signed-in customers with a delivered order for the product)
export const reviewsAccountRouter = Router();
reviewsAccountRouter.use(requireCustomer);
reviewsAccountRouter.post(
  '/',
  validate({
    body: z
      .object({
        productSlug: slugSchema,
        rating: z.number().int().min(1).max(5),
        title: z.string().trim().max(100).optional(),
        body: z.string().trim().min(10, 'Please write at least a sentence').max(2000),
      })
      .strict(),
  }),
  asyncHandler(async (req, res) => {
    const review = await svc.createReview(req.auth!.userId, req.body);
    sendOk(
      res,
      {
        review: {
          id: String(review._id),
          status: review.status,
          message: 'Thank you. Your review will appear once it has been approved.',
        },
      },
      201,
    );
  }),
);

export const reviewsAdminRouter = Router();
reviewsAdminRouter.use(requirePermission('reviews:moderate'));
reviewsAdminRouter.get(
  '/',
  validate({
    query: z.object({
      ...paging,
      limit: z.coerce.number().int().min(1).max(100).default(20),
      status: z.enum(REVIEW_STATUSES).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    sendOk(res, await svc.listAdminReviews(req.query as never));
  }),
);
reviewsAdminRouter.patch(
  '/:id',
  validate({
    params: idParamSchema,
    body: z
      .object({ status: z.enum(REVIEW_STATUSES).optional(), featured: z.boolean().optional() })
      .strict()
      .refine((v) => v.status !== undefined || v.featured !== undefined, 'Provide a status or featured'),
  }),
  asyncHandler(async (req, res) => {
    const review = await svc.moderateReview(req.params.id as string, req.body, req.auth!.userId);
    await recordAudit({
      ...auditContext(req),
      action: 'review.moderate',
      resourceType: 'review',
      resourceId: String(review._id),
      metadata: req.body,
    });
    sendOk(res, { review: { id: String(review._id), status: review.status, featured: review.featured } });
  }),
);
