import express, { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../../common/errors';
import { asyncHandler } from '../../common/asyncHandler';
import { pageMeta } from '../../common/pagination';
import { sendOk } from '../../common/response';
import { escapeRegex } from '../../common/text';
import { pkMobileSchema } from '../../common/validators';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { requirePermission } from '../../middleware/auth';
import { orderLimiter } from '../../middleware/rateLimit';
import { validate } from '../../middleware/validate';
import { auditContext, recordAudit } from '../audit/audit.service';
import { demoPaymentsRouter } from './demo.routes';
import { backToStore } from './redirect';
import { sendAutoPost } from './html';
import { Payment, type IPayment } from './payment.model';
import { applyOutcome, initiatePayment, logEvent, reconcilePayment } from './payment.service';
import { getProviders } from './registry';
import { InvalidProviderResponse } from './types';

const REF = /^[A-Za-z0-9]{6,32}$/;

// Form posts come from a provider's servers via the customer's browser, so they are parsed here, on these routes only.
const form = express.urlencoded({ extended: false, limit: '20kb', parameterLimit: 100 });

const strings = (input: unknown): Record<string, string> => {
  const out: Record<string, string> = {};
  if (input && typeof input === 'object') {
    for (const [k, v] of Object.entries(input as Record<string, unknown>).slice(0, 60))
      if (typeof v === 'string') out[k] = v.slice(0, 500);
  }
  return out;
};

const notConfigured = () => new AppError(404, 'NOT_FOUND', 'Not found.');

export const paymentsRouter = Router();

// Simulated JazzCash / Easypaisa checkout. Exists only when DEMO_MODE is on; otherwise these paths are 404.
if (env.DEMO_MODE) paymentsRouter.use('/demo', demoPaymentsRouter);

paymentsRouter.post(
  '/:provider/initiate',
  orderLimiter,
  validate({
    params: z.object({ provider: z.enum(['jazzcash', 'easypaisa']) }).strict(),
    body: z
      .object({
        orderNumber: z
          .string()
          .trim()
          .toUpperCase()
          .regex(/^MPL-[A-Z0-9]{8}$/),
        phone: pkMobileSchema,
      })
      .strict(),
  }),
  asyncHandler(async (req, res) => {
    const result = await initiatePayment(
      req.body.orderNumber,
      req.body.phone,
      req.params.provider as 'jazzcash' | 'easypaisa',
    );
    sendOk(res, result);
  }),
);

// JazzCash posts the signed result here (this is pp_ReturnURL).
paymentsRouter.post(
  '/jazzcash/return',
  form,
  asyncHandler(async (req, res) => {
    const provider = getProviders().jazzcash;
    if (!provider) throw notConfigured();
    const data = strings(req.body);
    try {
      const { paymentRef, outcome } = provider.parseReturn(data);
      await applyOutcome(paymentRef, outcome, 'return', data);
      return await backToStore(res, paymentRef);
    } catch (err) {
      if (err instanceof InvalidProviderResponse) {
        await logEvent({
          paymentRef: REF.test(data.pp_TxnRefNo ?? '') ? (data.pp_TxnRefNo as string) : 'invalid',
          provider: 'jazzcash',
          source: 'return',
          authentic: false,
          result: 'rejected',
          detail: err.message,
          raw: data,
        });
        return await backToStore(res, null, true);
      }
      // Do not strand the shopper on an error page; the payment is reconciled from the provider's side.
      logger.error({ err }, 'failed to process JazzCash return');
      return await backToStore(res, data.pp_TxnRefNo ?? null);
    }
  }),
);

// Easypay sends the browser here twice: first with auth_token (we must post it on to Confirm.jsf), then with the result.
paymentsRouter.all(
  '/easypaisa/postback',
  form,
  asyncHandler(async (req, res) => {
    const provider = getProviders().easypaisa;
    if (!provider) throw notConfigured();
    const params = { ...strings(req.body), ...strings(req.query) };

    if (params.auth_token) {
      if (!/^[A-Za-z0-9._~+/=-]{8,300}$/.test(params.auth_token))
        throw new AppError(400, 'BAD_REQUEST', 'Invalid token.');
      return sendAutoPost(res, provider.confirmForm(params.auth_token), provider.origin);
    }
    const ref = params.orderRefNumber ?? params.orderRefNum ?? null;
    // The redirect itself proves nothing; if server-side inquiry is configured it is used to learn the real result.
    if (ref && REF.test(ref)) await reconcilePayment(ref, 'postback').catch(() => null);
    await backToStore(res, ref);
  }),
);

// Easypay's instant payment notification: unsigned, so the adapter verifies it by fetching the status from Easypay itself.
paymentsRouter.get(
  '/easypaisa/ipn',
  asyncHandler(async (req, res) => {
    const provider = getProviders().easypaisa;
    if (!provider) throw notConfigured();
    const url = typeof req.query.url === 'string' ? req.query.url : '';
    try {
      const { paymentRef, outcome } = await provider.fetchNotification(url);
      await applyOutcome(paymentRef, outcome, 'ipn', { url, status: outcome.responseCode ?? '' });
      res.type('text').send('OK');
    } catch (err) {
      if (!(err instanceof InvalidProviderResponse)) throw err;
      await logEvent({
        paymentRef: 'invalid',
        provider: 'easypaisa',
        source: 'ipn',
        authentic: false,
        result: 'rejected',
        detail: err.message,
        raw: { url },
      });
      res.status(400).type('text').send('invalid');
    }
  }),
);

// ---------------------------------------------------------------- admin
const dto = (p: IPayment & { _id: unknown }) => ({
  paymentRef: p.paymentRef,
  orderNumber: p.orderNumber,
  provider: p.provider,
  status: p.status,
  amount: p.amount,
  currency: p.currency,
  attempt: p.attempt,
  providerRef: p.providerRef ?? null,
  responseCode: p.responseCode ?? null,
  responseMessage: p.responseMessage ?? null,
  reviewReason: p.reviewReason ?? null,
  paidAt: p.paidAt ?? null,
  createdAt: p.createdAt,
});
export const toPaymentDto = dto;

export const paymentsAdminRouter = Router();

paymentsAdminRouter.get(
  '/',
  requirePermission('payments:read'),
  validate({
    query: z.object({
      page: z.coerce.number().int().min(1).max(10_000).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20),
      provider: z.enum(['jazzcash', 'easypaisa']).optional(),
      status: z.enum(['initiated', 'pending', 'paid', 'failed', 'cancelled', 'expired', 'review']).optional(),
      q: z.string().trim().min(1).max(40).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as { page: number; limit: number; provider?: string; status?: string; q?: string };
    const filter: Record<string, unknown> = {};
    if (q.provider) filter.provider = q.provider;
    if (q.status) filter.status = q.status;
    if (q.q)
      filter.$or = [
        { orderNumber: new RegExp(escapeRegex(q.q), 'i') },
        { paymentRef: new RegExp(escapeRegex(q.q), 'i') },
      ];
    const [items, total] = await Promise.all([
      Payment.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .lean(),
      Payment.countDocuments(filter),
    ]);
    sendOk(res, { items: items.map(dto), pagination: pageMeta(q.page, q.limit, total) });
  }),
);

// Asks the provider for the real status of one attempt (e.g. a callback was lost). Needs inquiry configured.
paymentsAdminRouter.post(
  '/:paymentRef/reconcile',
  requirePermission('payments:write'),
  validate({ params: z.object({ paymentRef: z.string().regex(REF) }).strict() }),
  asyncHandler(async (req, res) => {
    const ref = req.params.paymentRef as string;
    if (!(await Payment.exists({ paymentRef: ref }))) throw new AppError(404, 'NOT_FOUND', 'Payment not found.');
    const result = await reconcilePayment(ref, 'admin');
    await recordAudit({
      ...auditContext(req),
      action: 'payment.reconcile',
      resourceType: 'payment',
      resourceId: ref,
      metadata: { result: result?.status ?? 'no_answer' },
    });
    const fresh = await Payment.findOne({ paymentRef: ref }).lean();
    sendOk(res, { payment: dto(fresh as IPayment & { _id: unknown }), providerAnswered: result !== null });
  }),
);
