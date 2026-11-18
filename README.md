# MAPLE | The Art of Everyday Luxury

A full-stack, single-brand e-commerce platform built for the Pakistani market, featuring a customer storefront and an administrative dashboard.

**Live Demo:** [https://maple-coral.vercel.app](https://maple-coral.vercel.app)

**Repository:** [https://github.com/mariakassimm/MAPLE](https://github.com/mariakassimm/MAPLE)

---

## About

MAPLE is an e-commerce application designed around the needs of a Pakistan-based retail business. It provides a complete shopping experience, from product discovery and checkout to order tracking and administration.

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

## Getting Started

### Prerequisites

- Node.js and npm
- MongoDB database
- Git

### Backend Setup

```bash
cd backend
npm install
```

Create a `.env` file from `.env.example` and configure the required environment variables, including:

- `MONGODB_URI`
- `CSRF_SECRET`
- `DEMO_MODE=true`

Initialize the application:

```bash
npm run seed-service-areas
npm run seed-demo
npm run seed-policies
npm run create-super-admin
```

Start the development server:

```bash
npm run dev
```

The backend API runs at `http://localhost:4000`.

### Frontend Setup

Open a separate terminal:

```bash
cd frontend
npm install
npm run dev
```

The frontend runs at `http://localhost:5173`.

## Demo Configuration

The application supports demo mode for testing integrations without requiring active merchant accounts.

When `DEMO_MODE=true`, payment and shipping integrations operate as simulations. Live provider credentials can be configured separately when transitioning to production.

