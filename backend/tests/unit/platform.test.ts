import { createHash } from 'crypto';
import { describe, expect, it } from 'vitest';
import { captureError } from '../../src/config/sentry';
import { homePatchSchema, pageCreateSchema, siteSchema } from '../../src/modules/content/content.schemas';
import { signCloudinaryParams } from '../../src/modules/media/cloudinary';
import { dayEnd, dayStart, resolveRange } from '../../src/modules/reports/dashboard.service';

describe('Cloudinary upload signature', () => {
  it("reproduces the worked example in Cloudinary's documentation", () => {
    const params = { eager: 'w_400,h_300,c_pad|w_260,h_200,c_crop', public_id: 'sample_image', timestamp: 1315060510 };
    expect(signCloudinaryParams(params, 'abcd')).toBe('bfd09f95f331f558cbd1320e67aa8d488770583e');
  });
  it('ignores parameter order and the fields Cloudinary says are never signed', () => {
    const a = signCloudinaryParams({ timestamp: 1, folder: 'maple/products' }, 's');
    const b = signCloudinaryParams({ folder: 'maple/products', file: 'data:...', api_key: 'k', cloud_name: 'c', resource_type: 'image', timestamp: 1, empty: '' }, 's');
    expect(a).toBe(b);
    expect(a).toBe(createHash('sha1').update('folder=maple/products&timestamp=1s').digest('hex'));
  });
  it('depends on the secret and on every signed value', () => {
    const base = { folder: 'maple/products', timestamp: 1 };
    expect(signCloudinaryParams(base, 's1')).not.toBe(signCloudinaryParams(base, 's2'));
    expect(signCloudinaryParams({ ...base, folder: 'maple/content' }, 's1')).not.toBe(signCloudinaryParams(base, 's1'));
  });
});

describe('editable content rules', () => {
  const hero = { label: 'L', headline: 'H', subheadline: 'S', ctaLabel: 'GO', ctaUrl: '/shop', image: null, imageMobile: null, videoUrl: null, videoPoster: null };

  it.each(['/shop', '/collections/handbags', '/products/tote?x=1'])('accepts the internal link %s', (ctaUrl) => {
    expect(homePatchSchema.safeParse({ hero: { ...hero, ctaUrl } }).success).toBe(true);
  });
  it.each(['https://evil.example', '//evil.example', 'javascript:alert(1)', 'shop', '/ spaced', ''])('rejects the link "%s"', (ctaUrl) => {
    expect(homePatchSchema.safeParse({ hero: { ...hero, ctaUrl } }).success).toBe(false);
  });
  it('requires https for images, videos and social links', () => {
    expect(homePatchSchema.safeParse({ hero: { ...hero, image: { url: 'http://x.test/a.jpg', alt: 'Campaign' } } }).success).toBe(false);
    expect(homePatchSchema.safeParse({ hero: { ...hero, image: { url: 'https://x.test/a.jpg', alt: 'Campaign' } } }).success).toBe(true);
    expect(homePatchSchema.safeParse({ hero: { ...hero, videoUrl: 'javascript:alert(1)' } }).success).toBe(false);
    expect(siteSchema.shape.social.safeParse({ instagram: 'http://instagram.com/maple' }).success).toBe(false);
    expect(siteSchema.shape.social.safeParse({ instagram: 'https://instagram.com/maple' }).success).toBe(true);
  });
  it('rejects unknown sections and empty patches', () => {
    expect(homePatchSchema.safeParse({ surprise: {} }).success).toBe(false);
    expect(homePatchSchema.safeParse({}).success).toBe(false);
  });
  it('needs a category or a title and link for a featured collection', () => {
    expect(homePatchSchema.safeParse({ collections: [{ categorySlug: 'handbags' }] }).success).toBe(true);
    expect(homePatchSchema.safeParse({ collections: [{ title: 'Gifts', url: '/shop' }] }).success).toBe(true);
    expect(homePatchSchema.safeParse({ collections: [{ title: 'Gifts' }] }).success).toBe(false);
    expect(homePatchSchema.safeParse({ collections: Array(7).fill({ categorySlug: 'a-b' }) }).success).toBe(false);
  });
  it('validates page slugs', () => {
    expect(pageCreateSchema.safeParse({ slug: 'shipping-policy', title: 'Shipping' }).success).toBe(true);
    expect(pageCreateSchema.safeParse({ slug: 'Shipping Policy!', title: 'Shipping' }).success).toBe(false);
  });
});

describe('report date ranges', () => {
  it('treats a typed date as a whole Pakistan day', () => {
    expect(dayStart('2026-11-07').toISOString()).toBe('2026-11-06T19:00:00.000Z');
    expect(dayEnd('2026-11-07').toISOString()).toBe('2026-11-07T18:59:59.999Z');
  });
  it('defaults to the last 30 days ending now', () => {
    const now = new Date('2026-11-07T10:00:00Z');
    const r = resolveRange(undefined, undefined, now);
    expect(r.to).toEqual(now);
    expect(r.from.toISOString()).toBe('2026-10-08T19:00:00.000Z');
  });
});

describe('error monitoring', () => {
  it('is a silent no-op until a DSN is configured', () => {
    expect(() => captureError(new Error('boom'), { requestId: 'abc' })).not.toThrow();
  });
});
