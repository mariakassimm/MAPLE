import { describe, expect, it } from 'vitest';
import { effectivePrice, isOnSale } from '../../src/common/money';
import { escapeRegex, slugify } from '../../src/common/text';

describe('slugify', () => {
  it.each([
    ['Maple Leather Tote', 'maple-leather-tote'],
    ['  Café  Crème  ', 'cafe-creme'],
    ['Men\'s Watch (Rose Gold) #2', 'men-s-watch-rose-gold-2'],
    ['!!!', 'item'],
    ['ایک', 'item'],
  ])('%s -> %s', (input, expected) => expect(slugify(input)).toBe(expected));

  it('caps length without leaving a trailing dash', () => {
    const slug = slugify('a'.repeat(79) + ' b');
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith('-')).toBe(false);
  });
});

describe('escapeRegex', () => {
  it('neutralises metacharacters so user text matches literally', () => {
    const rx = new RegExp(escapeRegex('a.*(b)'), 'i');
    expect(rx.test('xx A.*(B) yy')).toBe(true);
    expect(rx.test('aXXb')).toBe(false);
  });
});

describe('money', () => {
  it('uses the sale price only when it is lower', () => {
    expect(effectivePrice(1000, 800)).toBe(800);
    expect(effectivePrice(1000, 1000)).toBe(1000);
    expect(effectivePrice(1000, 1200)).toBe(1000);
    expect(effectivePrice(1000, null)).toBe(1000);
    expect(isOnSale(1000, 800)).toBe(true);
    expect(isOnSale(1000, undefined)).toBe(false);
  });
});
