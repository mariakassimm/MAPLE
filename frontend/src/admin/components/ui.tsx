import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { statusLabel } from '@/lib/format';

export const PageHeader = ({ title, actions, sub }: { title: string; sub?: string; actions?: ReactNode }) => (
  <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
    <div>
      <h1 className="text-4xl">{title}</h1>
      {sub && <p className="mt-1 text-[14px] text-stone">{sub}</p>}
    </div>
    {actions}
  </div>
);

const TONE: Record<string, string> = {
  paid: 'bg-[#e3eadb] text-[#3c5430]',
  delivered: 'bg-[#e3eadb] text-[#3c5430]',
  completed: 'bg-[#e3eadb] text-[#3c5430]',
  approved: 'bg-[#e3eadb] text-[#3c5430]',
  booked: 'bg-[#e3eadb] text-[#3c5430]',
  failed: 'bg-[#f1dcd8] text-[#8a2f26]',
  cancelled: 'bg-[#f1dcd8] text-[#8a2f26]',
  expired: 'bg-[#f1dcd8] text-[#8a2f26]',
  delivery_failed: 'bg-[#f1dcd8] text-[#8a2f26]',
  rejected: 'bg-[#f1dcd8] text-[#8a2f26]',
  refund_pending: 'bg-[#f3e6c9] text-[#7a5a14]',
  pending_confirmation: 'bg-[#f3e6c9] text-[#7a5a14]',
  awaiting_payment: 'bg-[#f3e6c9] text-[#7a5a14]',
  pending: 'bg-[#f3e6c9] text-[#7a5a14]',
};
/** Marks an order whose online payment went through the DEMO_MODE simulation (no real money moved). */
export const DemoTag = () => (
  <span className="ml-2 border border-bronze px-1.5 py-0.5 align-middle text-[10px] uppercase tracking-[0.14em] text-bronze">
    Demo
  </span>
);

export const Badge = ({ value, label }: { value: string; label?: string }) => (
  <span
    className={cn(
      'inline-block whitespace-nowrap px-2.5 py-1 text-[11px] uppercase tracking-[0.12em]',
      TONE[value] ?? 'bg-ivory text-bronze',
    )}
  >
    {label ?? statusLabel(value)}
  </span>
);

export const Card = ({
  title,
  children,
  className,
  actions,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
}) => (
  <section className={cn('border border-taupe bg-paper p-5 sm:p-6', className)}>
    {(title || actions) && (
      <div className="mb-4 flex items-center justify-between gap-3">
        {title && <h2 className="font-display text-2xl">{title}</h2>}
        {actions}
      </div>
    )}
    {children}
  </section>
);

export const Stat = ({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) => (
  <div className="border border-taupe bg-paper p-5 transition-shadow duration-500 hover:shadow-[0_18px_40px_-28px_rgba(40,39,34,0.35)]">
    <p className="text-[11px] uppercase tracking-eyebrow text-stone">{label}</p>
    <p className="mt-2 font-display text-3xl">{value}</p>
    {hint && <p className="mt-1 text-[12px] text-stone">{hint}</p>}
  </div>
);

export function Pager({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="mt-6 flex items-center justify-center gap-6 text-[12px] uppercase tracking-[0.16em]">
      <button disabled={page <= 1} onClick={() => onPage(page - 1)} className="disabled:opacity-30">
        Previous
      </button>
      <span className="text-stone">
        Page {page} of {totalPages}
      </span>
      <button disabled={page >= totalPages} onClick={() => onPage(page + 1)} className="disabled:opacity-30">
        Next
      </button>
    </div>
  );
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  const body = useRef<HTMLTableSectionElement>(null);
  // Labels every cell with its column name so the stacked mobile layout stays readable; runs after each render.
  useLayoutEffect(() => {
    body.current
      ?.querySelectorAll('tr')
      .forEach((tr) => [...tr.children].forEach((td, i) => td.setAttribute('data-label', head[i] ?? '')));
  });
  return (
    <div className="overflow-x-auto border border-taupe">
      <table className="responsive-table w-full min-w-[640px] text-left text-[14px]">
        <thead className="bg-ivory/60 text-[11px] uppercase tracking-[0.14em] text-stone">
          <tr>
            {head.map((h) => (
              <th key={h} scope="col" className="px-4 py-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody ref={body} className="divide-y divide-taupe [&_tr]:transition-colors [&_tr:hover]:bg-ivory/40">
          {children}
        </tbody>
      </table>
    </div>
  );
}
export const Td = ({ children, className }: { children?: ReactNode; className?: string }) => (
  <td className={cn('px-4 py-3 align-middle', className)}>{children}</td>
);
export const Empty = ({ children }: { children: ReactNode }) => (
  <p className="border border-dashed border-taupe py-12 text-center text-[14px] text-stone">{children}</p>
);
