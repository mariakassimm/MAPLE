# API reference

Base `/api/v1`. Success `{success:true,data}`; error `{success:false,error:{code,message,details?,requestId}}`. State-changing requests with a session cookie need `X-CSRF-Token` (returned by login/register/me). `POST /orders` also needs `Idempotency-Key` (16–64 chars `[A-Za-z0-9_-]`).

The authoritative, always-current list of endpoints for each area is in the module docs, written alongside the code:
- Auth, accounts: `backend/README.md` (API table)
- Catalogue and inventory: `CATALOGUE.md`
- Cart, coupons, checkout, orders: `ORDERS.md`
- Payments (JazzCash/Easypaisa): `PROVIDER_SETUP.md`
- Shipping, COD reconciliation: `SHIPPING.md`
- Reviews, returns, newsletter, content, dashboard, uploads: `PHASE6A.md`, `PHASE6B.md`
- Audit log (Phase 9): `GET /admin/audit?page&limit&action&resourceType` — `audit:read` (super admin only), read-only; there are no write routes.
- Cart sync (Phase 9): `GET /cart`, `PUT /cart` (signed in).

Rate limits: general 300 / 15 min, auth 20 / 15 min, order 30 / 15 min per IP.
