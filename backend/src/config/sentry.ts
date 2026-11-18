import { env } from './env';
import { logger } from './logger';

type SentryModule = typeof import('@sentry/node');
let sentry: SentryModule | undefined;

// Loaded only when a DSN is configured, so development and tests never pay for (or send to) it.
export async function initSentry(): Promise<void> {
  if (!env.SENTRY_DSN) return;
  const mod = await import('@sentry/node');
  mod.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    release: env.SENTRY_RELEASE,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    // Cookies, auth headers and request bodies can hold sessions, passwords or payment data: never leave the server.
    beforeSend(event) {
      if (event.request) {
        delete event.request.cookies;
        delete event.request.headers;
        delete event.request.data;
        delete event.request.query_string;
      }
      return event;
    },
  });
  sentry = mod;
  logger.info('sentry enabled');
}

export function captureError(err: unknown, context: { requestId?: string } = {}): void {
  sentry?.captureException(err, { tags: context.requestId ? { requestId: context.requestId } : undefined });
}

export async function flushSentry(): Promise<void> {
  await sentry?.close(2000);
}
