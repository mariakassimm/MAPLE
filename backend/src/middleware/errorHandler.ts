import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError, isDuplicateKeyError } from '../common/errors';
import { logger } from '../config/logger';
import { captureError } from '../config/sentry';

export const notFound: RequestHandler = (_req, _res, next) => next(new AppError(404, 'NOT_FOUND', 'Route not found.'));

function normalize(err: unknown): AppError {
  if (err instanceof AppError) return err;
  const type = (err as { type?: string } | null)?.type;
  if (type === 'entity.parse.failed') return new AppError(400, 'BAD_REQUEST', 'Malformed JSON body.');
  if (type === 'entity.too.large') return new AppError(413, 'BAD_REQUEST', 'Request body is too large.');
  if (isDuplicateKeyError(err)) return new AppError(409, 'CONFLICT', 'A record with these details already exists.');
  return new AppError(500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.');
}

export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);
  const known = normalize(err);
  // Unexpected failures are logged with the stack; the client only ever sees a generic message and the request id.
  if (known.status >= 500) {
    logger.error({ err, requestId: req.requestId }, 'unhandled error');
    captureError(err, { requestId: req.requestId });
  }
  res.status(known.status).json({
    success: false,
    error: { code: known.code, message: known.message, details: known.details, requestId: req.requestId },
  });
};
