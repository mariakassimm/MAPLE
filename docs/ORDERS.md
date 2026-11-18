# Cart, pricing, checkout and orders (Phase 3, part A)

Part B (next) adds COD collection/remittance recording, customer self-cancel and support notes. The COD ledger fields already exist on the order.

## Pricing: the server decides
`priceCart` (`src/modules/cart/pricing.service.ts`) recomputes everything from the database. The browser sends only `variantId` and `quantity`; any extra field (price, total, discount) is rejected with 400.

- Duplicate variants are merged into one line.
- A line is `ok`, `unavailable` (gone, unpublished, inactive, category archived) or `insufficient_stock` (with `availableQuantity`). Only `ok` lines count towards totals.
- `canCheckout` is false if any line has a problem or a coupon was entered but is invalid.
- Amounts are integer paisa. Shipping is a flat rate with an optional free-shipping threshold, both in settings. **The defaults (Rs 300 flat, no free shipping) are placeholders until the business decides** (SRS 15.3).
- No tax is charged. Add it after the accounting/tax review the SRS calls for.

## Coupons
`percent` (1-100, optional `maxDiscount`) or `fixed` (paisa), with `minOrderValue`, `startsAt`, `expiresAt`, `usageLimit`, `isActive`. The discount applies to merchandise only, never shipping, and never exceeds the subtotal. Redemption is an atomic conditional increment, so the last use cannot be taken twice; it is given back if the order fails or is cancelled. There is no per-customer limit yet (guests have no identity to count against).

## Coverage and payment methods
Delivery is allowed only to cities in the admin-maintained **service area** table (city + province, `codAvailable`, courier flags). The table starts empty; `npm run seed-service-areas` loads **placeholder** cities for development only. Replace them with courier-confirmed coverage before launch.

`POST /checkout/quote` returns the priced cart, whether the destination is serviceable, and each payment method's availability. COD needs a serviceable city with `codAvailable`, COD enabled in settings, and the total under `cod.maxOrderValue` if set. **JazzCash and Easypaisa are reported unavailable and rejected** until the Phase 4 adapters exist.

## Placing an order (`POST /orders`)
Requires an `Idempotency-Key` header (16-64 chars, `A-Za-z0-9_-`; a UUID works). Body: `items`, `paymentMethod`, `customer{name, phone, email?}`, `shippingAddress{province, city, area, line1, postalCode?, recipientName?, phone?, notes?}`, optional `couponCode`, `notes`, `expectedTotal`.

1. Retried request with the same key and body returns the original order (`200` + `Idempotent-Replay: true`). Same key, different body: `409 IDEMPOTENCY_CONFLICT`.
2. Totals are re-priced; problems give `409 ITEMS_UNAVAILABLE` / `COUPON_INVALID`.
3. If `expectedTotal` is sent and differs: `409 PRICE_CHANGED` with the new total in `details`.
4. Destination and payment method are checked (`400 NOT_SERVICEABLE` / `PAYMENT_METHOD_UNAVAILABLE`).
5. Stock is reserved, the coupon redeemed, the order saved. If any step fails, earlier steps are undone.

A signed-in customer must also send `X-CSRF-Token`; the order is then linked to their account. Guests need no cookie.

## Stock policy (explicit, as the SRS requires)
| Moment | Effect |
|---|---|
| Order placed | Units **reserved** (`inventoryState: reserved`) |
| Staff confirm | Reservation **committed**: units leave inventory (`committed`) |
| Cancel before confirm | Reservation **released** to sellable |
| Cancel after confirm, before dispatch | Units **restocked** |
| Cancel after dispatch | Not allowed (use the delivery-failed / return flow) |

Status changes claim the transition with a conditional update before touching stock, so two staff clicking at once cannot commit the same reservation twice. Reservations for COD orders do not expire automatically yet; unconfirmed orders hold stock until staff act. (An expiry job arrives with online payments.)

## Order status, payment status, shipment status
Three independent fields (FR-ORD-005). Order status is a validated state machine:
`pending_confirmation -> confirmed -> processing -> packed -> ready_for_dispatch -> shipped -> out_for_delivery -> delivered`, with `delivery_failed` (retry, deliver, or `returned_to_origin`) and `cancelled` (only up to `ready_for_dispatch`, reason required).

COD orders stay `paymentStatus: unpaid` when shipped and when delivered (FR-COD-003). Payment becomes `paid` only after remittance reconciliation, which is Part B. `shipmentStatus` stays `not_booked` until courier integration (Phase 5); until then staff move the order status by hand, which is the manual fallback.

## Endpoints
| Method | Path | Access |
|---|---|---|
| POST | `/cart/price` | public, stateless |
| GET / PUT / DELETE | `/cart` | signed-in customer (PUT replaces all lines) |
| POST | `/checkout/quote` | public |
| GET | `/checkout/cities` | public |
| POST | `/orders` | public (CSRF if signed in) |
| POST | `/orders/track` | public: `{orderNumber, phone}` |
| GET | `/account/orders`, `/account/orders/:orderNumber` | signed-in customer, own orders only |
| GET | `/admin/orders`, `/admin/orders/:id` | `orders:read` |
| PATCH | `/admin/orders/:id/status` | `orders:write` (`orders:cancel` to cancel) |
| GET, POST, PATCH | `/admin/coupons` | `coupons:write` |
| GET, PATCH | `/admin/settings` | `settings:write` |
| GET, POST, PATCH | `/admin/service-areas` | `settings:write` |

Guest carts live in the browser and are re-priced by `/cart/price`; only signed-in customers have a server-side cart. Guest order lookup needs order number and phone together; order numbers are random (`MPL-XXXXXXXX`), not sequential.

## Not yet
Emails on order events (Phase 8), COD collection/remittance (Part B), online payment (Phase 4), couriers (Phase 5), guest self-cancel.
