import express, { Router } from 'express';
import { asyncHandler } from '../../common/asyncHandler';
import { AppError } from '../../common/errors';
import { apiBase, validDemoToken } from './providers/demo';
import { Payment } from './payment.model';
import { applyOutcome } from './payment.service';
import { backToStore } from './redirect';

const REF = /^[A-Za-z0-9]{6,32}$/;
const form = express.urlencoded({ extended: false, limit: '4kb', parameterLimit: 10 });
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const LABEL = { jazzcash: 'JazzCash', easypaisa: 'Easypaisa' } as const;

const text = (v: unknown): string => (typeof v === 'string' ? v : '');
const pkr = (paisa: number) => `Rs ${(paisa / 100).toLocaleString('en-PK')}`;

async function load(body: Record<string, unknown>) {
  const ref = text(body.paymentRef);
  if (!REF.test(ref) || !validDemoToken(ref, text(body.token)))
    throw new AppError(400, 'BAD_REQUEST', 'This demo payment link is not valid.');
  const payment = await Payment.findOne({ paymentRef: ref }).lean();
  if (!payment) throw new AppError(404, 'NOT_FOUND', 'Payment not found.');
  return payment;
}

const page = (
  inner: string,
) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Demo payment | MAPLE</title>
<style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#EAE4D9;font-family:Inter,system-ui,sans-serif;color:#282722;padding:20px}
main{width:100%;max-width:420px;background:#F8F7F3;border:1px solid #D8D0C5;padding:32px}.tag{display:inline-block;background:#282722;color:#EAE4D9;font-size:11px;letter-spacing:.16em;text-transform:uppercase;padding:6px 10px}
h1{font-family:'Cormorant Garamond',Georgia,serif;font-weight:500;font-size:34px;margin:20px 0 4px}p{font-size:14px;line-height:1.6;color:#77736B;margin:0 0 16px}.amt{font-size:30px;color:#282722;margin:16px 0}
.note{border:1px dashed #77634D;padding:12px;font-size:13px;color:#77634D;margin:20px 0}button{width:100%;min-height:48px;border:1px solid #282722;font:inherit;font-size:14px;letter-spacing:.08em;text-transform:uppercase;cursor:pointer;margin-top:10px}
.go{background:#282722;color:#EAE4D9}.no{background:transparent;color:#282722}</style></head><body><main>${inner}</main></body></html>`;

export const demoPaymentsRouter = Router();

demoPaymentsRouter.post(
  '/checkout',
  form,
  asyncHandler(async (req, res) => {
    const p = await load(req.body as Record<string, unknown>);
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'",
    );
    res.setHeader('Cache-Control', 'no-store');
    const hidden = `<input type="hidden" name="paymentRef" value="${esc(p.paymentRef)}"><input type="hidden" name="token" value="${esc(text((req.body as Record<string, unknown>).token))}">`;
    res.type('html').send(
      page(`<span class="tag">Demo \u00b7 sandbox</span><h1>${esc(LABEL[p.provider as keyof typeof LABEL] ?? 'Payment')}</h1>
<p>Order ${esc(p.orderNumber)}</p><div class="amt">${esc(pkr(p.amount))}</div>
<div class="note">This is a simulated payment page for a portfolio project. No real money moves and no account is needed.</div>
<form method="post" action="${esc(`${apiBase()}/api/v1/payments/demo/complete`)}">${hidden}<button class="go" name="decision" value="approve">Approve payment</button><button class="no" name="decision" value="decline">Decline</button></form>`),
    );
  }),
);

demoPaymentsRouter.post(
  '/complete',
  form,
  asyncHandler(async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const p = await load(body);
    const approved = text(body.decision) === 'approve';
    await applyOutcome(
      p.paymentRef,
      approved
        ? {
            kind: 'paid',
            amount: p.amount,
            providerRef: `DEMO-${p.paymentRef}`,
            responseCode: '000',
            message: 'Demo payment approved',
          }
        : { kind: 'failed', responseCode: 'DEMO-DECLINED', message: 'Demo payment declined' },
      'return',
      { demo: '1', decision: approved ? 'approve' : 'decline' },
    );
    await backToStore(res, p.paymentRef);
  }),
);
