import type { Response } from 'express';

// One success envelope for every endpoint; errors use the shape produced by errorHandler.
export const sendOk = <T>(res: Response, data: T, status = 200): Response =>
  res.status(status).json({ success: true, data });
