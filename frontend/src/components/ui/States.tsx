import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export const Skeleton = ({ className }: { className?: string }) => (
  <div aria-hidden className={cn('skeleton', className)} />
);

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      className="mx-auto h-6 w-6 animate-spin rounded-full border border-taupe border-t-charcoal"
    />
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: { to: string; label: string };
}) {
  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <h2 className="font-display text-3xl">{title}</h2>
      {body && <p className="mt-3 text-[15px] leading-relaxed text-stone">{body}</p>}
      {action && (
        <Link to={action.to} className="btn-secondary mt-8">
          {action.label}
        </Link>
      )}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-md py-20 text-center">
      <h2 className="font-display text-3xl">We couldn't load this</h2>
      <p className="mt-3 text-[15px] text-stone">{message ?? 'Something went wrong on our side. Please try again.'}</p>
      {onRetry && (
        <button onClick={onRetry} className="btn-secondary mt-8">
          Try again
        </button>
      )}
    </div>
  );
}

export const PageShell = ({ children, narrow }: { children: ReactNode; narrow?: boolean }) => (
  <div className={cn('page-container py-12 sm:py-20', narrow && 'max-w-3xl')}>{children}</div>
);
