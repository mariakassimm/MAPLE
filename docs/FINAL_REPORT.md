# MAPLE — final report

## What is built
- **Backend**: auth/sessions/CSRF/RBAC, catalogue + variants, atomic inventory, server-side pricing, coupons, idempotent COD and online checkout, JazzCash + Easypaisa adapters, TCS + Leopards + manual shipping, COD reconciliation, emails (Resend), reviews (verified purchase, moderated), returns, newsletter, editable content, dashboard, Cloudinary signed uploads, Sentry, audit log (+ viewer), cart sync.
- **Storefront**: home, shop/collections, product, bag, checkout, payment result, order tracking, returns, account (profile, orders, addresses, returns), auth flows, content pages, SEO (titles, canonical, sitemap), reduced-motion and mobile-first layout.
- **Admin**: dashboard, orders, shipments, payments, COD, products/variants/images, categories, inventory, returns, reviews, customers, coupons, content, newsletter, settings, service areas, staff, audit log — permission-filtered.
- **Ops**: `render.yaml`, `frontend/vercel.json`, GitHub Actions CI, docs set.

## Honest status: not verified
- Frontend tests and Playwright E2E were **written but never executed**; the frontend has only been type-checked with library-noise filtered out. Expect to fix a handful of compile/selector issues on first run.
- JazzCash, Easypaisa, TCS and Leopards were **never tested against real or sandbox servers**; Leopards is the lowest-confidence adapter.
- No load test, no penetration test, no accessibility audit with real assistive tech, no Lighthouse run.
- Not built: CSV export (SRS "MAY"), staff 2FA.

## Decisions / inputs needed from you
1. Shipping fee (placeholder Rs 300) and free-shipping threshold.
2. Return window (placeholder 7 days) and policy wording.
3. Add delivery cities at `/admin/service-areas` — **checkout rejects unlisted cities**.
4. Who reconciles COD remittances, and how often.
5. Credentials: JazzCash, Easypaisa, TCS, Leopards, Resend (verified domain), Cloudinary, Sentry.
6. Real logo, product photography, and the text of Shipping, Returns, Privacy and Terms pages (the app ships honest placeholders, no invented claims, reviews or ratings).
7. A paid Atlas tier with backups, and a restore drill (DATABASE.md).

## First steps on your machine
`cd backend && npm install && npm run typecheck && npm test`, same in `frontend/`, then send me any errors.
