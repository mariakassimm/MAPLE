# Testing

| Layer | Tool | Command | Status |
|---|---|---|---|
| Backend unit + integration | Vitest + Supertest + mongodb-memory-server | `cd backend && npm test` | Written; run by the author during earlier phases where the environment allowed |
| Frontend unit/component | Vitest + RTL (jsdom) | `cd frontend && npm test` | **Written, never executed** (dependencies could not be installed in the build sandbox) |
| E2E | Playwright | `cd frontend && npx playwright install && npm run e2e` | **Written, never executed** |
| Type checking | tsc | `npm run typecheck` in each folder | Checked only with filtered output; a clean run on your machine is required |

## Before trusting this build
1. `npm install` in `backend/` and `frontend/`, then `npm run typecheck` and `npm test` in each. Send me any failures and I will fix them.
2. E2E: start MongoDB, run the API with a test DB, create a super admin, add one published product with stock and a service area for `E2E_CITY`, then run `npm run e2e` (set `E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD` for admin specs). Selectors are best-effort and may need small adjustments.
3. Payments and couriers need real sandbox credentials; nothing here has been run against them.
