# Database (MongoDB, Mongoose)

Money fields are integer paisa. Main collections: `users`, `sessions` (TTL on `expiresAt`), `categories`, `products` (embedded `variants`), `inventorymovements` (append-only), `orders` (embedded items snapshot: name, options, unit price at purchase), `payments`, `shipments`, `codremittances`, `coupons`, `returns`, `reviews`, `serviceareas`, `newsletter subscribers`, `pages/site/home content`, `carts` (signed-in), `idempotencykeys`, `emaillogs`, `auditlogs` (append-only).

Indexes are declared in the Mongoose schemas (unique email, SKU, slug, order number, idempotency key; compound indexes for listing queries). Mongoose builds them at start-up (`autoIndex`); on a large production database create them in a maintenance window.

## Backups and restore (NFR-DR-001)
1. Use Atlas **Cloud Backup** (continuous or scheduled snapshots, available on paid tiers M10+). The free M0 tier has **no automated backups** — do not launch real sales on M0.
2. Also take a periodic logical export: `mongodump --uri "$MONGODB_URI" --gzip --archive=maple-YYYYMMDD.gz`, stored somewhere other than the server.
3. **Restore drill (do this before launch)**: restore the latest snapshot into a *separate* test cluster, point a staging API at it, check that you can log in and open recent orders. A backup that was never restored is unverified.
4. Restore live: put the site in maintenance (pause Render service), restore snapshot, resume, then reconcile any orders/payments made after the snapshot against JazzCash/Easypaisa/courier dashboards.
