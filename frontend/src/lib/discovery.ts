import type { Facets, ProductQuery } from '@/types/api';

/**
 * Product discovery rules shared by Shop, every Collection and New Arrivals. The URL is the single source of truth:
 * everything below turns query parameters into one validated state, and back, so filters, sorting and pagination always
 * work together and a shared link reproduces the same results.
 */
export type Mode = 'shop' | 'collection' | 'new';

export const PAGE_SIZE = 12;

export const SORTS = [
  { value: 'featured', label: 'Featured' },
  { value: 'newest', label: 'Newest' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
] as const;
export type SortValue = (typeof SORTS)[number]['value'];

export interface DiscoveryState {
  sort: SortValue;
  /** Price bounds in whole rupees (the URL and the slider speak rupees; the API speaks paisa). */
  min?: number;
  max?: number;
  inStock: boolean;
  q?: string;
  page: number;
  /** Set on a collection page by the route, and by ?category= on Shop and New Arrivals. */
  category?: string;
}

export const defaultSort = (mode: Mode): SortValue => (mode === 'new' ? 'newest' : 'featured');

const whole = (v: string | null): number | undefined => (v && /^\d{1,7}$/.test(v) ? Number(v) : undefined);

/** Anything invalid or out of order in the URL falls back to a safe value instead of an empty or broken page. */
export function parseState(params: URLSearchParams, mode: Mode, slug?: string): DiscoveryState {
  const sortParam = params.get('sort');
  const sort = SORTS.find((s) => s.value === sortParam)?.value ?? defaultSort(mode);
  let min = whole(params.get('min'));
  let max = whole(params.get('max'));
  if (min !== undefined && max !== undefined && min > max) [min, max] = [max, min];
  const page = Math.max(1, whole(params.get('page')) ?? 1);
  const raw = mode === 'collection' ? slug : params.get('category');
  const category = raw && /^[a-z0-9-]{1,80}$/.test(raw) ? raw : undefined;
  const q = params.get('q')?.trim().slice(0, 100) || undefined;
  return { sort, min, max, inStock: params.get('stock') === '1', q, page, category };
}

/** Only values that differ from the defaults are written, which keeps shared links short and clean. */
export function toParams(state: DiscoveryState, mode: Mode): URLSearchParams {
  const p = new URLSearchParams();
  if (state.category && mode !== 'collection') p.set('category', state.category);
  if (state.sort !== defaultSort(mode)) p.set('sort', state.sort);
  if (state.min !== undefined) p.set('min', String(state.min));
  if (state.max !== undefined) p.set('max', String(state.max));
  if (state.inStock) p.set('stock', '1');
  if (state.q) p.set('q', state.q);
  if (state.page > 1) p.set('page', String(state.page));
  return p;
}

export function toApiQuery(state: DiscoveryState, mode: Mode): ProductQuery {
  return {
    page: state.page,
    limit: PAGE_SIZE,
    sort: state.sort,
    category: state.category,
    q: state.q,
    new: mode === 'new' ? true : undefined,
    minPrice: state.min !== undefined ? state.min * 100 : undefined,
    maxPrice: state.max !== undefined ? state.max * 100 : undefined,
    availability: state.inStock ? 'in_stock' : undefined,
  };
}

/** Slider bounds from the real price range of the products in this scope, rounded outwards to a friendly step. */
export function priceBounds(
  facets: Pick<Facets, 'priceRange'> | undefined,
): { min: number; max: number; step: number } | null {
  const range = facets?.priceRange;
  if (!range) return null;
  const lo = range.min / 100,
    hi = range.max / 100;
  const span = hi - lo;
  const step = span > 200_000 ? 1000 : span > 40_000 ? 500 : span > 8_000 ? 100 : 50;
  const min = Math.floor(lo / step) * step,
    max = Math.ceil(hi / step) * step;
  return max > min ? { min, max, step } : null;
}

/** A price filter only counts as active when it actually narrows the range. */
export function priceIsActive(
  state: Pick<DiscoveryState, 'min' | 'max'>,
  bounds: { min: number; max: number } | null,
): boolean {
  if (state.min === undefined && state.max === undefined) return false;
  if (!bounds) return true;
  return (state.min ?? bounds.min) > bounds.min || (state.max ?? bounds.max) < bounds.max;
}

/** 1 … 4 5 [6] 7 8 … 20 style page list. */
export function pageList(current: number, total: number): (number | 'gap')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | 'gap')[] = [1];
  const from = Math.max(2, current - 1),
    to = Math.min(total - 1, current + 1);
  if (from > 2) out.push('gap');
  for (let p = from; p <= to; p++) out.push(p);
  if (to < total - 1) out.push('gap');
  out.push(total);
  return out;
}

/** Link for a category: clean collection URL where there is one, a ?category= filter on New Arrivals. Sort, stock and search carry over. */
export function categoryHref(mode: Mode, slug: string | null, state: DiscoveryState): string {
  const carry = { ...state, category: undefined, min: undefined, max: undefined, page: 1 }; // price bounds differ per category, so they reset
  if (mode === 'new') {
    const qs = toParams({ ...carry, category: slug ?? undefined }, 'new').toString();
    return `/new-arrivals${qs ? `?${qs}` : ''}`;
  }
  const qs = toParams(carry, slug ? 'collection' : 'shop').toString();
  return `${slug ? `/collections/${slug}` : '/shop'}${qs ? `?${qs}` : ''}`;
}
