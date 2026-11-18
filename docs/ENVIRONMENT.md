# Environment variables

All backend config is validated by Zod at start-up (`backend/src/config/env.ts`); the server refuses to boot on bad config and never prints values. See `backend/.env.example` for every variable with comments. Frontend variables are public by design: **never put a secret in a `VITE_` variable.**

| Group | Variables | Required in production |
|---|---|---|
| Core | `NODE_ENV`, `PORT`, `MONGODB_URI`, `CLIENT_ORIGINS`, `TRUST_PROXY=1` (Render), `LOG_LEVEL` | Yes |
| Session/CSRF | `SESSION_COOKIE_NAME`, `COOKIE_DOMAIN` (e.g. `.yourdomain.pk`), `COOKIE_SAMESITE=lax`, `CSRF_SECRET` (48+ random bytes), `BCRYPT_COST>=12` | Yes |
| Payments | `API_PUBLIC_URL`, `PAYMENT_WINDOW_MINUTES`, `JAZZCASH_*`, `EASYPAISA_*` | Only for the providers you enable |
| Shipping | `SHIP_FROM_*`, `TCS_*`, `LEOPARDS_*` | Only for the couriers you enable |
| Email | `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO` | Recommended |
| Media | `CLOUDINARY_*` | For admin image upload |
| Monitoring | `SENTRY_DSN`, `SENTRY_RELEASE` | Recommended |
| Frontend | `VITE_API_URL` (default `/api/v1`), `VITE_SITE_URL` (canonical/SEO base) | Yes |

Rotate secrets by changing them in the Render dashboard and redeploying. Changing `CSRF_SECRET` invalidates CSRF tokens (users must reload); it does not sign anyone out.
