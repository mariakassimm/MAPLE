# MAPLE — Backend (complete: Phases 1-6)

Premium Pakistan-only e-commerce platform (MERN + TypeScript). This archive contains the **complete backend (Phases 1 to 6)**:
the backend skeleton, secure authentication, role-based access control, audit logging, and the product catalogue with concurrency-safe inventory (see `docs/CATALOGUE.md`), and server-side cart pricing, coupons, COD checkout, order placement and order status management (see `docs/ORDERS.md`).
JazzCash and Easypaisa payment adapters (see `docs/PROVIDER_SETUP.md`; **not yet verified against real sandboxes**) are included. TCS, Leopards and manual shipping with COD reconciliation are in `docs/SHIPPING.md` (couriers **not yet verified against real sandboxes**). The storefront, admin UI, emails and remaining admin modules arrive in later phases.

## What is in Phase 1

| Area | Details |
|---|---|
| Config | Zod-validated environment; the server refuses to start on bad or missing config (values are never printed) |
| Auth | Register, login, logout, `me`, forgot/reset password. Opaque server-side sessions in MongoDB (only the SHA-256 of the token is stored), HTTP-only cookie, revocable |
| CSRF | Per-session HMAC token returned by login/register/me, sent as `X-CSRF-Token`; enforced on every state-changing request made with a valid session cookie |
| Account safety | bcrypt (cost 12 in production), 5 failed logins = 15 minute lock, generic login errors, timing equalisation for unknown emails, reset tokens hashed + single-use + 60 min, all sessions revoked on reset |
| RBAC | `customer`, `super_admin`, `product_manager`, `order_manager`, `support_staff` with a permission matrix enforced in the API (`src/common/permissions.ts`) |
| Staff admin API | List/create staff, change role/status. Self-edits and super-admin edits blocked; sessions revoked on role change or suspension |
| Audit log | Append-only `AuditLog` collection; secrets are stripped from metadata |
| Hardening | Helmet, CORS allowlist, 100 kb body limit, rate limiting, strict Zod schemas (unknown fields rejected), consistent error envelope with request id, health/readiness endpoints, graceful shutdown |
| Pakistan | Mobile validation/normalisation to `+923XXXXXXXXX`; money stored as integer paisa |
| Catalogue (Phase 2) | Categories, products with variants, filters/sort/search/pagination, facets, publish rules, SKU and slug uniqueness |
| Cart and checkout (Phase 3A) | Server-side pricing, coupons, shipping rules, serviceability table, idempotent COD order placement, reserve/commit/release stock policy, order state machine |
| Online payments (Phase 4) | JazzCash hosted checkout and Easypaisa (Easypay) adapters, signature/notification verification, idempotent payment state machine, retry, payment-window expiry, late-payment refund flagging, payment audit trail |
| Shipping (Phase 5) | TCS and Leopards adapters, manual fallback, one-live-shipment guard, uncertain-booking handling, tracking sync, order status follows courier, COD collection/remittance ledger and summary, customer self-cancel |
| Emails and account (Phase 6A) | Resend adapter and 12 branded templates (never block orders), email verification, profile, addresses, change password |
| Reviews, returns, newsletter (Phase 6A) | Verified-purchase moderated reviews with honest ratings, return/exchange flow with inspection-gated restock and capped refunds, consent-recorded newsletter |
| Content and dashboard (Phase 6B) | Editable homepage, site info and plain-text pages with honest defaults; live dashboard with separate COD/online money; customer list with support notes; signed Cloudinary uploads; Sentry; sitemap |
| Inventory (Phase 2) | Atomic reserve/release/commit, manual adjustments with reasons, append-only movement history, low-stock report |

## Quick start (Windows / macOS / Linux)

Prerequisites: Node.js 20+ and a MongoDB database (free MongoDB Atlas M0 cluster, or a local `mongod`).

```bash
cd backend
npm install
cp .env.example .env        # Windows: copy .env.example .env
# edit .env: set MONGODB_URI and CSRF_SECRET
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"   # use the output as CSRF_SECRET
npm run typecheck
npm test                    # first run downloads a MongoDB binary (~100 MB)
npm run create-super-admin  # interactive; password is never echoed or stored in shell history
npm run seed-service-areas  # DEV ONLY placeholder cities so checkout works; replace with real courier coverage
npm run dev                 # http://localhost:4000/api/v1/health
```

Production: `npm run build && npm start`.

## API (all under `/api/v1`)

Success: `{ "success": true, "data": ... }`. Error: `{ "success": false, "error": { "code", "message", "details?", "requestId" } }`.

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/health` | public | liveness |
| GET | `/health/ready` | public | 503 if MongoDB is not connected |
| POST | `/auth/register` | public | `{name, email, phone?, password}`; returns user + `csrfToken` |
| POST | `/auth/login` | public | `{email, password}`; returns user + `csrfToken` |
| POST | `/auth/logout` | cookie + CSRF | idempotent |
| GET | `/auth/me` | signed in | returns user + `csrfToken` |
| POST | `/auth/forgot-password` | public | always 200 |
| POST | `/auth/reset-password` | public | `{token, password}` |
| GET | `/admin/staff` | `staff:manage` | |
| POST | `/admin/staff` | `staff:manage` + CSRF | `{name, email, phone?, password, role}`; role cannot be `super_admin` |
| PATCH | `/admin/staff/:id` | `staff:manage` + CSRF | `{role?, status?}` |

Frontend contract: call `fetch(..., { credentials: "include" })`; keep the `csrfToken` from login/`me` in memory and send it as `X-CSRF-Token` on every POST/PATCH/DELETE.

Content, dashboard, customers, uploads and sitemap are in `docs/PHASE6B.md`. Emails, account, reviews, returns and newsletter are in `docs/PHASE6A.md`. Shipping, COD and cancellation are in `docs/SHIPPING.md`. Payment flows, callback URLs and the sandbox checklist are in `docs/PROVIDER_SETUP.md`. Catalogue and inventory endpoints are listed in `docs/CATALOGUE.md`; cart, checkout and order endpoints in `docs/ORDERS.md`.

## Deployment notes that affect Phase 1 code

- Serve the frontend and API from **subdomains of one domain** (e.g. `www.example.pk` and `api.example.pk`), set `COOKIE_DOMAIN=.example.pk`, keep `COOKIE_SAMESITE=lax`. Cross-site hosting (a `vercel.app` frontend with an `onrender.com` API) will not work reliably because browsers block third-party cookies.
- Set `TRUST_PROXY=1` on Render so rate limits see real client IPs.
- Rate-limit counters and the dev mailer are per-process; both are replaced before multi-instance deployment (shared store, Resend).

## Verification status — please read

The build environment had **no network access**, so `npm install` could not run. Therefore:

| Check | Status |
|---|---|
| TypeScript syntax parses (no TS1xxx errors) | Done |
| Phone regex and permission matrix logic executed | Done (pass) |
| Type-check against real library types | **Not run** — you must run `npm run typecheck` |
| Unit and integration tests (about 380 cases) | **Written, not executed** — you must run `npm test` |
| Server start against MongoDB | **Not run** |

Expect a few small type or test fixes on first run; paste any errors back and they will be fixed in the next turn.

## Known limitations / deferred

- Email verification and real emails (Resend) — Phase 8; password reset links are only logged in `development`.
- Customer profile/address endpoints — Phase 7.
- No account-level "sign out everywhere" or change-password endpoint yet.
- Audit writes are best-effort (a failed audit write is logged, not rolled back).
- Webhook routes will be mounted above `attachAuth` with raw-body parsing when payments are added.


## Phase 9 additions
Admin audit log (`/admin/audit`), signed-in cart sync, canonical URLs, Playwright E2E specs (`frontend/e2e`), `render.yaml`, `frontend/vercel.json`, CI. See `docs/FINAL_REPORT.md`, `docs/DEPLOYMENT.md`, `docs/TESTING.md`.
