# Payment providers: JazzCash and Easypaisa (Phase 4)

## Demo mode (portfolio / no merchant account)
Set `DEMO_MODE=true` and checkout offers JazzCash and Easypaisa without any credentials. After placing the order the shopper lands on a
clearly labelled **sandbox payment page** (no real money) where they approve or decline, and the order then follows exactly the same
paid/failed path as a real payment. TCS and Leopards are simulated the same way: booking returns a `DEMO-TCS-...` tracking number and
tracking advances by itself (picked up after 1 min, in transit 3, out for delivery 6, delivered 10), driven by the normal sync.
A provider with real credentials is never simulated, so adding a client's keys later needs **no code change**: set the variables below
and set `DEMO_MODE=false`. Simulated payment routes (`/api/v1/payments/demo/*`) do not exist when `DEMO_MODE` is off.

## Status: read this first
| | JazzCash | Easypaisa |
|---|---|---|
| Adapter implemented | Yes | Yes |
| Unit and integration tested (fake provider responses) | Yes | Yes |
| **Tested against the real sandbox** | **No** | **No** |
| **Production tested** | **No** | **No** |
| Needs from you | Merchant ID, password, integrity salt | Store ID, hash key (and callback URLs registered) |

Nothing here has talked to a real JazzCash or Easypay server. The specifications below were taken from JazzCash's published Integration Guide / sandbox documentation and Telenor's public Easypay reference integration, because your merchant packs are not available yet. **Treat the provider as unverified until you have run the sandbox checklist at the bottom with your own credentials.** A payment is never marked paid except on authenticated provider data; if a detail below differs from your pack, the safe failure is "payment stays pending", not "paid by mistake".

## How the money flow works (both providers)
1. `POST /orders` with `paymentMethod: "jazzcash"` or `"easypaisa"` creates the order as `awaiting_payment` (payment `pending`), reserving stock for `PAYMENT_WINDOW_MINUTES` (default 30).
2. The frontend calls `POST /payments/{provider}/initiate` with `{orderNumber, phone}`. The response is `{paymentRef, redirect: {method, action, fields}}`. The frontend builds a hidden form from it and submits it, sending the shopper to the provider. The amount always comes from the stored order.
3. The shopper pays. The provider sends the result to the API (below). Only authenticated data can change payment state.
4. Verified success: payment `paid`, order `confirmed`, stock committed, all exactly once, however many times the provider repeats itself.
5. After the provider, the shopper lands on `{CLIENT_ORIGIN}/checkout/result?order=MPL-XXXXXXXX` (or `?invalid=1`). **This page must not trust the URL**: it should call `POST /orders/track` and show the order's real `paymentStatus` (poll for a few seconds while it is `pending`/`processing`).
6. Failed or cancelled: the order stays `awaiting_payment` with `paymentStatus: failed`; the shopper can retry (up to 5 attempts) until the window closes. A background sweep (every minute) then asks each provider one last time, and if still unpaid cancels the order and releases the stock.

A payment that arrives after the order was cancelled is recorded and the order is marked `refund_pending` for a person to refund. Refunds are not automated yet.

## JazzCash (Page Redirection / hosted checkout)
**Configure:** set `JAZZCASH_MERCHANT_ID`, `JAZZCASH_PASSWORD`, `JAZZCASH_INTEGRITY_SALT`, `API_PUBLIC_URL`. Ask JazzCash to whitelist your return URL: `{API_PUBLIC_URL}/api/v1/payments/jazzcash/return`.

- **Request:** an HTTPS form POST to the JazzCash hosted page with `pp_Version`, `pp_TxnType`, `pp_Language`, `pp_MerchantID`, `pp_SubMerchantID`, `pp_Password`, `pp_BankID`, `pp_ProductID`, `pp_TxnRefNo` (our 20-character reference), `pp_Amount` (integer paisa), `pp_TxnCurrency=PKR`, `pp_TxnDateTime`, `pp_BillReference`, `pp_Description`, `pp_TxnExpiryDateTime`, `pp_ReturnURL`, `ppmpf_1..5`, `pp_IsRegisteredCustomer=No` (version 2.0) and `pp_SecureHash`. Times are Pakistan time.
- **Signature:** HMAC-SHA256, key = integrity salt, message = `salt&` + values of all non-empty `pp_` fields in ASCII order of field name joined by `&`. **This is tested against the worked example JazzCash publishes** (salt `0F5DD14AE2` gives `c7689cda...c867`). Responses are verified with the same function; anything unsigned, altered, for another merchant or with a non-numeric amount is rejected and logged.
- **Result codes:** `000` paid. `124` (waiting for payment, e.g. over-the-counter voucher) stays pending. Every other code is treated as failed, and a later verified `000` for the same reference is still accepted. Check Appendix I of your guide and refine after sandbox runs.
- **URLs:** the default hosted-page URLs are `https://sandbox.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/` and `https://payments.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/`. JazzCash issues the exact URL for your account, so override with `JAZZCASH_PAYMENT_URL` if yours differs.
- **Status inquiry (optional, off by default):** set `JAZZCASH_INQUIRY_URL` to the endpoint in your pack. The adapter posts `pp_TxnRefNo`, `pp_MerchantID`, `pp_Password`, `pp_SecureHash` as JSON and accepts only a response whose own `pp_SecureHash` verifies and whose `pp_PaymentResponseCode` is `000`. **The request/response shape here is unverified**; if your endpoint differs (for example SOAP) it will simply answer "unknown" and the system relies on the signed return plus manual review.
- **Not implemented:** over-the-counter voucher server notifications (`124` payments that are paid later are only noticed through inquiry or manual review), refunds, tokenised cards.

## Easypaisa (Easypay hosted checkout)
**Configure:** set `EASYPAISA_STORE_ID`, `EASYPAISA_HASH_KEY` (same key as in the Easypay merchant portal), `API_PUBLIC_URL`. In the portal register:
- postback URL: `{API_PUBLIC_URL}/api/v1/payments/easypaisa/postback`
- IPN URL: `{API_PUBLIC_URL}/api/v1/payments/easypaisa/ipn`

- **Step 1** posts to `{base}/easypay/Index.jsf` with `storeId`, `amount` (rupees, e.g. `20300.0`), `orderRefNum` (our reference), `postBackURL`, `expiryDate` (`yyyyMMdd HHmmss`, Pakistan time), `autoRedirect`, optional `emailAddr`/`mobileNum`, and `merchantHashedReq` (the fields sorted, written `k=v&k=v`, AES-ECB encrypted with the hash key, base64).
- **Step 2:** Easypay sends the browser to the postback URL with `auth_token`; the API returns a one-purpose page that posts it on to `Confirm.jsf`. That page carries its own tight Content-Security-Policy (one nonce'd script; form posts only to the Easypay origin).
- **Confirmation (IPN):** Easypay's notification is **not signed**. It supplies a `url` on Easypay's own domain; the API fetches that URL itself and trusts only that answer. The `url` is treated as hostile input: https, exactly the configured Easypay host, no credentials/port/redirects, order reference taken from the URL path, store id must match, amounts must match. Anything else is refused without making a request.
- **Only a notification (or the optional inquiry) can mark a payment paid.** The shopper's final redirect is informational.
- **Unverified here:** the exact JSON field names of the notification (`transaction_status`, `transaction_amount`, `store_id`, `transaction_id`), the postback's result parameters, and the optional inquiry API (`EASYPAISA_INQUIRY_URL` etc., header `Credentials`, `transactionStatus: PAID`). Unrecognised answers leave the payment pending.

## Sandbox acceptance checklist (do this before going live)
Run each with real sandbox credentials and tick it only when you have seen it:
1. JazzCash: successful card/wallet payment turns the order `confirmed`/`paid`.
2. JazzCash: declined payment shows failure and allows retry; success on retry works.
3. JazzCash: browser closed after paying; order is still confirmed (via return or inquiry).
4. JazzCash: repeat the return POST (replay); nothing changes.
5. Easypaisa: payment through Index, confirm and notification confirms the order.
6. Easypaisa: failed/abandoned payment; order expires after the window and stock is released.
7. Both: pay after the window has expired; order shows `refund_pending`.
8. Both: confirm the amounts in your provider dashboards match the orders.
If any step disagrees with this document, send me the provider's actual field names/responses and I will adjust the adapter.

## Operations notes
- Callbacks need a public HTTPS `API_PUBLIC_URL` (use a tunnel in development).
- The unpaid-order sweep runs inside the API process every minute; with several instances it is safe (guarded transitions) but should move to a single scheduled worker.
- Payment events (accepted and rejected) are stored in `PaymentEvent` with credentials and signatures removed; `/admin/payments` lists attempts; `/admin/payments/:ref/reconcile` re-checks one with the provider (super admin).
