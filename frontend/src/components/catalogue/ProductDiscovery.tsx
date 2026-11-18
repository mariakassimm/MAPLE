import { SlidersHorizontal, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { FilterPanel } from '@/components/catalogue/FilterPanel';
import { Pagination } from '@/components/catalogue/Pagination';
import { ProductCard, ProductGridSkeleton } from '@/components/product/ProductCard';
import { Drawer } from '@/components/ui/Drawer';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { useCategories, useFacets, useProducts } from '@/hooks/queries';
import { cn } from '@/lib/cn';
import {
  categoryHref,
  PAGE_SIZE,
  parseState,
  priceBounds,
  priceIsActive,
  SORTS,
  toApiQuery,
  toParams,
  type DiscoveryState,
  type Mode,
} from '@/lib/discovery';
import { formatPKR } from '@/lib/format';
import { useSeo } from '@/lib/seo';

const COPY: Record<Mode, { eyebrow: string; title: string; description: string }> = {
  shop: {
    eyebrow: 'The collection',
    title: 'Shop',
    description: 'Every piece in the MAPLE collection, made to be lived in.',
  },
  collection: { eyebrow: 'Collection', title: '', description: '' },
  new: { eyebrow: 'Just in', title: 'New Arrivals', description: '' },
};

/**
 * The one product-discovery experience behind Shop, every Collection and New Arrivals. The three pages differ only in
 * `mode`; filtering, sorting, pagination, chips, empty states and the mobile sheet are shared.
 */
export function ProductDiscovery({ mode }: { mode: Mode }) {
  const { slug } = useParams();
  const [params, setParams] = useSearchParams();
  const [sheetOpen, setSheetOpen] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);

  const { data: categories, isError: categoriesFailed } = useCategories();
  const state = useMemo(() => parseState(params, mode, slug), [params, mode, slug]);
  const category = state.category ? categories?.find((c) => c.slug === state.category) : undefined;
  const unknownCategory = !!state.category && !!categories && !category;

  const { data: facets } = useFacets({ category: state.category, new: mode === 'new' || undefined });
  const bounds = priceBounds(facets);
  const { data, isLoading, isError, isFetching, refetch } = useProducts(
    useMemo(() => toApiQuery(state, mode), [state, mode]),
    { enabled: !unknownCategory },
  );

  // One writer for the URL: every control calls this with only what it changed, so no other filter is ever reset.
  const patch = useCallback(
    (change: Partial<DiscoveryState>) => {
      const next = { ...state, ...change };
      if (!('page' in change)) next.page = 1;
      setParams(toParams(next, mode), { preventScrollReset: true });
    },
    [state, mode, setParams],
  );
  const goTo = (page: number) => {
    patch({ page });
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // A stale link such as ?page=99 lands on the last real page instead of an empty grid.
  const total = data?.pagination.total ?? 0;
  const totalPages = data?.pagination.totalPages ?? 1;
  useEffect(() => {
    if (data && !isFetching && total > 0 && state.page > totalPages) patch({ page: totalPages });
  }, [data, isFetching, total, totalPages, state.page, patch]);

  // ---- copy
  const days = facets?.newArrivalDays ?? 30;
  const title = state.q
    ? `Results for “${state.q}”`
    : mode === 'collection'
      ? (category?.name ?? 'Collection')
      : mode === 'new'
        ? COPY.new.title
        : COPY.shop.title;
  const description = state.q
    ? ''
    : mode === 'collection'
      ? (category?.description ?? '')
      : mode === 'new'
        ? 'The latest additions to the collection, newest first.'
        : COPY.shop.description;
  useSeo({
    title: unknownCategory ? 'Collection not found' : title,
    description: description || 'Browse the MAPLE collection.',
    noindex: !!state.q || unknownCategory,
  });

  // ---- active filters (the page's own category is not a removable filter)
  const chips: { key: string; label: string; clear: Partial<DiscoveryState> }[] = [];
  if (mode !== 'collection' && category)
    chips.push({ key: 'category', label: category.name, clear: { category: undefined } });
  if (priceIsActive(state, bounds)) {
    const lo = state.min ?? bounds?.min,
      hi = state.max ?? bounds?.max;
    chips.push({
      key: 'price',
      label:
        lo !== undefined && hi !== undefined
          ? `${formatPKR(lo * 100)} – ${formatPKR(hi * 100)}`
          : state.min !== undefined
            ? `From ${formatPKR(state.min * 100)}`
            : `Up to ${formatPKR((state.max ?? 0) * 100)}`,
      clear: { min: undefined, max: undefined },
    });
  }
  if (state.inStock) chips.push({ key: 'stock', label: 'In stock only', clear: { inStock: false } });
  if (state.q) chips.push({ key: 'q', label: `“${state.q}”`, clear: { q: undefined } });
  const clearAll = () =>
    patch({
      min: undefined,
      max: undefined,
      inStock: false,
      q: undefined,
      ...(mode === 'collection' ? {} : { category: undefined }),
    });
  const filterCount =
    chips.filter((c) => c.key !== 'category' && c.key !== 'q').length + (mode !== 'collection' && category ? 1 : 0);

  const first = total === 0 ? 0 : (state.page - 1) * PAGE_SIZE + 1;
  const last = Math.min(state.page * PAGE_SIZE, total);
  const countText = !data
    ? ''
    : total === 0
      ? 'No pieces'
      : total <= PAGE_SIZE
        ? `${total} piece${total === 1 ? '' : 's'}`
        : `Showing ${first}–${last} of ${total}`;

  const crumbs = (
    <nav aria-label="Breadcrumb" className="text-[12px] uppercase tracking-[0.14em] text-stone">
      <Link to="/" className="hover:text-charcoal">
        Home
      </Link>{' '}
      /{' '}
      {mode === 'new' ? (
        <span className="text-charcoal">New Arrivals</span>
      ) : mode === 'collection' ? (
        <>
          <Link to="/shop" className="hover:text-charcoal">
            Shop
          </Link>{' '}
          / <span className="text-charcoal">{category?.name ?? 'Collection'}</span>
        </>
      ) : (
        <span className="text-charcoal">Shop</span>
      )}
    </nav>
  );

  if (unknownCategory) {
    return (
      <div className="page-container py-10 sm:py-16">
        {crumbs}
        <EmptyState
          title="This collection doesn't exist"
          body="It may have been renamed or retired. Choose one of our collections instead."
          action={{ to: '/shop', label: 'Shop all pieces' }}
        />
        <ul className="mx-auto -mt-8 flex max-w-xl flex-wrap justify-center gap-x-6 gap-y-2 pb-10 text-[14px]">
          {categories?.map((c) => (
            <li key={c.id}>
              <Link to={`/collections/${c.slug}`} className="link-underline">
                {c.name}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const categoryStrip = categories && categories.length > 0 && (
    <nav
      aria-label="Categories"
      className="-mx-5 mt-8 overflow-x-auto px-5 [scrollbar-width:none] sm:-mx-8 sm:px-8 lg:hidden [&::-webkit-scrollbar]:hidden"
    >
      <ul className="flex w-max gap-6 border-b border-taupe">
        {[{ id: 'all', name: 'All', slug: null as string | null }, ...categories].map((c) => {
          const active = (c.slug ?? undefined) === state.category;
          return (
            <li key={c.id}>
              <Link
                to={categoryHref(mode, c.slug, state)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  '-mb-px block whitespace-nowrap border-b py-3 text-[12px] uppercase tracking-[0.16em] transition-colors',
                  active ? 'border-charcoal text-charcoal' : 'border-transparent text-stone hover:text-charcoal',
                )}
              >
                {c.name}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );

  const body =
    categoriesFailed || isError ? (
      <ErrorState onRetry={() => refetch()} />
    ) : isLoading || !data ? (
      <ProductGridSkeleton count={PAGE_SIZE} />
    ) : data.items.length === 0 ? (
      chips.length > 0 ? (
        <EmptyState
          title="Nothing matches these filters"
          body="Try removing a filter, or clear them all to see everything."
        />
      ) : (
        <EmptyState
          title={
            mode === 'new'
              ? 'Nothing new just yet'
              : mode === 'collection'
                ? 'This collection is being curated'
                : 'New pieces are on their way'
          }
          body={
            mode === 'new'
              ? `No pieces have been added in the last ${days} days. Browse the full collection in the meantime.`
              : mode === 'collection'
                ? 'There are no pieces here yet. Explore the rest of the collection.'
                : 'Please check back soon.'
          }
          action={{ to: mode === 'shop' ? '/' : '/shop', label: mode === 'shop' ? 'Back to home' : 'Shop all pieces' }}
        />
      )
    ) : (
      <>
        <div className="grid grid-cols-2 gap-x-3 gap-y-10 max-[359px]:grid-cols-1 sm:gap-x-5 md:grid-cols-3 lg:gap-x-6 lg:gap-y-12">
          {data.items.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
        <Pagination page={state.page} totalPages={totalPages} onPage={goTo} />
      </>
    );

  return (
    <div className="page-container py-10 sm:py-16">
      {crumbs}
      <header className="mt-6 max-w-2xl">
        <p className="eyebrow">{mode === 'collection' ? 'Collection' : COPY[mode].eyebrow}</p>
        <h1 className="mt-3 text-5xl sm:text-6xl">{title}</h1>
        {description && <p className="mt-4 text-[16px] leading-relaxed text-stone">{description}</p>}
      </header>

      {categoryStrip}

      <div ref={topRef} className="mt-8 scroll-mt-28 border-b border-taupe py-4 lg:mt-12 lg:border-t">
        <div className="flex items-center justify-between gap-4">
          <button
            type="button"
            className="inline-flex min-h-[44px] items-center gap-2.5 text-[12px] uppercase tracking-[0.16em] lg:hidden"
            onClick={() => setSheetOpen(true)}
            aria-haspopup="dialog"
          >
            <SlidersHorizontal size={16} strokeWidth={1.4} /> Filters
            {filterCount > 0 && (
              <span
                className="grid h-5 min-w-[20px] place-items-center bg-charcoal px-1 text-[11px] tracking-normal text-paper"
                aria-label={`${filterCount} active`}
              >
                {filterCount}
              </span>
            )}
          </button>
          <p className="hidden text-[13px] text-stone lg:block" aria-live="polite">
            {countText}
          </p>
          <div className="flex items-center gap-3">
            <label htmlFor="sort" className="hidden text-[12px] uppercase tracking-[0.16em] text-stone sm:block">
              Sort
            </label>
            <select
              id="sort"
              value={state.sort}
              onChange={(e) => patch({ sort: e.target.value as DiscoveryState['sort'] })}
              className="border-0 bg-transparent py-2 pr-7 text-[14px] focus:ring-0"
              aria-label="Sort products"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="mt-1 text-[13px] text-stone lg:hidden" aria-live="polite">
          {countText}
        </p>
        {chips.length > 0 && (
          <ul className="mt-4 flex flex-wrap items-center gap-2" aria-label="Active filters">
            {chips.map((c) => (
              <li key={c.key}>
                <button
                  type="button"
                  onClick={() => patch(c.clear)}
                  aria-label={`Remove filter ${c.label}`}
                  className="inline-flex min-h-[36px] items-center gap-2 border border-taupe px-3 text-[12px] transition-colors hover:border-charcoal"
                >
                  {c.label}
                  <X size={12} strokeWidth={1.6} aria-hidden />
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                onClick={clearAll}
                className="min-h-[36px] px-2 text-[12px] uppercase tracking-[0.14em] text-stone underline-offset-4 hover:text-charcoal hover:underline"
              >
                Clear all
              </button>
            </li>
          </ul>
        )}
      </div>

      <div className="mt-10 grid gap-14 lg:grid-cols-[230px_1fr]">
        <aside className="hidden lg:block" aria-label="Filters">
          <div className="sticky top-28">
            <FilterPanel mode={mode} state={state} categories={categories} facets={facets} onPatch={patch} />
          </div>
        </aside>
        <section
          aria-busy={isFetching}
          className={cn('min-w-0 transition-opacity duration-300', isFetching && data && 'opacity-60')}
        >
          {body}
        </section>
      </div>

      <Drawer open={sheetOpen} onClose={() => setSheetOpen(false)} title="Filters" side="bottom">
        <div className="flex-1 overflow-y-auto px-6 py-8">
          <FilterPanel
            mode={mode}
            state={state}
            categories={categories}
            facets={facets}
            onPatch={patch}
            showCategories={false}
          />
        </div>
        <div className="flex gap-3 border-t border-taupe p-4">
          <button
            type="button"
            className="btn-secondary flex-1"
            onClick={clearAll}
            disabled={chips.filter((c) => c.key !== 'category').length === 0}
          >
            Clear all
          </button>
          <button type="button" className="btn-primary flex-[1.4]" onClick={() => setSheetOpen(false)}>
            {data ? `Show ${total} piece${total === 1 ? '' : 's'}` : 'Show results'}
          </button>
        </div>
      </Drawer>
    </div>
  );
}
