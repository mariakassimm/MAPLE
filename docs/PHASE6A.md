# Emails, customer account, reviews, returns, newsletter (Phase 6A)

## Emails (Resend)
Set `RESEND_API_KEY` and `EMAIL_FROM` (a sender on a domain you have verified in Resend; add Resend's SPF/DKIM DNS records). Without them nothing is sent: in development the email is logged, elsewhere a warning. Real delivery is **not yet tested against Resend** (the adapter posts to `https://api.resend.com/emails` with a bearer key; tests use a fake).

**Never blocks business.** Emails are sent after the order/payment action has succeeded, are not awaited by it, and failures are only logged. Orders without an email address (optional at checkout) simply get none.

| Event | Template |
|---|---|
| Register | `welcome`, `verify_email` (link valid 48 h, single use) |
| Forgot password | `password_reset` (60 min, single use) |
| Order placed | `order_placed` (COD wording, or "waiting for payment" for online) |
| Online payment verified | `order_paid` |
| Online payment failed | `order_payment_failed` |
| Courier booked | `order_dispatched` (courier and tracking number) |
| Out for delivery / failed attempt | `order_tracking` |
| Delivered | `order_delivered` |
| Cancelled (staff, customer or expiry) | `order_cancelled` |
| Return requested/approved/rejected/received/refunded/exchanged/closed | `return_<status>` |
| Newsletter sign-up | `newsletter_welcome` (with unsubscribe link) |

Templates are table-based with inline styles, MAPLE colours, no remote images or scripts, a plain-text twin, and every dynamic value HTML-escaped. **Frontend routes the links point to** (`CLIENT_ORIGINS[0]`): `/shop`, `/reset-password?token=`, `/verify-email?token=`, `/order-tracking?order=MPL-...`, `/newsletter/unsubscribe?email=&token=`.

## Customer account (signed in; CSRF on writes)
- `PATCH /account/profile` `{name?, phone? (null clears)}`, `GET /account/profile`
- `POST /account/change-password` `{currentPassword, newPassword}`: signs out every other device
- `GET/POST /account/addresses`, `PATCH/DELETE /account/addresses/:id` (max 10; first is the default; deleting the default promotes another)
- `POST /auth/verify-email {token}`, `POST /auth/resend-verification`. Verification is recorded but **not required** for anything yet.
- Orders: `/account/orders`, `/account/orders/:orderNumber`, `/account/orders/:orderNumber/cancel`; returns: `GET /account/returns`

## Reviews
- Only signed-in customers with a **delivered** order containing the product, one review per product, always **pending** until staff approve.
- `POST /account/reviews {productSlug, rating 1-5, title?, body}`, `GET /products/:slug/reviews` (approved only; first name + initial; summary with distribution).
- Moderators (`reviews:moderate`: super admin, product manager, support): `GET /admin/reviews?status=`, `PATCH /admin/reviews/:id {status?, featured?}`. Only approved reviews can be featured (for the homepage testimonials in 6B). Product cards/details carry `rating: {average, count}` or `null`. **No rating is ever invented.**

## Returns and refunds
- `POST /returns {orderNumber, phone, type: refund|exchange, reason, details?, items[{variantId, quantity}]}` (guest or signed in), `POST /returns/lookup`. Delivered orders only, within the return period, one open return per order, quantities capped at what was ordered.
- **Return period default is 7 days: a placeholder.** Set `returns.windowDays` via `PATCH /admin/settings` once your policy is decided.
- Staff (`returns:read` / `returns:manage`): `GET /admin/returns`, `GET /admin/returns/:id`, `PATCH /admin/returns/:id {status, note?, refundAmount?, restock?}`. Flow: requested -> approved or rejected (reason required) -> received -> refunded (refund requests) or exchanged (exchange requests) or closed.
- **Nothing returns to stock automatically.** Staff list the units that passed inspection in `restock` when marking `received`; they go back on sale as `return` movements in the stock history.
- Refunds are **recorded here, paid outside** (JazzCash/Easypaisa/bank/cash). The total refunded is capped at the order total across all returns; a paid order becomes `partially_refunded` then `refunded`. An unpaid COD order stays `unpaid`.

## Newsletter
`POST /newsletter/subscribe {email}` records consent (timestamp) and always answers the same way, so the form cannot reveal who is subscribed. `POST /newsletter/unsubscribe {email, token}` with the signed link from the email. `GET /admin/newsletter` (content:write) lists subscribers and the live count. **Sending campaigns is not built**; export the list to a mailing tool.
