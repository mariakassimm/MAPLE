import { randomBytes } from 'crypto';
import type { Response } from 'express';
import type { RedirectForm } from './types';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/**
 * A page that immediately POSTs the customer on to a provider. The API's normal CSP forbids inline scripts and
 * cross-origin form posts, so this one response gets its own narrow policy: one nonce'd script, and form posts
 * allowed only to the provider's origin.
 */
export function sendAutoPost(res: Response, form: RedirectForm, formOrigin: string): void {
  const nonce = randomBytes(16).toString('base64');
  const inputs = Object.entries(form.fields)
    .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`)
    .join('');
  res.setHeader(
    'Content-Security-Policy',
    `default-src 'none'; script-src 'nonce-${nonce}'; form-action ${formOrigin}; base-uri 'none'`,
  );
  res.setHeader('Cache-Control', 'no-store');
  res
    .type('html')
    .send(
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>Redirecting to payment</title></head>` +
        `<body><form id="f" method="post" action="${esc(form.action)}">${inputs}<noscript><button type="submit">Continue to payment</button></noscript></form>` +
        `<script nonce="${nonce}">document.getElementById('f').submit()</script></body></html>`,
    );
}
