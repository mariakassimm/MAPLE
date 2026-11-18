import { AppError } from '../../common/errors';

// Guest tracking is protected by order number + phone. The per-IP limiter slows a single attacker; this one stops
// a spread-out guesser from trying many phone numbers against the same order. It counts failures per order number
// whether or not that order exists, so the response never reveals which order numbers are real.
const WINDOW_MS = 15 * 60 * 1000;
export const MAX_FAILURES = 5;
const MAX_TRACKED = 10_000;

const failures = new Map<string, { count: number; since: number }>();

const fresh = (orderNumber: string, now: number) => {
  const f = failures.get(orderNumber);
  if (f && now - f.since > WINDOW_MS) {
    failures.delete(orderNumber);
    return undefined;
  }
  return f;
};

export function assertTrackingAllowed(orderNumber: string, now = Date.now()): void {
  if ((fresh(orderNumber, now)?.count ?? 0) >= MAX_FAILURES) {
    throw new AppError(
      429,
      'RATE_LIMITED',
      'Too many unsuccessful attempts for this order. Please try again in a few minutes, or sign in to view it.',
    );
  }
}

export function recordTrackingFailure(orderNumber: string, now = Date.now()): void {
  const f = fresh(orderNumber, now);
  if (f) f.count += 1;
  else {
    if (failures.size >= MAX_TRACKED) failures.delete(failures.keys().next().value as string); // oldest entry; bounds memory
    failures.set(orderNumber, { count: 1, since: now });
  }
}

export const clearTrackingFailures = (orderNumber?: string): void =>
  orderNumber ? void failures.delete(orderNumber) : failures.clear();
