# Architecture

```
Browser (React SPA on Vercel)  --/api/v1-->  Express API (Render)  -->  MongoDB Atlas
                                                |--> JazzCash / Easypaisa (hosted payment + server callbacks)
                                                |--> TCS / Leopards (booking, tracking)
                                                |--> Resend (email)   |--> Cloudinary (signed uploads)   |--> Sentry
```

**Same-domain deployment**: `www.yourdomain.pk` (Vercel) and `api.yourdomain.pk` (Render) share a parent domain so the HTTP-only session cookie (`COOKIE_DOMAIN=.yourdomain.pk`, SameSite=lax) works without third-party-cookie issues.

## Backend (`backend/src`)
Modules per domain (`auth, users, catalogue, inventory, cart, orders, payments, shipping, returns, reviews, newsletter, content, dashboard, media, audit, admin`), each with model / schemas (Zod) / service / controller / routes. Cross-cutting: `common` (errors, permissions, crypto, money), `middleware` (auth, CSRF, rate limits, error envelope), `config`.

Key design rules
- **Server-authoritative money.** Prices, shipping, discounts and totals are computed on the server in integer paisa. The client sends `expectedTotal` only to detect price changes (`PRICE_CHANGED`).
- **Payment truth comes only from authenticated provider data** (signature-verified callbacks / server-side inquiry). The result page reads real order status from the API.
- **Idempotent order placement** via the `Idempotency-Key` header; payment state machine is idempotent against repeated callbacks.
- **Stock**: atomic reserve / release / commit; append-only movement history; unpaid online orders release stock after the payment window.
- **Sessions**: opaque tokens, only SHA-256 stored; role and status read on every request, so suspension/role change is immediate.
- **Audit log** is append-only; secrets are scrubbed; viewable at `/admin/audit` with `audit:read`.

## Frontend (`frontend/src`)
React + Vite + TypeScript, React Router (lazy routes), TanStack Query for server state, Zustand for cart/UI, React Hook Form + Zod, Tailwind with the MAPLE palette. Guest cart stores only `variantId + quantity` and is re-priced by the server; signed-in carts sync (`GET/PUT /cart`, merge = max quantity per variant). The admin app lives under `/admin`, with navigation filtered by a client copy of the permission matrix (the server is what enforces it).
