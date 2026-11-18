import type { RequestHandler } from 'express';
import { logger } from '../config/logger';

export const requestLogger: RequestHandler = (req, res, next) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    logger.info(
      {
        requestId: req.requestId,
        method: req.method,
        // Query strings are dropped on purpose: they can carry reset tokens or other secrets.
        path: req.originalUrl.split('?')[0],
        status: res.statusCode,
        ms: Math.round(Number(process.hrtime.bigint() - start) / 1e6),
      },
      'request',
    );
  });
  next();
};
