import { Link } from 'react-router-dom';
import { PriceRange } from '@/components/catalogue/PriceRange';
import { cn } from '@/lib/cn';
import { categoryHref, priceBounds, type DiscoveryState, type Mode } from '@/lib/discovery';
import type { Category, Facets } from '@/types/api';

interface Props {
  mode: Mode;
  state: DiscoveryState;
  categories?: Category[];
  facets?: Facets;
  onPatch: (patch: Partial<DiscoveryState>) => void;
  /** The mobile sheet shows categories as a strip above the grid instead, so it leaves them out. */
  showCategories?: boolean;
  onNavigate?: () => void;
}

/** The filter controls, used as the desktop sidebar and inside the mobile bottom sheet. Every change applies at once. */
export function FilterPanel({ mode, state, categories, facets, onPatch, showCategories = true, onNavigate }: Props) {
  const bounds = priceBounds(facets);
  const item = (active: boolean) =>
    cn(
      'block w-full py-1 text-left text-[14px] transition-colors',
      active ? 'text-charcoal' : 'text-stone hover:text-charcoal',
    );
  return (
    <div className="space-y-10">
      {showCategories && categories && categories.length > 0 && (
        <nav aria-label="Categories">
          <h2 className="eyebrow mb-4">Category</h2>
          <ul className="space-y-1.5">
            <li>
              <Link
                to={categoryHref(mode, null, state)}
                onClick={onNavigate}
                aria-current={!state.category ? 'page' : undefined}
                className={item(!state.category)}
              >
                <span className={cn('border-b pb-0.5', !state.category ? 'border-bronze' : 'border-transparent')}>
                  All
                </span>
              </Link>
            </li>
            {categories.map((c) => {
              const active = state.category === c.slug;
              return (
                <li key={c.id}>
                  <Link
                    to={categoryHref(mode, c.slug, state)}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={item(active)}
                  >
                    <span className={cn('border-b pb-0.5', active ? 'border-bronze' : 'border-transparent')}>
                      {c.name}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      {bounds && (
        <section aria-labelledby="f-price">
          <h2 id="f-price" className="eyebrow mb-5">
            Price
          </h2>
          <PriceRange bounds={bounds} min={state.min} max={state.max} onCommit={(min, max) => onPatch({ min, max })} />
        </section>
      )}

      <section aria-labelledby="f-avail">
        <h2 id="f-avail" className="eyebrow mb-4">
          Availability
        </h2>
        <button
          type="button"
          role="switch"
          aria-checked={state.inStock}
          onClick={() => onPatch({ inStock: !state.inStock })}
          className="flex w-full items-center justify-between gap-4 py-1 text-left text-[14px]"
        >
          <span>In stock only</span>
          <span
            aria-hidden
            className={cn(
              'relative h-5 w-9 shrink-0 border transition-colors duration-300',
              state.inStock ? 'border-charcoal bg-charcoal' : 'border-taupe bg-paper',
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 h-3.5 w-3.5 transition-all duration-300 ease-luxe',
                state.inStock ? 'left-[18px] bg-paper' : 'left-0.5 bg-stone',
              )}
            />
          </span>
        </button>
      </section>
    </div>
  );
}
