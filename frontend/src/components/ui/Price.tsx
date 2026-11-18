import { formatPKR } from '@/lib/format';
import { cn } from '@/lib/cn';

export function Price({
  price,
  compareAt,
  from,
  className,
}: {
  price: number | null;
  compareAt?: number | null;
  from?: boolean;
  className?: string;
}) {
  if (price == null) return null;
  return (
    <span className={cn('inline-flex items-baseline gap-2 text-[14px]', className)}>
      {from && <span className="text-stone">From</span>}
      <span>{formatPKR(price)}</span>
      {compareAt != null && compareAt > price && (
        <>
          <s className="text-stone" aria-label={`Was ${formatPKR(compareAt)}`}>
            {formatPKR(compareAt)}
          </s>
        </>
      )}
    </span>
  );
}
