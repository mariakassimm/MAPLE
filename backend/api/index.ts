/**
 * Vercel entry point: runs the Express API as a serverless function (see backend/vercel.json, which sends every path here).
 * The long-running server in src/server.ts is still what `npm run dev` and a normal host (Render, a VPS) use.
 *
 * Differences from the long-running server, all forced by serverless:
 *  - the database connection is opened once per warm instance and reused;
 *  - there are no setInterval timers, so the two background jobs run (a) from a Vercel Cron call to /api/v1/internal/cron
 *    and (b) opportunistically, at most once a minute, while the API is being used.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import type { Express } from 'express';
import mongoose from 'mongoose';
import { createApp } from '../src/app';
import { connectDb } from '../src/config/db';
import { env } from '../src/config/env';
import { logger } from '../src/config/logger';
import { expireUnpaidOrders } from '../src/modules/payments/reconcile.service';
import { syncActiveShipments } from '../src/modules/shipping/shipment.service';

let app: Express | null = null;
let connecting: Promise<void> | null = null;
let lastSweep = 0;

async function ready(): Promise<Express> {
  // A warm instance can be frozen and thaw with its database socket closed: reconnect instead of trusting the old promise.
  // (readyState 1 = connected, 2 = connecting; 0 or 3 = dropped.)
  const state = mongoose.connection.readyState;
  if (connecting && state !== 1 && state !== 2) connecting = null;
  if (!connecting) {
    connecting = connectDb().catch((err) => {
      connecting = null; // let the next request retry instead of caching a failure
      throw err;
    });
  }
  await connecting;
  if (!app) {
    if (env.DEMO_MODE) logger.warn('DEMO_MODE is ON: payments and couriers are SIMULATED. Never use this for real customers.');
    app = createApp();
  }
  return app;
}

async function runJobs(): Promise<void> {
  await expireUnpaidOrders();
  await syncActiveShipments();
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const express = await ready();

    if (req.url?.startsWith('/api/v1/internal/cron')) {
      const secret = process.env.CRON_SECRET;
      if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
        res.statusCode = 401;
        res.end('Unauthorized');
        return;
      }
      await runJobs();
      res.setHeader('Content-Type', 'application/json');
      res.end('{"ok":true}');
      return;
    }

    // Serverless has no timers: sweep expired unpaid orders now and then, while people are actually using the store.
    if (Date.now() - lastSweep > 60_000) {
      lastSweep = Date.now();
      await expireUnpaidOrders().catch((err) => logger.error({ err }, 'unpaid order sweep failed'));
    }

    express(req as never, res as never);
  } catch (err) {
    logger.error({ err }, 'API failed to start for this request');
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end('{"error":{"code":"UNAVAILABLE","message":"The service is starting up. Please try again."}}');
  }
}
