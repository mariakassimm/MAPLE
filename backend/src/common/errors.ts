export type ErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'STAFF_ACCOUNT'
  | 'CSRF_INVALID'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INSUFFICIENT_STOCK'
  | 'COUPON_INVALID'
  | 'PRICE_CHANGED'
  | 'ITEMS_UNAVAILABLE'
  | 'NOT_SERVICEABLE'
  | 'PAYMENT_METHOD_UNAVAILABLE'
  | 'IDEMPOTENCY_CONFLICT'
  | 'INVALID_TRANSITION'
  | 'COURIER_UNAVAILABLE'
  | 'COURIER_REJECTED'
  | 'COURIER_UNCERTAIN'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'SERVICE_UNAVAILABLE';

export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(status: number, code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const isDuplicateKeyError = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;

// Names the unique index that was violated so callers can give a specific message.
export const duplicateKeyFields = (err: unknown): string[] =>
  Object.keys((err as { keyPattern?: Record<string, unknown> } | null)?.keyPattern ?? {});
