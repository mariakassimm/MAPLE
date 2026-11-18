MAPLE — The Art of Everyday Luxury

A Pakistan-focused, single-brand e-commerce platform built to deliver a seamless online shopping experience.

Live Demo: https://maple-coral.vercel.app/

Overview

MAPLE is a full-stack e-commerce application featuring a customer storefront and an administrative dashboard. It supports product discovery, secure customer accounts, order management, and Pakistan-specific checkout options with PKR pricing.

Features

Product browsing, collections, search, filtering, and sorting

Customer registration, login, cart, and checkout

Cash on Delivery and simulated JazzCash and Easypaisa payments

Order tracking, returns, and product reviews

Admin dashboard with role-based access

Product, inventory, customer, and order management

Responsive storefront for desktop and mobile

Technology Stack

Frontend: React, TypeScript, Vite, Tailwind CSS

Backend: Node.js, Express.js, TypeScript

Database: MongoDB, Mongoose

Deployment: Vercel

Getting Started

Prerequisites

Node.js

npm

MongoDB connection string

Backend

cd backend
npm install

Create a .env file using .env.example and configure the required environment variables, including MONGODB_URI and CSRF_SECRET.

Run the setup commands:

npm run seed-service-areas
npm run seed-demo
npm run seed-policies
npm run create-super-admin
npm run dev

The backend runs at http://localhost:4000.

Frontend

Open another terminal:

cd frontend
npm install
npm run dev

The storefront runs at http://localhost:5173.

Demo Mode

MAPLE includes a demo mode for testing checkout and integrations without live merchant accounts.

JazzCash, Easypaisa, and shipping provider integrations operate as simulations when DEMO_MODE=true. Real provider credentials can be configured later.
