import { createHmac } from 'crypto';
import { Router } from 'express';
import { Schema, model } from 'mongoose';
import { z } from 'zod';
import { safeEqual } from '../../common/crypto';
import { asyncHandler } from '../../common/asyncHandler';
import { AppError } from '../../common/errors';
import { pageMeta } from '../../common/pagination';
import { sendOk } from '../../common/response';
import { emailSchema } from '../../common/validators';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { requirePermission } from '../../middleware/auth';
import { authLimiter } from '../../middleware/rateLimit';
import { validate } from '../../middleware/validate';
import { clientUrl } from '../notifications/links';
import { deliver, fire } from '../notifications/notify';
import * as templates from '../notifications/templates';

interface ISubscriber {
  email: string;
  /** pending = asked to subscribe but has not yet clicked the link we emailed; only "subscribed" people receive newsletters. */
  status: 'pending' | 'subscribed' | 'unsubscribed';
  /** When they confirmed. Set only on confirmation, so it is real proof the owner of the address agreed. */
  consentAt?: Date;
  requestedAt?: Date;
  lastEmailAt?: Date;
  unsubscribedAt?: Date;
  source: string;
}
const schema = new Schema<ISubscriber>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    status: { type: String, enum: ['pending', 'subscribed', 'unsubscribed'], default: 'pending' },
    consentAt: { type: Date },
    requestedAt: { type: Date },
    lastEmailAt: { type: Date },
    unsubscribedAt: { type: Date },
    source: { type: String, default: 'website' },
  },
  { timestamps: true },
);
export const Subscriber = model<ISubscriber>('Subscriber', schema);

// A signed link instead of a stored token: stateless, and impossible to guess for an address you do not control.
export const unsubscribeToken = (email: string): string =>
  createHmac('sha256', env.CSRF_SECRET).update(`newsletter:${email.toLowerCase()}`).digest('base64url');
export const confirmToken = (email: string): string =>
  createHmac('sha256', env.CSRF_SECRET).update(`newsletter-confirm:${email.toLowerCase()}`).digest('base64url');
export const confirmUrl = (email: string): string =>
  clientUrl('/newsletter/confirm', { email, token: confirmToken(email) });
export const unsubscribeUrl = (email: string): string =>
  clientUrl('/newsletter/unsubscribe', { email, token: unsubscribeToken(email) });

export const newsletterRouter = Router();

// Double opt-in: signing up only records a PENDING request and emails a confirmation link to the address typed in. Nobody is
// subscribed (and no newsletter is sent) until the owner of that mailbox clicks it, so no one can sign up somebody else.
// Works for guests and signed-in customers alike: the address typed in the box is the only thing that matters.
const RESEND_COOLDOWN_MS = 60_000;

newsletterRouter.post(
  '/subscribe',
  authLimiter,
  validate({ body: z.object({ email: emailSchema }).strict() }),
  asyncHandler(async (req, res) => {
    const email = req.body.email as string;
    const existing = await Subscriber.findOne({ email });
    // Already on the list: say the same thing and send nothing, so the form cannot be used to discover who is subscribed.
    if (existing?.status === 'subscribed') return sendOk(res, { confirmationSent: true });
    const justSent =
      existing?.status === 'pending' &&
      existing.lastEmailAt &&
      Date.now() - existing.lastEmailAt.getTime() < RESEND_COOLDOWN_MS;
    if (!justSent) {
      await Subscriber.updateOne(
        { email },
        {
          $set: { status: 'pending', source: 'website', lastEmailAt: new Date() },
          $unset: { unsubscribedAt: 1 },
          $setOnInsert: { requestedAt: new Date() },
        },
        { upsert: true },
      );
      try {
        await deliver({ to: email, ...templates.newsletterConfirm(confirmUrl(email)), template: 'newsletter_confirm' });
      } catch (err) {
        // Be honest with the visitor instead of pretending an email is on its way.
        await Subscriber.updateOne({ email }, { $unset: { lastEmailAt: 1 } });
        logger.error({ err }, 'newsletter confirmation email failed');
        throw new AppError(
          503,
          'SERVICE_UNAVAILABLE',
          'We could not send the confirmation email just now. Please try again in a few minutes.',
        );
      }
    }
    sendOk(res, { confirmationSent: true });
  }),
);

newsletterRouter.post(
  '/confirm',
  authLimiter,
  validate({ body: z.object({ email: emailSchema, token: z.string().min(20).max(100) }).strict() }),
  asyncHandler(async (req, res) => {
    const email = req.body.email as string;
    if (!safeEqual(confirmToken(email), req.body.token))
      throw new AppError(400, 'BAD_REQUEST', 'This confirmation link is not valid.');
    const sub = await Subscriber.findOne({ email }).select('status');
    if (!sub || sub.status === 'unsubscribed')
      throw new AppError(400, 'BAD_REQUEST', 'This confirmation link is no longer valid. Please subscribe again.');
    if (sub.status === 'pending') {
      // The status filter makes this safe to click twice: only the first click subscribes and sends the welcome.
      const r = await Subscriber.updateOne(
        { email, status: 'pending' },
        { $set: { status: 'subscribed', consentAt: new Date() } },
      );
      if (r.modifiedCount)
        fire(() =>
          deliver({ to: email, ...templates.newsletterWelcome(unsubscribeUrl(email)), template: 'newsletter_welcome' }),
        );
    }
    sendOk(res, { confirmed: true });
  }),
);

newsletterRouter.post(
  '/unsubscribe',
  authLimiter,
  validate({ body: z.object({ email: emailSchema, token: z.string().min(20).max(100) }).strict() }),
  asyncHandler(async (req, res) => {
    if (!safeEqual(unsubscribeToken(req.body.email), req.body.token))
      throw new AppError(400, 'BAD_REQUEST', 'This unsubscribe link is not valid.');
    await Subscriber.updateOne(
      { email: req.body.email, status: 'subscribed' },
      { $set: { status: 'unsubscribed', unsubscribedAt: new Date() } },
    );
    sendOk(res, { unsubscribed: true });
  }),
);

export const newsletterAdminRouter = Router();
newsletterAdminRouter.get(
  '/',
  requirePermission('content:write'),
  validate({
    query: z.object({
      page: z.coerce.number().int().min(1).max(10_000).default(1),
      limit: z.coerce.number().int().min(1).max(200).default(50),
      status: z.enum(['pending', 'subscribed', 'unsubscribed']).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as { page: number; limit: number; status?: string };
    const filter = q.status ? { status: q.status } : {};
    const [items, total, subscribed, pendingTotal] = await Promise.all([
      Subscriber.find(filter)
        .sort({ createdAt: -1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .lean(),
      Subscriber.countDocuments(filter),
      Subscriber.countDocuments({ status: 'subscribed' }),
      Subscriber.countDocuments({ status: 'pending' }),
    ]);
    sendOk(res, {
      items: items.map((s) => ({
        email: s.email,
        status: s.status,
        consentAt: s.consentAt ?? null,
        unsubscribedAt: s.unsubscribedAt ?? null,
      })),
      subscribedTotal: subscribed,
      pendingTotal,
      pagination: pageMeta(q.page, q.limit, total),
    });
  }),
);
