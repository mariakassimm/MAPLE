import rateLimit from 'express-rate-limit';
import { AppError } from '../common/errors';
import { env } from '../config/env';

const make = (windowMs: number, limit: number) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => env.NODE_ENV === 'test',
    // Routed through errorHandler so 429s use the same envelope as every other error.
    handler: (_req, _res, next) =>
      next(new AppError(429, 'RATE_LIMITED', 'Too many requests. Please try again later.')),
  });

// In-memory counters: fine for one instance. Switch to a shared store before running multiple API instances.
export const apiLimiter = make(15 * 60 * 1000, 300);
export const authLimiter = make(15 * 60 * 1000, 20);
export const orderLimiter = make(15 * 60 * 1000, 30);
