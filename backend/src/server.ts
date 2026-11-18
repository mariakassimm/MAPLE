import { createApp } from './app';
import { connectDb, disconnectDb } from './config/db';
import { env } from './config/env';
import { logger } from './config/logger';
import { captureError, flushSentry, initSentry } from './config/sentry';
import { expireUnpaidOrders } from './modules/payments/reconcile.service';
import { syncActiveShipments } from './modules/shipping/shipment.service';

async function main(): Promise<void> {
  await initSentry();
  await connectDb();
  if (env.DEMO_MODE) {
    logger.warn(
      'DEMO_MODE is ON: JazzCash, Easypaisa, TCS and Leopards are SIMULATED. Anyone can approve a fake payment. Never use this for a store with real customers.',
    );
  }
  const server = createApp().listen(env.PORT, () =>
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'MAPLE API listening'),
  );

  // Cancels online orders whose payment window ran out and returns their stock. Idempotent, so running it on every
  // instance is safe; for many instances, move it to one scheduled worker.
  const sweeper = setInterval(
    () => expireUnpaidOrders().catch((err) => logger.error({ err }, 'unpaid order sweep failed')),
    60_000,
  );
  sweeper.unref();
  // Pulls courier tracking for live shipments every 15 minutes (couriers' webhooks are not relied on).
  const tracker = setInterval(
    () => syncActiveShipments().catch((err) => logger.error({ err }, 'shipment sync failed')),
    15 * 60_000,
  );
  tracker.unref();

  // Hosts send SIGTERM on deploys; finishing in-flight requests first avoids dropped checkouts.
  const shutdown = (signal: string) => {
    logger.info({ signal }, 'shutting down');
    setTimeout(() => process.exit(1), 10_000).unref();
    server.close(async () => {
      await flushSentry();
      await disconnectDb();
      process.exit(0);
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'unhandled promise rejection');
  captureError(reason);
});

main().catch((err) => {
  logger.fatal({ err }, 'failed to start');
  process.exit(1);
});
