import type { Request, RequestHandler } from 'express';
import { AppError } from '../common/errors';
import { asyncHandler } from '../common/asyncHandler';
import { safeEqual } from '../common/crypto';
import { hasPermission, isStaff, type Permission } from '../common/permissions';
import { env } from '../config/env';
import { resolveSession } from '../modules/auth/auth.service';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Populates req.auth when a valid session cookie is present; never rejects, so public routes stay public.
export const attachAuth: RequestHandler = asyncHandler(async (req, _res, next) => {
  const token: unknown = req.cookies?.[env.SESSION_COOKIE_NAME];
  if (typeof token === 'string' && token.length > 0) {
    const auth = await resolveSession(token);
    if (auth) req.auth = auth;
  }
  next();
});

// CSRF is enforced here (not in attachAuth) because a stale cookie must not block login or registration.
// Any route that acts on behalf of a cookie-authenticated user must pass through requireAuth or call this.
export function assertCsrf(req: Request): void {
  if (!req.auth || SAFE_METHODS.has(req.method)) return;
  const sent = req.get('x-csrf-token');
  if (!sent || !safeEqual(sent, req.auth.csrfToken)) {
    throw new AppError(403, 'CSRF_INVALID', 'Invalid or missing CSRF token.');
  }
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.auth) return next(new AppError(401, 'UNAUTHENTICATED', 'Please sign in to continue.'));
  assertCsrf(req);
  next();
};

// Storefront actions that belong to a shopper (bag, orders, addresses, reviews). Staff accounts are administrators,
// not shoppers: they are refused here on the server, whatever the frontend shows.
const NOT_A_SHOPPER = () =>
  new AppError(
    403,
    'STAFF_ACCOUNT',
    'Administrator accounts cannot use the shop. Please sign in with a customer account.',
  );

export const requireCustomer: RequestHandler = (req, _res, next) => {
  if (!req.auth) return next(new AppError(401, 'UNAUTHENTICATED', 'Please sign in to continue.'));
  if (isStaff(req.auth.role)) return next(NOT_A_SHOPPER());
  assertCsrf(req);
  next();
};

// For endpoints guests may use too (placing an order, starting a return): anonymous is fine, a staff session is not.
export const forbidStaff: RequestHandler = (req, _res, next) => {
  if (req.auth && isStaff(req.auth.role)) return next(NOT_A_SHOPPER());
  next();
};

export const requireStaff: RequestHandler = (req, _res, next) => {
  if (!req.auth) return next(new AppError(401, 'UNAUTHENTICATED', 'Please sign in to continue.'));
  if (!isStaff(req.auth.role)) return next(new AppError(403, 'FORBIDDEN', 'You do not have access to this area.'));
  next();
};

// Lets one endpoint serve several roles (e.g. image uploads for catalogue editors and content editors alike).
export const requireAnyPermission =
  (...permissions: Permission[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.auth) return next(new AppError(401, 'UNAUTHENTICATED', 'Please sign in to continue.'));
    if (!permissions.some((p) => hasPermission(req.auth!.role, p))) {
      return next(new AppError(403, 'FORBIDDEN', 'You do not have permission to perform this action.'));
    }
    next();
  };

export const requirePermission =
  (permission: Permission): RequestHandler =>
  (req, _res, next) => {
    if (!req.auth) return next(new AppError(401, 'UNAUTHENTICATED', 'Please sign in to continue.'));
    if (!hasPermission(req.auth.role, permission)) {
      return next(new AppError(403, 'FORBIDDEN', 'You do not have permission to perform this action.'));
    }
    next();
  };
