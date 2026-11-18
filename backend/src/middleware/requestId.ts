import { randomUUID } from 'crypto';
import type { RequestHandler } from 'express';

// A caller-supplied id is accepted only if it is a short, harmless token, so it is safe to echo into logs and headers.
const SAFE_ID = /^[\w-]{8,64}$/;

export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.get('x-request-id');
  req.requestId = incoming && SAFE_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
};
