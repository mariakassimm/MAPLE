import { cn } from '@/lib/cn';

// Restrained "light catching a surface" glints: a handful of tiny four-point stars that fade in and out slowly.
// Purely decorative (aria-hidden, no pointer events). Hidden entirely for reduced-motion users (see index.css).
const SPOTS: { x: number; y: number; size: number; delay: number }[] = [
  { x: 14, y: 22, size: 10, delay: 0 },
  { x: 78, y: 16, size: 8, delay: 1.6 },
  { x: 62, y: 58, size: 12, delay: 3.1 },
  { x: 30, y: 74, size: 7, delay: 4.4 },
  { x: 90, y: 82, size: 9, delay: 2.3 },
  { x: 48, y: 36, size: 6, delay: 5.2 },
];

export function Sparkles({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <span aria-hidden className={cn('pointer-events-none absolute inset-0 z-[2] overflow-hidden', className)}>
      {SPOTS.slice(0, count).map((s, i) => (
        <svg
          key={i}
          viewBox="0 0 20 20"
          className="sparkle absolute text-[#EBD9B4]"
          style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.size, height: s.size, animationDelay: `${s.delay}s` }}
        >
          <path
            d="M10 0C10.6 6.2 13.8 9.4 20 10C13.8 10.6 10.6 13.8 10 20C9.4 13.8 6.2 10.6 0 10C6.2 9.4 9.4 6.2 10 0Z"
            fill="currentColor"
          />
        </svg>
      ))}
    </span>
  );
}
