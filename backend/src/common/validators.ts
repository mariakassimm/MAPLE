import { z } from 'zod';

export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
export const idParamSchema = z.object({ id: objectIdSchema }).strict();

export const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address').max(254);
export const nameSchema = z.string().trim().min(2, 'Name is too short').max(80, 'Name is too long');

// bcrypt ignores everything after 72 bytes, so a longer password would silently weaken itself.
export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(72, 'Password must be at most 72 characters')
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a number');

/** Mirrors PK_MOBILE in frontend/src/lib/format.ts (the browser pre-checks, this is the authority). Keep the two in step. */
const PK_MOBILE = /^(?:\+92|92|0)?(3[0-4]\d{8})$/;

export const normalizePkMobile = (raw: string): string | null => {
  const match = PK_MOBILE.exec(raw.replace(/[\s-]/g, ''));
  return match ? `+92${match[1]}` : null;
};

export const pkMobileSchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const normalized = normalizePkMobile(value);
    if (!normalized) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Enter a valid Pakistani mobile number, e.g. 0300 1234567',
      });
      return z.NEVER;
    }
    return normalized;
  });

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single dashes');

export const queryBoolean = z.enum(['true', 'false']).transform((v) => v === 'true');

export const couponCodeSchema = z
  .string()
  .trim()
  .min(3)
  .max(32)
  .regex(/^[A-Za-z0-9_-]+$/, 'Use letters, numbers, dash or underscore')
  .transform((v) => v.toUpperCase());
