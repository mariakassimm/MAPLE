# Security

## Controls in place
- Passwords: bcrypt (cost ≥12 in production), 5 failures = 15-minute lock, generic errors, timing equalisation, reset tokens hashed/single-use/60 min, all sessions revoked on reset.
- Sessions: opaque random token in an HTTP-only, Secure (production), SameSite=lax cookie; only the hash is stored; role/status re-read every request.
- CSRF: per-session HMAC token on every state-changing cookie-authenticated request.
- RBAC enforced server-side on every admin route; client menu is cosmetic.
- Input: strict Zod schemas (unknown fields rejected), 100 kb body limit, regex escaping in search/filter.
- Payments: signature/hash verification, constant-time compare, amount taken from the stored order, no client-side "paid" trust, redirect forms only to https.
- Headers/CORS: Helmet, exact-origin CORS allowlist. Rate limiting per route family.
- Uploads: Cloudinary signed uploads; only https image URLs are accepted.
- Audit log: append-only, secret-scrubbed. Logs never contain passwords, tokens, cookies or provider secrets.
- Secrets: only in server environment variables; none in the frontend bundle.

## Incident procedure
1. **Contain**: suspend affected staff accounts (revokes sessions); if a secret leaked, rotate it in Render and redeploy; if a provider credential leaked, rotate it in the provider portal first.
2. **Assess**: review `/admin/audit`, Sentry, and Render logs using the `requestId`.
3. **Money**: reconcile payments/orders against JazzCash/Easypaisa dashboards; late payments are flagged for refund automatically.
4. **Notify** affected customers as required, document what happened, then fix and add a test.

## Known gaps / not verified
- No third-party penetration test has been done. Dependency audit (`npm audit`) should be run and reviewed before launch.
- No account-level 2FA for staff yet.
- Provider integrations have not been verified against real sandboxes (see PROVIDER_SETUP.md, SHIPPING.md).
