import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/asyncHandler';
import { sendOk } from '../../common/response';
import { requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { dayStart, getDashboard, resolveRange } from './dashboard.service';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const query = z
  .object({ from: date.optional(), to: date.optional() })
  .refine((q) => !q.from || !q.to || dayStart(q.from) <= dayStart(q.to), {
    message: 'from must not be after to',
    path: ['from'],
  })
  .refine((q) => !q.from || !q.to || (dayStart(q.to).getTime() - dayStart(q.from).getTime()) / 86_400_000 <= 366, {
    message: 'Choose a range of at most 366 days',
    path: ['to'],
  });

export const reportsAdminRouter = Router();

// Every figure comes from live database aggregates over the chosen dates; nothing is sampled, cached or filled in.
reportsAdminRouter.get(
  '/dashboard',
  requirePermission('reports:read'),
  validate({ query }),
  asyncHandler(async (req, res) => {
    const q = req.query as { from?: string; to?: string };
    sendOk(res, await getDashboard(resolveRange(q.from, q.to)));
  }),
);
