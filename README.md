# MAPLE | The Art of Everyday Luxury

A full-stack, single-brand e-commerce platform, featuring a customer storefront and an administrative dashboard.

**Live Demo:** [https://maple-coral.vercel.app](https://maple-coral.vercel.app)

**Repository:** [https://github.com/mariakassimm/MAPLE](https://github.com/mariakassimm/MAPLE)

---

## About

MAPLE is an e-commerce application designed around the needs of a retail business. It provides a complete shopping experience, from product discovery and checkout to order tracking and administration.

The platform uses PKR pricing and supports locally relevant checkout and shipping workflows.

## Core Features

- **Product Catalogue:** Product listings, collections, search, filtering, and sorting.
- **Customer Accounts:** Registration, authentication, and shopping cart.
- **Checkout:** Cash on Delivery and simulated JazzCash and Easypaisa integrations.
- **Order Management:** Order tracking, status updates, returns, and reviews.
- **Administration:** Role-based access and product, inventory, customer, and order management.
- **Notifications:** Automated order lifecycle emails.
- **Security:** Session-based authentication, CSRF protection, and administrative audit logging.
- **Responsive Design:** Optimized storefront experience across desktop and mobile devices.

## Technology Stack

| Component | Technologies |
|---|---|
| Frontend | React, TypeScript, Vite, Tailwind CSS |
| Backend | Node.js, Express.js, TypeScript |
| Database | MongoDB, Mongoose |
| Deployment | Vercel |

## Project Structure

```
MAPLE/
├── frontend/   React + Vite storefront and admin panel
├── backend/    Express API (also runs as a Vercel serverless function via api/index.ts)
└── .github/    CI: lint, format check, typecheck, tests, build
```

## Getting Started

**Requirements:** Node.js 20+, a MongoDB database (local or MongoDB Atlas free tier).

```bash
# 1. Backend
cd backend
cp .env.example .env        # fill in MONGODB_URI and CSRF_SECRET at minimum
npm install
npm run create-super-admin  # creates the first admin account
npm run dev                 # http://localhost:4000

# 2. Frontend (new terminal)
cd frontend
cp .env.example .env
npm install
npm run dev                 # http://localhost:5173
```

Optional demo content: `npm run seed-demo` (backend).

## Quality Checks

Run in `backend/` and `frontend/`: `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm test` (and `npm run build` in `frontend/`).
End-to-end and accessibility tests: `npx playwright install chromium`, then `npm run e2e` in `frontend/`.

## Deployment (Vercel, free tier)

Two Vercel projects from the same repository:

| Project | Root directory | Notes |
|---|---|---|
| Frontend | `frontend` | `vercel.json` proxies `/api/*` to the backend project so cookies stay first-party |
| Backend | `backend` | Express runs as a serverless function; a daily cron handles order expiry and shipment sync |

Backend environment variables: `MONGODB_URI`, `CSRF_SECRET`, `CRON_SECRET`, `CLIENT_ORIGINS` and `API_PUBLIC_URL` (both the frontend URL), `TRUST_PROXY=1`, `COOKIE_SAMESITE=lax`. Redeploy the backend after changing any of them. MongoDB Atlas must allow connections from `0.0.0.0/0` because Vercel has no fixed IP.

Free-tier notes: the first request after idle time is slower, and rate limiting and login lockout are held in memory per instance.

## Notes

- JazzCash and Easypaisa are simulated unless real merchant credentials are configured.
- Never commit `.env` files; only the `.env.example` templates are tracked.
