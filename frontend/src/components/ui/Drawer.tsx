import { motion, useReducedMotion } from 'motion/react';
import { X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { EASE } from '@/lib/motion';
import { cn } from '@/lib/cn';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  side?: 'left' | 'right' | 'bottom';
  children: ReactNode;
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])';

/** Accessible side panel: labelled dialog, Escape closes, focus is trapped and restored, page scroll is locked. */
export function Drawer({ open, onClose, title, side = 'right', children }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  // The panel is unmounted by a timer, not by an exit animation finishing. An exit animation can be interrupted when the page
  // changes underneath it (for example the lazy checkout page loading), which used to leave a dead "Your Bag" panel on screen.
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const t = window.setTimeout(() => setMounted(false), 550);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onClose();
      if (e.key !== 'Tab' || !panel.current) return;
      const els = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!els.length) return;
      const first = els[0]!;
      const last = els[els.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [open, onClose]);

  const x = side === 'right' ? '100%' : '-100%';
  const bottom = side === 'bottom';
  if (!mounted) return null;
  return (
    <div className={cn('fixed inset-0 z-50', !open && 'pointer-events-none')}>
      <motion.div
        className="absolute inset-0 bg-charcoal/40"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: open ? 1 : 0 }}
        transition={{ duration: 0.4 }}
      />
      <motion.div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-hidden={!open}
        className={cn(
          'absolute flex flex-col bg-paper shadow-2xl',
          bottom
            ? 'inset-x-0 bottom-0 max-h-[88vh] w-full'
            : cn('top-0 h-full w-full max-w-[440px]', side === 'right' ? 'right-0' : 'left-0'),
        )}
        initial={reduce ? { opacity: 0 } : bottom ? { y: '100%' } : { x }}
        animate={reduce ? { opacity: open ? 1 : 0 } : bottom ? { y: open ? 0 : '100%' } : { x: open ? 0 : x }}
        transition={{ duration: 0.5, ease: EASE }}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-taupe px-6 py-5">
          <h2 className="font-display text-2xl">{title}</h2>
          <button onClick={onClose} aria-label={`Close ${title}`} className="-mr-2 p-2 text-charcoal hover:text-bronze">
            <X size={22} strokeWidth={1.4} />
          </button>
        </div>
        {children}
      </motion.div>
    </div>
  );
}
