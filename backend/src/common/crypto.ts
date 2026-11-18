import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { env } from '../config/env';

export const randomToken = (bytes = 32): string => randomBytes(bytes).toString('base64url');

export const sha256Hex = (value: string): string => createHash('sha256').update(value).digest('hex');

// Only the hash of a session token is stored, so a database leak cannot be replayed as live sessions.
// The CSRF token is derived from that hash, which binds it to exactly one session without extra storage.
export const csrfTokenFor = (sessionTokenHash: string): string =>
  createHmac('sha256', env.CSRF_SECRET).update(sessionTokenHash).digest('base64url');

// Hashing first gives equal-length buffers, which timingSafeEqual requires.
export const safeEqual = (a: string, b: string): boolean =>
  timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
