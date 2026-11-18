# MAPLE — The Art of Everyday Luxury

Pakistan-only (PKR) single-brand e-commerce platform: a React storefront and admin, and a Node/Express/MongoDB API.

- `backend/` — Node/Express/TypeScript/MongoDB API
- `frontend/` — React/Vite/TypeScript storefront and admin
- `docs/` — ENVIRONMENT, ARCHITECTURE, API, DATABASE, SECURITY, DEPLOYMENT, TESTING, PROVIDER_SETUP, SHIPPING, ORDERS, CATALOGUE, FINAL_REPORT

## Highlights
- Shop, collections and new arrivals with URL-driven filtering, sorting and a mobile filter sheet.
- Guest and customer checkout (cash on delivery, JazzCash, Easypaisa), idempotent orders, price re-check, stock reservation.
- Order lifecycle with emails (placed, confirmed, dispatched, delivered), masked guest order tracking, returns and reviews.
- Admin dashboard with role-based staff access (super admin, product, order and support roles), audit log, COD ledger.
- Strict separation of customer and admin accounts, HTTP-only sessions and CSRF protection.

## Run locally
```bash
cd backend  && cp .env.example .env   # set MONGODB_URI and CSRF_SECRET; DEMO_MODE=true is already in the example
npm install && npm run seed-service-areas && npm run seed-demo && npm run seed-policies
npm run create-super-admin            # interactive; your admin login
npm run dev                           # API on :4000

cd frontend && npm install && npm run dev   # storefront on :5173 (/api is proxied)
```
Tests: `npm test` in each folder. Backend details: `backend/README.md`.

## Demo mode (no merchant accounts needed)
With `DEMO_MODE=true`, JazzCash, Easypaisa, TCS and Leopards work as labelled simulations: a sandbox payment page and
couriers whose tracking moves forward by itself. When a real client brings credentials, set them in the environment and
set `DEMO_MODE=false`; no code changes. See `docs/PROVIDER_SETUP.md`.

## Deploy
Atlas + Render + Vercel: `docs/DEPLOYMENT.md` (`render.yaml` included).
