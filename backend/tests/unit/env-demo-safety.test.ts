import { describe, expect, it } from 'vitest';
import { envSchema } from '../../src/config/env';

const production = {
  NODE_ENV: 'production', MONGODB_URI: 'mongodb://x/y', CLIENT_ORIGINS: 'https://shop.example.pk', CSRF_SECRET: 'x'.repeat(40), BCRYPT_COST: '12',
  API_PUBLIC_URL: 'https://api.example.pk',
};
const issues = (env: Record<string, string>) => {
  const r = envSchema.safeParse(env);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
};

describe('DEMO_MODE cannot silently run a real store', () => {
  it('is fine in production without demo mode', () => {
    expect(issues(production)).toEqual([]);
  });

  it('refuses to start in production unless explicitly allowed', () => {
    expect(issues({ ...production, DEMO_MODE: 'true' }).join()).toMatch(/ALLOW_DEMO_IN_PRODUCTION/);
    expect(issues({ ...production, DEMO_MODE: 'true', ALLOW_DEMO_IN_PRODUCTION: 'true' })).toEqual([]);
  });

  it('refuses demo mode next to real provider credentials, even when allowed', () => {
    const jazz = { JAZZCASH_MERCHANT_ID: 'M1', JAZZCASH_PASSWORD: 'p', JAZZCASH_INTEGRITY_SALT: 's' };
    expect(issues({ ...production, ...jazz, DEMO_MODE: 'true', ALLOW_DEMO_IN_PRODUCTION: 'true' }).join()).toMatch(/must be false/);
  });

  it('does not restrict development', () => {
    expect(issues({ ...production, NODE_ENV: 'development', CLIENT_ORIGINS: 'http://localhost:5173', BCRYPT_COST: '4', API_PUBLIC_URL: 'http://localhost:4000', DEMO_MODE: 'true' })).toEqual([]);
  });
});
