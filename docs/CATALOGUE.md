# Catalogue and inventory (Phase 2)

## Money
All amounts are **integers in paisa** (1 PKR = 100 paisa). Rs 12,500 is sent and returned as `1250000`. Floats are rejected.
Responses carry `currency: "PKR"`. The frontend formats for display.

## Data model
- **Category**: name, unique slug, description, image, `status` (`active` | `archived`), `displayOrder`.
- **Product**: name, unique slug, descriptions, category, images (https only), attributes (label/value, e.g. Material), flags `featured`, `bestseller`, `allowBackorder`, SEO fields, `status` (`draft` | `published` | `archived`). Always created as `draft`.
- **Variant** (embedded in the product): unique SKU, `options` (e.g. `color`, `size`; names are lower-cased), `price`, `salePrice` (only applies if lower), `stock`, `reserved`, `lowStockThreshold`, `isActive`.
- **InventoryMovement**: append-only ledger (`initial`, `adjustment`, `reserve`, `release`, `commit`, `return`) with SKU snapshot, deltas, balances after, reason, actor.

Variants are embedded so that a stock change is a single-document conditional update, which MongoDB applies atomically.

## Stock semantics
| Field | Meaning |
|---|---|
| `stock` (admin: `available`) | Units sellable right now |
| `reserved` | Units held for in-flight checkouts |
| on hand | `stock + reserved` |

- `reserveStock`: `stock -= q`, `reserved += q`, only if `stock >= q` (or the product allows backorders), the product is published and the variant is active.
- `releaseStock`: `stock += q`, `reserved -= q`, only if `reserved >= q` (payment failed, order cancelled, reservation expired).
- `commitStock`: `reserved -= q` when the order is confirmed.
- Manual adjustments: signed delta with a mandatory reason; may not drive `stock` below zero.
- Backorder products can be reserved beyond stock, so `stock` can go negative (it then counts backordered units).
- Multi-line reservations are all-or-nothing using compensating releases (works on a standalone MongoDB; no transactions required).
- These functions live in `src/modules/inventory/inventory.service.ts` and are called by checkout in Phase 3. Nothing in the public API reserves stock yet.

## Public endpoints (anonymous, cached 30-60 s)
| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/categories` | Active categories with `productCount` |
| GET | `/api/v1/products` | Query: `page`, `limit` (max 48), `sort` (`newest`, `price_asc`, `price_desc`, `name_asc`), `category` (slug), `minPrice`, `maxPrice`, `availability=in_stock`, `color`, `q`, `featured`, `bestseller` |
| GET | `/api/v1/products/facets` | Price range and the colours that exist, for the filter sidebar |
| GET | `/api/v1/products/:slug` | Detail with variants and up to 4 related products |

Only published products in active categories are visible. Public responses never include exact stock, reserved counts, status or admin fields; variants expose `inStock` and `lowStock` only.

## Admin endpoints (staff session + `X-CSRF-Token` on writes)
| Method | Path | Permission |
|---|---|---|
| GET | `/admin/categories` | `catalog:read` |
| POST | `/admin/categories` | `categories:write` |
| PATCH | `/admin/categories/:id` | `categories:write` (archive with `{status:"archived"}`) |
| GET | `/admin/products` | `catalog:read` (`status`, `categoryId`, `q`, paging) |
| GET | `/admin/products/:id` | `catalog:read` |
| POST | `/admin/products` | `products:write` (created as draft, with `variants[]` incl. `initialStock`) |
| PATCH | `/admin/products/:id` | `products:write` (status cannot be changed here) |
| POST | `/admin/products/:id/publish` | `products:write` (needs an image, an active variant and an active category) |
| POST | `/admin/products/:id/unpublish` | `products:write` |
| POST | `/admin/products/:id/archive` | `products:write` |
| POST | `/admin/products/:id/variants` | `products:write` |
| PATCH | `/admin/products/:id/variants/:variantId` | `products:write` (not stock; deactivate instead of deleting) |
| GET | `/admin/inventory` | `inventory:read` (`lowStock=true`, `q`, paging) |
| GET | `/admin/inventory/movements` | `inventory:read` (`productId`, `variantId`) |
| POST | `/admin/inventory/adjustments` | `inventory:write` `{productId, variantId, delta, reason}` |

## Not in this phase
- Image upload: products take https image URLs (Cloudinary URLs work). The signed Cloudinary upload endpoint arrives with the admin UI.
- Reviews, coupons, wishlist, return-to-stock flow.
- Search is a case-insensitive substring match over name, short description and SKU. That is fine for a boutique catalogue; move to Atlas Search if the catalogue grows into the thousands.
