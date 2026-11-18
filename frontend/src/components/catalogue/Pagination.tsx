import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { pageList } from '@/lib/discovery';

export function Pagination({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  const arrow =
    'grid h-11 w-11 place-items-center transition-colors hover:text-bronze disabled:opacity-30 disabled:hover:text-inherit';
  return (
    <nav aria-label="Pagination" className="mt-16">
      <ul className="flex items-center justify-center gap-1 text-[13px]">
        <li>
          <button disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page" className={arrow}>
            <ChevronLeft size={18} strokeWidth={1.4} />
          </button>
        </li>
        {pageList(page, totalPages).map((p, i) =>
          p === 'gap' ? (
            <li key={`g${i}`} aria-hidden className="grid h-11 w-6 place-items-center text-stone">
              …
            </li>
          ) : (
            <li key={p}>
              <button
                onClick={() => onPage(p)}
                aria-label={`Page ${p}`}
                aria-current={p === page ? 'page' : undefined}
                className={cn(
                  'grid h-11 min-w-[44px] place-items-center px-1 transition-colors',
                  p === page ? 'border-b border-charcoal text-charcoal' : 'text-stone hover:text-bronze',
                )}
              >
                {p}
              </button>
            </li>
          ),
        )}
        <li>
          <button
            disabled={page >= totalPages}
            onClick={() => onPage(page + 1)}
            aria-label="Next page"
            className={arrow}
          >
            <ChevronRight size={18} strokeWidth={1.4} />
          </button>
        </li>
      </ul>
    </nav>
  );
}
