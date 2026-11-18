import bcrypt from 'bcryptjs';
import { AppError } from '../../common/errors';
import { csrfTokenFor, randomToken, sha256Hex } from '../../common/crypto';
import { isStaff, type Role } from '../../common/permissions';
import { env } from '../../config/env';
import { clientUrl } from '../notifications/links';
import { deliver, fire } from '../notifications/notify';
import * as templates from '../notifications/templates';
import { User, type UserDocument } from '../users/user.model';
import { hashPassword, insertUser } from '../users/user.service';
import { Session } from './session.model';

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const RESET_TOKEN_MINUTES = 60;

// Staff sessions are short because their accounts can move money and change stock.
const sessionTtlMs = (role: Role): number =>
  isStaff(role) ? env.STAFF_SESSION_TTL_HOURS * 3_600_000 : env.CUSTOMER_SESSION_TTL_DAYS * 86_400_000;

export interface SessionAuth {
  userId: string;
  role: Role;
  sessionId: string;
  csrfToken: string;
}

export async function createSession(user: UserDocument, meta: { ip?: string; userAgent?: string }) {
  const token = randomToken();
  const tokenHash = sha256Hex(token);
  const ttlMs = sessionTtlMs(user.role);
  await Session.create({
    userId: user._id,
    tokenHash,
    expiresAt: new Date(Date.now() + ttlMs),
    ip: meta.ip,
    userAgent: meta.userAgent?.slice(0, 300),
  });
  return { token, ttlMs, csrfToken: csrfTokenFor(tokenHash) };
}

export async function resolveSession(token: string): Promise<SessionAuth | null> {
  const tokenHash = sha256Hex(token);
  const session = await Session.findOne({ tokenHash, expiresAt: { $gt: new Date() } });
  if (!session) return null;
  // Role and status are read fresh on every request so suspending a user or changing a role takes effect immediately.
  const user = await User.findById(session.userId).select('role status');
  if (!user || user.status !== 'active') {
    await Session.deleteOne({ _id: session._id });
    return null;
  }
  return {
    userId: String(user._id),
    role: user.role,
    sessionId: String(session._id),
    csrfToken: csrfTokenFor(tokenHash),
  };
}

export const revokeSessionByToken = (token: string) => Session.deleteOne({ tokenHash: sha256Hex(token) });
export const revokeSession = (sessionId: string) => Session.deleteOne({ _id: sessionId });
export const revokeUserSessions = (userId: string) => Session.deleteMany({ userId });

export async function sendVerificationEmail(user: Pick<UserDocument, '_id' | 'email' | 'name'>): Promise<void> {
  const token = randomToken();
  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        emailVerificationTokenHash: sha256Hex(token),
        emailVerificationExpiresAt: new Date(Date.now() + 48 * 3_600_000),
      },
    },
  );
  const verifyUrl = clientUrl('/verify-email', { token });
  fire(() =>
    deliver({
      to: user.email,
      ...templates.verifyEmail(user.name, verifyUrl),
      template: 'verify_email',
      meta: { verifyUrl },
    }),
  );
}

export async function registerCustomer(input: {
  name: string;
  email: string;
  phone?: string;
  password: string;
}): Promise<UserDocument> {
  const user = await insertUser({ ...input, role: 'customer' });
  fire(() => deliver({ to: user.email, ...templates.welcome(user.name, clientUrl('/shop')), template: 'welcome' }));
  await sendVerificationEmail(user);
  return user;
}

export async function verifyEmail(token: string): Promise<void> {
  // One atomic step: matching and consuming the token together makes it single-use.
  const user = await User.findOneAndUpdate(
    { emailVerificationTokenHash: sha256Hex(token), emailVerificationExpiresAt: { $gt: new Date() } },
    { $set: { emailVerified: true }, $unset: { emailVerificationTokenHash: 1, emailVerificationExpiresAt: 1 } },
  );
  if (!user) throw new AppError(400, 'BAD_REQUEST', 'This confirmation link is invalid or has expired.');
}

// Computed lazily and once: used to spend the same bcrypt time when the email is unknown,
// so response timing does not reveal which emails have accounts.
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= bcrypt.hash('maple-timing-equalizer', env.BCRYPT_COST));

async function registerFailedLogin(userId: UserDocument['_id']): Promise<void> {
  // $inc is atomic, so parallel guesses cannot dodge the counter.
  const updated = await User.findByIdAndUpdate(userId, { $inc: { failedLoginCount: 1 } }, { new: true });
  if (updated && updated.failedLoginCount >= MAX_FAILED_LOGINS) {
    await User.updateOne(
      { _id: userId },
      { $set: { failedLoginCount: 0, lockUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) } },
    );
  }
}

export async function authenticate(email: string, password: string): Promise<UserDocument> {
  const user = await User.findOne({ email }).select('+passwordHash');
  const locked = !!user?.lockUntil && user.lockUntil > new Date();
  const matches = await bcrypt.compare(password, user?.passwordHash ?? (await getDummyHash()));

  // One generic error for unknown email, wrong password, lockout and suspension: nothing to enumerate.
  if (!user || locked || !matches || user.status !== 'active') {
    if (user && !locked && !matches) await registerFailedLogin(user._id);
    throw new AppError(401, 'UNAUTHENTICATED', 'Invalid email or password.');
  }

  await User.updateOne(
    { _id: user._id },
    { $set: { failedLoginCount: 0, lastLoginAt: new Date() }, $unset: { lockUntil: 1 } },
  );
  return user;
}

export async function requestPasswordReset(email: string): Promise<void> {
  const user = await User.findOne({ email, status: 'active' });
  if (!user) return;
  const token = randomToken();
  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        passwordResetTokenHash: sha256Hex(token),
        passwordResetExpiresAt: new Date(Date.now() + RESET_TOKEN_MINUTES * 60_000),
      },
    },
  );
  const resetUrl = clientUrl('/reset-password', { token });
  // Not awaited: mail latency would otherwise reveal whether the account exists. A mail failure is logged, never surfaced.
  fire(() =>
    deliver({
      to: user.email,
      ...templates.passwordReset(user.name, resetUrl),
      template: 'password_reset',
      meta: { resetUrl },
    }),
  );
}

export async function resetPassword(token: string, newPassword: string): Promise<UserDocument> {
  const passwordHash = await hashPassword(newPassword);
  // Matching and consuming the token in one atomic update makes it strictly single-use.
  const user = await User.findOneAndUpdate(
    { passwordResetTokenHash: sha256Hex(token), passwordResetExpiresAt: { $gt: new Date() } },
    {
      $set: { passwordHash, failedLoginCount: 0 },
      $unset: { passwordResetTokenHash: 1, passwordResetExpiresAt: 1, lockUntil: 1 },
    },
  );
  if (!user) throw new AppError(400, 'BAD_REQUEST', 'This reset link is invalid or has expired.');
  // Anyone holding an old session (possibly the attacker who forced the reset) is signed out.
  await revokeUserSessions(String(user._id));
  return user;
}
