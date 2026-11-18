import { Star } from 'lucide-react';

export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${value.toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={size}
          strokeWidth={1.4}
          className={n <= Math.round(value) ? 'fill-bronze text-bronze' : 'text-taupe'}
        />
      ))}
    </span>
  );
}
