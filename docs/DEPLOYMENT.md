# Deployment: Atlas + Render + Vercel

1. **MongoDB Atlas**: create a cluster (paid tier with backups for production). Create a DB user, allow Render's outbound IPs (or 0.0.0.0/0 with a strong password), copy the SRV URI.
2. **Render**: New → Blueprint → select this repo (`render.yaml`). Fill every `sync: false` variable (see ENVIRONMENT.md). Health check: `/api/v1/health/ready`. Add custom domain `api.yourdomain.pk`.
3. **Create the first admin**: Render shell → `cd backend && npm run create-super-admin` (interactive).
4. **Service areas**: sign in → Admin → Service areas and add the cities you deliver to. **Checkout is blocked for cities that are not listed.** (`seed-service-areas` is dev-only placeholder data; do not run in production.)
5. **Vercel**: import the repo, root directory `frontend`. Set `VITE_API_URL=https://api.yourdomain.pk/api/v1` and `VITE_SITE_URL=https://www.yourdomain.pk` (the `/api` proxy exists only in local development). Add domain `www.yourdomain.pk`.
6. **Cookies**: backend `COOKIE_DOMAIN=.yourdomain.pk`, `CLIENT_ORIGINS=https://www.yourdomain.pk`.
7. **Portfolio deployment**: `render.yaml` sets `DEMO_MODE=true`, so payments and couriers are simulated and no merchant accounts are needed. Skip the rest of this step until a real client supplies credentials.
   **Providers (real store)**: register `API_PUBLIC_URL`-based callback URLs in the JazzCash/Easypaisa portals; run the sandbox checklist in PROVIDER_SETUP.md **before** switching `*_ENV` to production.
8. **Verify**: place a COD order, a sandbox online order, cancel, return; confirm emails arrive and Sentry receives a test error.
9. **Backups**: follow DATABASE.md and do a restore drill.

## Single-instance limits (read before scaling out)

MAPLE is designed to run as **one backend instance**. That is deliberate for a portfolio or small-store deployment, and it
removes the need for Redis or a job queue. These pieces keep their state in process memory:

| Piece | Where | If you run two or more instances |
| --- | --- | --- |
| Request rate limits (login, tracking, checkout…) | `middleware/rateLimit.ts` | Each instance counts separately, so the effective limit is multiplied by the instance count. |
| Order-tracking failure lockout (5 failures / 15 min) | `modules/orders/trackGuard.ts` | Same: an attacker gets 5 tries per instance, and a restart clears it. |
| Unpaid-order expiry sweeper and shipment-status sync | `server.ts` (`setInterval`) | Every instance runs them. They are idempotent, so this is safe but wasteful; duplicate courier API calls are the main cost. |
| Demo payment/courier simulators | `payments/registry.ts` | Stateless apart from signed tokens, so safe. |

What stays correct regardless of instance count, because it lives in MongoDB: stock reservation, order state transitions,
payment idempotency and the COD ledger.

When a real client needs horizontal scaling: move the two counters to a shared store (Redis or a Mongo TTL collection)
and run the two sweepers from a single scheduled job or leader-elected instance.

## Free portfolio deployment: everything on Vercel (+ Atlas free)

Two Vercel projects from the same GitHub repo: one for `backend` (the API runs as a serverless function, `backend/api/index.ts`) and one for `frontend`.

1. **Atlas**: free M0 cluster, a database user, network access `0.0.0.0/0`. Copy the SRV URI.
2. **Backend project** (Vercel, root directory `backend`). Environment variables:
   `NODE_ENV=production` (Vercel sets it), `MONGODB_URI`, `CSRF_SECRET` (long random string), `CRON_SECRET` (another long random string),
   `CLIENT_ORIGINS=https://<frontend-project>.vercel.app`, `API_PUBLIC_URL=https://<frontend-project>.vercel.app`,
   `TRUST_PROXY=1`, `COOKIE_SAMESITE=lax`, `DEMO_MODE=true`, `ALLOW_DEMO_IN_PRODUCTION=true`. Leave `COOKIE_DOMAIN` unset.
   (`API_PUBLIC_URL` is the frontend address because the browser reaches the API through the frontend's `/api` proxy, below.)
3. **Frontend project** (Vercel, root directory `frontend`): set `VITE_SITE_URL=https://<frontend-project>.vercel.app`; leave `VITE_API_URL` unset.
   Edit `frontend/vercel.json` and replace `YOUR-BACKEND-PROJECT` with the backend project's address. The frontend then forwards `/api/*` to the backend, so the browser
   sees one origin and the login cookies work. Redeploy the frontend after editing.
4. **Seed the database once, from your own computer** (it needs `backend/.env` pointing at the Atlas URI):
   `npm run create-super-admin`, `npm run seed-service-areas`, `npm run seed-demo`.
5. **Background jobs.** Serverless has no timers. Expired unpaid orders are swept at most once a minute while the API is being used, and a Vercel Cron call
   (`/api/v1/internal/cron`, daily on the free plan, protected by `CRON_SECRET`) also runs the courier-tracking sync. For a real store, move to an always-on host.
6. Cold starts: the first request after a quiet period is slower (a second or two). Rate limits and the tracking lockout are per instance, so they are looser than on a single server.

If you ever move the API to Render or a VPS instead, use `render.yaml` and the steps above this section.
