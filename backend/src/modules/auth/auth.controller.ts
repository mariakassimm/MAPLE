import type { CookieOptions, Request, Response } from 'express';
import { AppError } from '../../common/errors';
import { asyncHandler } from '../../common/asyncHandler';
import { isStaff } from '../../common/permissions';
import { sendOk } from '../../common/response';
import { env, isProd } from '../../config/env';
import { assertCsrf } from '../../middleware/auth';
import { auditContext, recordAudit } from '../audit/audit.service';
import { User, toPublicUser, type UserDocument } from '../users/user.model';
import * as authService from './auth.service';

const cookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: isProd,
  sameSite: env.COOKIE_SAMESITE,
  domain: env.COOKIE_DOMAIN,
  path: '/',
});

async function startSession(req: Request, res: Response, user: UserDocument, status = 200) {
  const session = await authService.createSession(user, { ip: req.ip, userAgent: req.get('user-agent') });
  res.cookie(env.SESSION_COOKIE_NAME, session.token, { ...cookieOptions(), maxAge: session.ttlMs });
  sendOk(res, { user: toPublicUser(user), csrfToken: session.csrfToken }, status);
}

export const register = asyncHandler(async (req, res) => {
  const user = await authService.registerCustomer(req.body);
  await startSession(req, res, user, 201);
});

export const login = asyncHandler(async (req, res) => {
  const user = await authService.authenticate(req.body.email, req.body.password);
  // The admin sign-in only ever opens staff accounts. A customer who types their details there gets the same
  // generic answer as a wrong password, and no session is created, so the page reveals nothing about accounts.
  if (req.body.portal === 'admin' && !isStaff(user.role))
    throw new AppError(401, 'UNAUTHENTICATED', 'Invalid email or password.');
  // A fresh sign-in replaces any session this browser already held (no session carry-over between accounts).
  const previous: unknown = req.cookies?.[env.SESSION_COOKIE_NAME];
  if (typeof previous === 'string' && previous) await authService.revokeSessionByToken(previous);
  if (isStaff(user.role)) {
    await recordAudit({
      ...auditContext(req),
      actorId: String(user._id),
      actorRole: user.role,
      action: 'auth.login',
      resourceType: 'user',
      resourceId: String(user._id),
    });
  }
  await startSession(req, res, user);
});

// Idempotent: always clears the cookie, and only revokes when a valid session (with a valid CSRF token) exists.
export const logout = asyncHandler(async (req, res) => {
  assertCsrf(req);
  if (req.auth) await authService.revokeSession(req.auth.sessionId);
  // clearCookie must repeat domain/path or browsers keep the cookie; maxAge is omitted on purpose.
  res.clearCookie(env.SESSION_COOKIE_NAME, cookieOptions());
  sendOk(res, { loggedOut: true });
});

export const me = asyncHandler(async (req, res) => {
  const user = await User.findById(req.auth?.userId);
  if (!user || !req.auth) throw new AppError(401, 'UNAUTHENTICATED', 'Please sign in to continue.');
  sendOk(res, { user: toPublicUser(user), csrfToken: req.auth.csrfToken });
});

export const verifyEmail = asyncHandler(async (req, res) => {
  await authService.verifyEmail(req.body.token);
  sendOk(res, { verified: true });
});

export const resendVerification = asyncHandler(async (req, res) => {
  const user = await User.findById(req.auth!.userId);
  if (user && !user.emailVerified) await authService.sendVerificationEmail(user);
  sendOk(res, { sent: !!user && !user.emailVerified });
});

// Same answer whether or not the email exists.
export const forgotPassword = asyncHandler(async (req, res) => {
  await authService.requestPasswordReset(req.body.email);
  sendOk(res, { message: 'If an account exists for that email, a reset link has been sent.' });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const user = await authService.resetPassword(req.body.token, req.body.password);
  if (isStaff(user.role)) {
    await recordAudit({
      ...auditContext(req),
      actorId: String(user._id),
      actorRole: user.role,
      action: 'auth.password_reset',
      resourceType: 'user',
      resourceId: String(user._id),
    });
  }
  sendOk(res, { message: 'Password updated. Please sign in with your new password.' });
});
