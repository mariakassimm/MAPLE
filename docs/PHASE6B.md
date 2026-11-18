# Content, dashboard, customers, uploads, monitoring, sitemap (Phase 6B)

This completes the backend feature set.

## Homepage and site content (staff with `content:write`: super admin, product manager)
- **Public:** `GET /content/site` (announcement text or `null` when switched off, contact, social links, footer statement), `GET /content/home` (everything the homepage needs in one call), `GET /content/pages`, `GET /content/pages/:slug`. Cached 60 s.
- **Admin:** `GET /admin/content/:key`, `PATCH /admin/content/:key` (`key` = `site` or `home`; send whole sections, which replace the stored section), `GET/POST /admin/pages`, `PATCH /admin/pages/:id`.
- **Defaults:** a new store shows the brand copy from the brief (hero "THE MAPLE COLLECTION / Elegance, Without Effort.", brand story "Beauty in Every Detail.", announcement "DISCOVER THE ART OF EVERYDAY LUXURY"). **Images default to `null`**, so the storefront must show its own placeholder art until real photography is uploaded; nothing here pretends to be a product or a customer.
- **Homepage data is real or empty:** `collections` come from the admin's list, otherwise from the first active categories; `newArrivals` are the latest published products; `bestsellers` are only products staff flagged (empty otherwise); `testimonials` are only **approved and featured** customer reviews (empty otherwise, or switch off with `testimonialsEnabled: false`). The storefront should hide an empty section rather than invent one.
- **Safety:** internal links must be site paths (`/shop`), never full URLs or `javascript:`; images and videos must be `https`. Pages are **plain text** (blank line = paragraph): no HTML is stored or meant to be rendered, so a page can never carry a script. **Render page bodies as text.**
- **Not written for you:** shipping, returns, privacy and terms pages are for your business (and lawyer) to write. Create them in the admin; they appear in `GET /content/pages` for the footer.

## Dashboard (`GET /admin/dashboard?from=YYYY-MM-DD&to=YYYY-MM-DD`, `reports:read`: super admin, product manager, order manager)
Default range: last 30 days in Pakistan time (dates are whole Pakistan days; maximum 366). Every figure is a live database aggregate; nothing is sampled or filled in.
- `orders`: placed, by status, pending, delivered, cancelled.
- `sales` (cancelled orders excluded): `grossOrderValue`, `ordersCounted`, `averageOrderValue`, `refunded`, and **separate** `onlinePaid`, `cod.deliveredValue`, `cod.collected`, `cod.remittedToUs`, `cod.courierCharges`, `cod.awaitingRemittance`. These are never added together (SRS section 11).
- `paymentMethods`, `topProducts` (top 5 by units, with revenue), `series` (one entry per day, zeros included), `lowStock` (count and 5 items), `recentOrders` (latest 10), `customers`, and `attention` (open returns, pending reviews, shipments needing review).

## Customers and support notes (`customers:read`; notes need `customers:notes`)
`GET /admin/customers?q=` (name, email or phone; with order count, spend and last order), `GET /admin/customers/:id` (profile, stats, recent orders, notes), `POST /admin/customers/:id/notes`. Notes are append-only with the author recorded. Guests who never registered are not customers here; their orders are under Orders.

## Image uploads (Cloudinary)
`POST /admin/media/signature {folder: products|categories|content}` returns what the browser needs to upload **directly to Cloudinary**: `uploadUrl`, `cloudName`, `apiKey`, `params` (folder, allowed formats, timestamp) and `signature`. Send the file plus exactly those `params` and `api_key` to `uploadUrl`; the response's `secure_url` (and `public_id`) go into the product, category or content image fields. The secret never leaves the server. The signing method is verified against Cloudinary's own documented example. Without the three `CLOUDINARY_*` variables the endpoint answers 503.
Images may be any `https` URL; once Cloudinary is live you can tighten that to your cloud's host.

## Monitoring (Sentry)
Set `SENTRY_DSN` (and optionally `SENTRY_RELEASE`). Unexpected server errors (HTTP 500) and unhandled promise rejections are reported with the request id; cookies, headers, query strings and request bodies are stripped before anything leaves the server. With no DSN nothing is loaded or sent. Payment, courier and email failures are also written to the structured logs; connect log alerts on your host (Render) for those.

## Sitemap
`GET /seo/sitemap.xml` lists the home page, shop, active categories, published products and published pages, with last-modified dates (frontend routes: `/`, `/shop`, `/collections/:slug`, `/products/:slug`, `/pages/:slug`). Serve it from the storefront's own domain (proxy `/sitemap.xml` to it). `robots.txt` belongs to the storefront.

## Backend status
All backend modules in the brief now exist. What remains for the backend is verification, not features: run the test suite and the provider sandbox checklists (`docs/PROVIDER_SETUP.md`, `docs/SHIPPING.md`), then the final audit and deployment documents in the last phase.
