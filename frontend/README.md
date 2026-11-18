# MAPLE Storefront (Phase 7)

React 18 + TypeScript + Vite + Tailwind. Talks to the backend at `/api/v1` (Vite proxies `/api` to `localhost:4000` in dev).

    npm install
    npm run typecheck
    npm test
    npm run dev

## Built in 7A
Home, shop and collections (URL-driven filters/sort/pagination), product page (variants, gallery, mobile sticky bar, reviews, related),
bag drawer and bag page (server-priced), sign-in, register, forgot/reset password, verify email, editable content pages (`/about`, `/contact`, `/pages/:slug`).

## Added in 7B
Checkout (guest or signed in; COD, JazzCash, Easypaisa), payment result page, order tracking, returns (guest + account), account area
(profile, password, orders, order detail with cancel and reviews, addresses, returns), newsletter unsubscribe.

How payment is kept honest: the browser never decides an order is paid. Checkout places the order (Idempotency-Key + `expectedTotal`),
then asks the server to start the payment and posts the signed form it returns. `/checkout/result` reads only the order number from the URL
and polls `POST /orders/track` for the real status. A failed or abandoned online payment shows a retry button.

## Admin (Phase 8) at /admin
Dashboard, orders (status, COD ledger, shipment booking/sync), shipments, payments, products + variants + image upload, categories, inventory,
returns, reviews, customers (+ notes), coupons, content (homepage, site, pages), newsletter, delivery areas, settings, staff.
The sidebar and buttons follow the role matrix in `src/admin/permissions.ts`; the API enforces permissions regardless.

## Status
Nothing here has been installed, type-checked against real libraries, built or run: the build sandbox has no network.
Run `npm run typecheck` and `npm test` first and report any errors.
Prices are never computed in the browser; the bag shows what `POST /cart/price` returns.
