import { describe, expect, it } from 'vitest';
import { categoryHref, pageList, parseState, priceBounds, priceIsActive, toApiQuery, toParams } from '@/lib/discovery';

const parse = (qs: string, mode: 'shop' | 'collection' | 'new' = 'shop', slug?: string) =>
  parseState(new URLSearchParams(qs), mode, slug);

describe('parseState', () => {
  it('uses Featured for shop and collections, Newest for new arrivals', () => {
    expect(parse('').sort).toBe('featured');
    expect(parse('', 'new').sort).toBe('newest');
  });
  it('falls back safely for invalid values', () => {
    const s = parse('sort=banana&min=abc&max=-5&page=0&category=%3Cscript%3E&stock=yes');
    expect(s).toMatchObject({
      sort: 'featured',
      min: undefined,
      max: undefined,
      page: 1,
      category: undefined,
      inStock: false,
    });
  });
  it('puts a reversed price range the right way round', () =>
    expect(parse('min=9000&max=1000')).toMatchObject({ min: 1000, max: 9000 }));
  it('takes the category from the route on a collection page, and from ?category= elsewhere', () => {
    expect(parse('category=ignored', 'collection', 'watches').category).toBe('watches');
    expect(parse('category=watches', 'new').category).toBe('watches');
  });
});

describe('toParams / toApiQuery', () => {
  it('round-trips every filter together without dropping any', () => {
    const qs = 'category=watches&sort=price_asc&min=1000&max=9000&stock=1&q=gold&page=2';
    expect(Object.fromEntries(toParams(parse(qs, 'new'), 'new'))).toEqual(Object.fromEntries(new URLSearchParams(qs)));
  });
  it('omits defaults and keeps collection categories out of the query string', () => {
    expect(toParams(parse('', 'shop'), 'shop').toString()).toBe('');
    expect(toParams(parse('sort=newest', 'collection', 'watches'), 'collection').toString()).toBe('sort=newest');
  });
  it('sends paisa, in-stock and the new-arrivals scope to the API', () => {
    expect(toApiQuery(parse('min=100&max=200&stock=1', 'new'), 'new')).toMatchObject({
      minPrice: 10000,
      maxPrice: 20000,
      availability: 'in_stock',
      new: true,
      sort: 'newest',
    });
    expect(toApiQuery(parse(''), 'shop').new).toBeUndefined();
  });
});

describe('price bounds', () => {
  it('rounds the real range outwards to a friendly step', () => {
    expect(priceBounds({ priceRange: { min: 123_400, max: 8_765_000 } })).toEqual({
      min: 1000,
      max: 88_000,
      step: 500,
    });
  });
  it('has no slider when there is nothing to choose between', () => {
    expect(priceBounds({ priceRange: null })).toBeNull();
    expect(priceBounds({ priceRange: { min: 500_000, max: 500_000 } })).toBeNull();
  });
  it('only counts a price filter that narrows the range', () => {
    const b = { min: 1000, max: 9000 };
    expect(priceIsActive({ min: 1000, max: 9000 }, b)).toBe(false);
    expect(priceIsActive({ min: 2000, max: undefined }, b)).toBe(true);
  });
});

describe('categoryHref', () => {
  const state = parse('sort=price_desc&stock=1&min=500&page=3');
  it('carries sort and stock, resets price and page', () => {
    expect(categoryHref('shop', 'jewellery', state)).toBe('/collections/jewellery?sort=price_desc&stock=1');
    expect(categoryHref('shop', null, state)).toBe('/shop?sort=price_desc&stock=1');
  });
  it('uses a category filter on new arrivals', () =>
    expect(categoryHref('new', 'watches', parse('', 'new'))).toBe('/new-arrivals?category=watches'));
});

describe('pageList', () => {
  it('shows everything for short lists and gaps for long ones', () => {
    expect(pageList(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageList(6, 20)).toEqual([1, 'gap', 5, 6, 7, 'gap', 20]);
  });
});
