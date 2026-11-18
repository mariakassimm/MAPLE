import { useEffect, useRef, useState } from 'react';
import { formatPKR } from '@/lib/format';

interface Props {
  bounds: { min: number; max: number; step: number };
  /** Current filter in rupees; undefined means "no limit on that side". */
  min?: number;
  max?: number;
  /** Called with the chosen range; a side equal to the bound is reported as undefined (no filter). */
  onCommit: (min?: number, max?: number) => void;
}

const rupees = (v: number) => formatPKR(v * 100);

/**
 * Dual-handle price slider built on two native range inputs, so keyboard (arrows, Home/End, PageUp/PageDown), touch and
 * screen readers work without custom code. The handles cannot cross, and results update once the person pauses or lets go.
 */
export function PriceRange({ bounds, min, max, onCommit }: Props) {
  const clamp = (v: number) => Math.min(bounds.max, Math.max(bounds.min, v));
  const [lo, setLo] = useState(clamp(min ?? bounds.min));
  const [hi, setHi] = useState(clamp(max ?? bounds.max));
  const timer = useRef(0);
  // Follow changes made elsewhere (chips, Clear all, back button, a different collection).
  useEffect(() => {
    setLo(clamp(min ?? bounds.min));
    setHi(clamp(max ?? bounds.max));
  }, [min, max, bounds.min, bounds.max]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const commit = (a: number, b: number) => {
    window.clearTimeout(timer.current);
    onCommit(a <= bounds.min ? undefined : a, b >= bounds.max ? undefined : b);
  };
  const later = (a: number, b: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => commit(a, b), 350);
  };
  const now = () => commit(lo, hi);

  const span = bounds.max - bounds.min;
  const left = ((lo - bounds.min) / span) * 100,
    right = ((hi - bounds.min) / span) * 100;
  const loOnTop = lo > bounds.min + span * 0.85; // when both handles sit at the top, the lower one must stay grabbable

  return (
    <div>
      <div className="flex items-baseline justify-between text-[14px] tabular-nums">
        <span aria-hidden>{rupees(lo)}</span>
        <span aria-hidden className="text-stone">
          to
        </span>
        <span aria-hidden>{rupees(hi)}</span>
      </div>
      <div className="relative mx-2.5 mt-5 h-6">
        <div aria-hidden className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-taupe" />
        <div
          aria-hidden
          className="absolute top-1/2 h-px -translate-y-1/2 bg-charcoal"
          style={{ left: `${left}%`, right: `${100 - right}%` }}
        />
        <input
          type="range"
          className="range-thumb"
          style={{ zIndex: loOnTop ? 4 : 3 }}
          aria-label="Minimum price"
          aria-valuetext={rupees(lo)}
          min={bounds.min}
          max={bounds.max}
          step={bounds.step}
          value={lo}
          onChange={(e) => {
            const v = Math.min(Number(e.target.value), hi - bounds.step);
            setLo(v);
            later(v, hi);
          }}
          onPointerUp={now}
          onKeyUp={now}
          onBlur={now}
        />
        <input
          type="range"
          className="range-thumb"
          style={{ zIndex: 3 }}
          aria-label="Maximum price"
          aria-valuetext={rupees(hi)}
          min={bounds.min}
          max={bounds.max}
          step={bounds.step}
          value={hi}
          onChange={(e) => {
            const v = Math.max(Number(e.target.value), lo + bounds.step);
            setHi(v);
            later(lo, v);
          }}
          onPointerUp={now}
          onKeyUp={now}
          onBlur={now}
        />
      </div>
      <p className="mt-2 text-[11px] text-stone">
        {rupees(bounds.min)} – {rupees(bounds.max)} available
      </p>
    </div>
  );
}
