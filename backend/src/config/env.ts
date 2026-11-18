import 'dotenv/config';
import { z } from 'zod';

const csv = (v: string) =>
  v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

// Empty strings in .env (KEY=) count as "not set".
const optional = z
  .string()
  .optional()
  .transform((v) => v || undefined);

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    MONGODB_URI: z.string().min(1),
    CLIENT_ORIGINS: z.string().min(1).transform(csv),
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),
    SESSION_COOKIE_NAME: z.string().min(1).default('maple_sid'),
    COOKIE_DOMAIN: z
      .string()
      .optional()
      .transform((v) => v || undefined),
    COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
    CUSTOMER_SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(14),
    STAFF_SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(72).default(12),
    CSRF_SECRET: z.string().min(32, 'must be at least 32 characters'),
    BCRYPT_COST: z.coerce.number().int().min(4).max(15).default(12),

    // ---- Payments (Phase 4). Every provider variable is optional: a provider is "configured" only when all of its required ones are set.
    API_PUBLIC_URL: optional,
    // Portfolio / staging switch. With it on, any payment method or courier that has no real credentials is replaced
    // by a clearly-labelled simulation. A provider with real credentials is never simulated.
    DEMO_MODE: z
      .enum(['true', 'false', '1', '0'])
      .default('false')
      .transform((v) => v === 'true' || v === '1'),
    // In production DEMO_MODE refuses to start unless this is also set, so a real store cannot be left in demo mode by accident.
    ALLOW_DEMO_IN_PRODUCTION: z
      .enum(['true', 'false', '1', '0'])
      .default('false')
      .transform((v) => v === 'true' || v === '1'),
    PAYMENT_WINDOW_MINUTES: z.coerce.number().int().min(5).max(1440).default(30),
    JAZZCASH_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
    JAZZCASH_MERCHANT_ID: optional,
    JAZZCASH_PASSWORD: optional,
    JAZZCASH_INTEGRITY_SALT: optional,
    JAZZCASH_PP_VERSION: z.string().default('2.0'),
    JAZZCASH_TXN_TYPE: optional,
    JAZZCASH_PAYMENT_URL: optional,
    JAZZCASH_INQUIRY_URL: optional,
    EASYPAISA_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
    EASYPAISA_STORE_ID: optional,
    EASYPAISA_HASH_KEY: optional,
    EASYPAISA_INQUIRY_URL: optional,
    EASYPAISA_ACCOUNT_NUM: optional,
    EASYPAISA_USERNAME: optional,
    EASYPAISA_PASSWORD: optional,

    // ---- Email (Phase 6). Without RESEND_API_KEY emails are only logged in development.
    RESEND_API_KEY: optional,
    EMAIL_FROM: optional,
    EMAIL_REPLY_TO: optional,

    // ---- Media and monitoring (Phase 6B).
    CLOUDINARY_CLOUD_NAME: optional,
    CLOUDINARY_API_KEY: optional,
    CLOUDINARY_API_SECRET: optional,
    SENTRY_DSN: optional,
    SENTRY_RELEASE: optional,

    // ---- Shipping (Phase 5). A courier is "configured" only when all of its required variables are set.
    SHIP_FROM_NAME: optional,
    SHIP_FROM_PHONE: optional,
    SHIP_FROM_CITY: optional,
    SHIP_FROM_ADDRESS: optional,
    TCS_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
    TCS_USERNAME: optional,
    TCS_PASSWORD: optional,
    TCS_ACCOUNT_NUMBER: optional,
    TCS_COST_CENTER_CODE: optional,
    TCS_SERVICE_CODE: z.string().default('O'),
    LEOPARDS_BASE_URL: optional,
    LEOPARDS_API_KEY: optional,
    LEOPARDS_API_PASSWORD: optional,
  })
  .superRefine((v, ctx) => {
    if (v.CLIENT_ORIGINS.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['CLIENT_ORIGINS'],
        message: 'at least one origin is required',
      });
    }
    const need = (names: (keyof typeof v)[], label: string) => {
      const set = names.filter((n) => v[n]);
      if (set.length > 0 && set.length < names.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [names[0] as string],
          message: `${label}: set all of ${names.join(', ')} or none`,
        });
      }
    };
    need(['JAZZCASH_MERCHANT_ID', 'JAZZCASH_PASSWORD', 'JAZZCASH_INTEGRITY_SALT'], 'JazzCash');
    if (v.RESEND_API_KEY && !v.EMAIL_FROM) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['EMAIL_FROM'],
        message:
          'required when RESEND_API_KEY is set, e.g. "MAPLE <orders@your-domain.pk>" on a domain verified in Resend',
      });
    }
    need(['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'], 'Cloudinary');
    need(['TCS_USERNAME', 'TCS_PASSWORD', 'TCS_ACCOUNT_NUMBER', 'TCS_COST_CENTER_CODE'], 'TCS');
    need(['LEOPARDS_BASE_URL', 'LEOPARDS_API_KEY', 'LEOPARDS_API_PASSWORD'], 'Leopards');
    if (
      (v.TCS_USERNAME || v.LEOPARDS_API_KEY) &&
      !(v.SHIP_FROM_NAME && v.SHIP_FROM_PHONE && v.SHIP_FROM_CITY && v.SHIP_FROM_ADDRESS)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SHIP_FROM_NAME'],
        message:
          'set SHIP_FROM_NAME, SHIP_FROM_PHONE, SHIP_FROM_CITY and SHIP_FROM_ADDRESS when a courier is configured',
      });
    }
    if (v.EASYPAISA_HASH_KEY && ![16, 24, 32].includes(v.EASYPAISA_HASH_KEY.length)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['EASYPAISA_HASH_KEY'],
        message: 'must be 16, 24 or 32 characters',
      });
    }
    if ((v.JAZZCASH_MERCHANT_ID || v.EASYPAISA_STORE_ID) && !v.API_PUBLIC_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['API_PUBLIC_URL'],
        message: 'required when a payment provider is configured (providers call back to it)',
      });
    }
    if (v.NODE_ENV === 'production' && v.DEMO_MODE) {
      // Demo mode lets anyone "approve" a fake payment. That is fine for a portfolio site and a disaster for a real shop.
      if (!v.ALLOW_DEMO_IN_PRODUCTION) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['DEMO_MODE'],
          message:
            'simulates payments and couriers and must not run on a real store. For a portfolio or staging site with no real customers, also set ALLOW_DEMO_IN_PRODUCTION=true',
        });
      }
      if (v.JAZZCASH_MERCHANT_ID || v.EASYPAISA_STORE_ID || v.TCS_USERNAME || v.LEOPARDS_API_KEY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['DEMO_MODE'],
          message:
            'real payment or courier credentials are set, so DEMO_MODE must be false (a half-simulated store would take fake payments)',
        });
      }
    }
    if (v.NODE_ENV === 'production') {
      if (v.API_PUBLIC_URL && !v.API_PUBLIC_URL.startsWith('https://')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['API_PUBLIC_URL'],
          message: 'must be https:// in production',
        });
      }
      if (v.BCRYPT_COST < 12) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['BCRYPT_COST'], message: 'must be >= 12 in production' });
      }
      if (v.CLIENT_ORIGINS.some((o) => !o.startsWith('https://'))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['CLIENT_ORIGINS'],
          message: 'must be https:// in production',
        });
      }
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Only variable names and rules are printed, never values, so secrets cannot leak into logs.
  const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
  console.error(`Invalid environment configuration:\n${lines.join('\n')}`);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
