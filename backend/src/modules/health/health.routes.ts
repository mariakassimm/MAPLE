import { Router } from 'express';
import mongoose from 'mongoose';
import { AppError } from '../../common/errors';

export const healthRouter = Router();

// Liveness: the process is up. Used by the host to decide whether to restart.
healthRouter.get('/', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', uptimeSeconds: Math.round(process.uptime()) } });
});

// Readiness: the database is reachable. Used by the host to decide whether to route traffic.
healthRouter.get('/ready', (_req, res, next) => {
  if (mongoose.connection.readyState !== 1)
    return next(new AppError(503, 'SERVICE_UNAVAILABLE', 'Database is not connected.'));
  res.json({ success: true, data: { status: 'ready' } });
});
