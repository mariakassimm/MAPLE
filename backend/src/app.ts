import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { env } from './config/env';
import { errorHandler, notFound } from './middleware/errorHandler';
import { apiLimiter } from './middleware/rateLimit';
import { requestId } from './middleware/requestId';
import { requestLogger } from './middleware/requestLogger';
import { buildV1Router } from './routes';

export function createApp(): Express {
  const app = express();
  app.disable('x-powered-by');
  // Without the right hop count every client appears to share the proxy's IP, which breaks per-IP rate limits.
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(requestId);
  app.use(requestLogger);
  app.use(helmet());
  app.use(
    cors({
      // Exact-match allowlist. Requests with no Origin header (curl, server-to-server) carry no browser cookies to protect.
      origin: (origin, cb) => cb(null, !origin || env.CLIENT_ORIGINS.includes(origin)),
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
      allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'Idempotency-Key'],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.use('/api', apiLimiter);
  app.use('/api/v1', buildV1Router());

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
