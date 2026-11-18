# Shipping, COD reconciliation and customer cancellation (Phase 5 + 3B)

## Status
| | TCS | Leopards | Manual |
|---|---|---|---|
| Adapter implemented | Yes | Yes | Yes |
| Tested with fake courier responses | Yes (including TCS's documented sample responses) | Yes | Yes |
| **Tested against the real sandbox** | **No** | **No** | n/a |
| Specification source | TCS "API User Guide v1.0" (official) | Public integration wrappers (**lower confidence**) | n/a |
| Needs from you | username, password, account no., cost-center code | base URL, API key, API password | nothing |

TCS needs UAT in its sandbox before production access (about 3 working days after sign-off). Run the checklist at the end first.

## Booking
`POST /admin/orders/:id/shipments` (permission `shipments:write`; order managers have it). Body: `courier` (`tcs`, `leopards` or `manual`), `weightKg`, `pieces`, `remarks`, and `trackingNumber` for manual.

- Only **confirmed** orders (confirmed, processing, packed, ready for dispatch) can be booked. Unpaid or unconfirmed orders cannot.
- With no `courier`, TCS is used where the city's coverage row says TCS serves it, otherwise Leopards where that is ticked, otherwise the request is refused and staff choose. Staff can always pick the backup.
- COD amount sent to the courier is the order's amount due (0 for prepaid). TCS and Leopards take **whole rupees**; TCS refuses COD above Rs 250,000 and so does this API, with a clear message, before calling TCS.
- **One live shipment per order, enforced by the database.** The shipment slot is claimed before the courier is called, so two staff clicking at once, or TCS followed by Leopards, cannot double-book a parcel.
- **Refused by the courier** (validation, credentials, unknown city): recorded with the reason, the slot is freed, staff can fix and retry or use the other courier.
- **Unclear outcome** (timeout, dropped connection, garbled reply): the booking may exist at the courier, so the slot stays held and the shipment is flagged `needsReview`. Check with the courier, then `PATCH /admin/shipments/:id {trackingNumber}` to record it, or cancel the attempt. `GET /admin/shipments?needsReview=true` lists these.

## Tracking and order status
- `POST /admin/shipments/:id/sync` pulls tracking now; the API also refreshes every live shipment every 15 minutes (no courier webhooks are relied on).
- Courier wording is mapped to our normalized statuses (booked, picked up, in transit, out for delivery, delivery failed, return initiated, returned to origin, delivered). **Unrecognised wording is kept as history and changes nothing.** Statuses only move forward; delivered / returned / cancelled are final.
- When a shipment moves, the order follows, recording each step (for example confirmed -> processing -> packed -> ready for dispatch -> shipped). It never confirms an unconfirmed order and never touches cancelled or finished ones.
- **Delivered does not mean paid.** A COD order stays `unpaid` until the payout is reconciled (below).
- Shoppers see courier, tracking number, status and history through `POST /orders/track` and `/account/orders/:orderNumber` (`shipment` field).
- **Manual fallback:** `POST /admin/shipments/:id/status {status, note}` moves a shipment by hand (courier API down, manual booking), under the same forward-only rules, with the same effect on the order.
- `POST /admin/shipments/:id/cancel` cancels before pickup (and with the courier's API where booked through it); afterwards it is refused.
- Not implemented: label printing (TCS offers a label API), bulk booking, courier rate quotes, courier webhooks.

## COD reconciliation (money, step by step)
1. Delivered (from the courier).
2. **Collection**: `POST /admin/orders/:id/cod/collection {amount}` (`orders:write`). Amount must equal the amount due, once, only after delivery. The courier now holds MAPLE's cash; the order is still `unpaid`.
3. **Remittance**: `POST /admin/orders/:id/cod/remittance {amount, courierCharges, reference}` (`payments:write`, super admin by default; **decide who in your business should own this**). `amount` is what the courier paid out, `courierCharges` what it kept. References cannot repeat, and the total can never exceed what was collected. When payout + charges account for everything collected, the order becomes `paid`.
4. `GET /admin/cod/summary` (`payments:read`) keeps three numbers apart: delivered but not collected, collected but not yet remitted (with the list), and settled (collected / received / courier charges).

## Customer cancellation
- Guest: `POST /orders/cancel {orderNumber, phone, reason?}`. Signed in: `POST /account/orders/:orderNumber/cancel` (CSRF).
- Allowed only while the order is `pending_confirmation` or `awaiting_payment`. Stock and coupon use are returned; open payment attempts are closed (a payment that still arrives is handled as a refund case). After confirmation the customer must contact support.

## Configuration
See `.env.example`. A courier exists only when all of its variables are set; otherwise booking it returns `COURIER_UNAVAILABLE` and staff use manual booking. `SHIP_FROM_*` (pickup name, phone, city, address) is required once any courier is on.

## Things to confirm in each sandbox
**TCS**
1. Authentication: the guide documents `GET /ecom/api/authentication/token` with a JSON body. We send it exactly so (Node's `fetch` cannot, so the API uses `node:https`). If TCS expects query parameters instead, authentication will fail with "rejected the API credentials".
2. Booking: `middlename` is documented as mandatory; a placeholder `N/A` is sent. `citycode`/`areacode` are optional and omitted. Confirm that TCS accepts city names as typed, and what your cost-center code and service code (`O`) should be.
3. Tracking: we send `consignee` as a query parameter and in the body. Compare real status text/codes with the table in `src/modules/shipping/statusMap.ts` (TCS code `OK` = delivered and `RO` = returned are used). TCS's "Delivery Status List" API lists the full code set.
**Leopards**
1. The base URL and the exact endpoint paths (`bookPacket`, `trackBookedPacket`, `cancelBookedPackets`, `getAllCities`, each under `/format/json/`) come from public wrappers; confirm against your Leopards documentation.
2. Destination city ids come from `getAllCities`; cities Leopards does not list are refused with a clear message.
3. Shipper details use the account's registered ones (`self`).
4. Tracking field names (`Tracking Detail`, `Status`, `Activity_Date`) are unverified.
Send me the real responses if anything differs and I will adjust the adapters.
