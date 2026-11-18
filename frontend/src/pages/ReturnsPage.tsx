import { useState } from 'react';
import { toast } from 'sonner';
import { OrderLookupForm } from '@/components/ui/OrderLookupForm';
import { StatusPill } from '@/components/ui/OrderParts';
import { formatDate, formatPKR } from '@/lib/format';
import { useSeo } from '@/lib/seo';
import { createReturn, lookupReturns, trackOrder } from '@/services/shop';
import type { Order, ReturnRequest } from '@/types/api';

const REASONS: [string, string][] = [
  ['defective', 'Defective or damaged'],
  ['wrong_item', 'Wrong item received'],
  ['not_as_described', 'Not as described'],
  ['size_fit', 'Size or fit'],
  ['changed_mind', 'Changed my mind'],
  ['other', 'Other'],
];

export function ReturnForm({
  order,
  phone,
  onDone,
}: {
  order: Order;
  phone: string;
  onDone: (r: ReturnRequest) => void;
}) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const [type, setType] = useState<'refund' | 'exchange'>('refund');
  const [reason, setReason] = useState('defective');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const items = (Object.entries(qty) as [string, number][])
    .filter(([, q]) => q > 0)
    .map(([variantId, quantity]) => ({ variantId, quantity }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (items.length === 0) return setError('Choose at least one item to return.');
    setBusy(true);
    try {
      onDone(
        await createReturn({
          orderNumber: order.orderNumber,
          phone,
          type,
          reason,
          ...(details.trim() ? { details: details.trim() } : {}),
          items,
        }),
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-8">
      <fieldset>
        <legend className="eyebrow mb-4">Items</legend>
        <ul className="divide-y divide-taupe border-y border-taupe">
          {order.items.map((i) => (
            <li key={i.variantId} className="flex items-center justify-between gap-4 py-4">
              <div>
                <p className="font-display text-xl">{i.name}</p>
                <p className="text-[13px] text-stone">
                  {formatPKR(i.unitPrice)} · ordered {i.quantity}
                </p>
              </div>
              <label className="flex items-center gap-2 text-[13px]">
                Return
                <select
                  aria-label={`Quantity of ${i.name} to return`}
                  className="field !w-20 !py-2"
                  value={qty[i.variantId] ?? 0}
                  onChange={(e) => setQty((q) => ({ ...q, [i.variantId]: Number(e.target.value) }))}
                >
                  {Array.from({ length: i.quantity + 1 }, (_, n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <label htmlFor="r-type" className="field-label">
            I would like
          </label>
          <select
            id="r-type"
            className="field"
            value={type}
            onChange={(e) => setType(e.target.value as 'refund' | 'exchange')}
          >
            <option value="refund">A refund</option>
            <option value="exchange">An exchange</option>
          </select>
        </div>
        <div>
          <label htmlFor="r-reason" className="field-label">
            Reason
          </label>
          <select id="r-reason" className="field" value={reason} onChange={(e) => setReason(e.target.value)}>
            {REASONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label htmlFor="r-details" className="field-label">
          Details (optional)
        </label>
        <textarea
          id="r-details"
          className="field min-h-[110px]"
          maxLength={500}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
        />
      </div>
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      <button disabled={busy} className="btn-primary w-full">
        {busy ? 'Submitting' : 'Submit return request'}
      </button>
    </form>
  );
}

export function ReturnCard({ r }: { r: ReturnRequest }) {
  return (
    <li className="border border-taupe p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-display text-2xl">{r.reference}</p>
        <StatusPill status={r.status} />
      </div>
      <p className="mt-2 text-[13px] text-stone">
        Order {r.orderNumber} · {r.type === 'refund' ? 'Refund' : 'Exchange'} · {formatDate(r.createdAt)}
      </p>
      <ul className="mt-4 text-[14px]">
        {r.items.map((i) => (
          <li key={i.sku}>
            {i.quantity} × {i.name}
          </li>
        ))}
      </ul>
      {r.refundAmount != null && <p className="mt-3 text-[14px]">Refund: {formatPKR(r.refundAmount)}</p>}
      {r.resolutionNote && <p className="mt-3 text-[14px] text-stone">{r.resolutionNote}</p>}
    </li>
  );
}

export default function ReturnsPage() {
  useSeo({ title: 'Returns', noindex: true });
  const [ctx, setCtx] = useState<{ order: Order; phone: string; existing: ReturnRequest[] } | null>(null);
  const [done, setDone] = useState<ReturnRequest | null>(null);

  if (done)
    return (
      <div className="page-container max-w-2xl py-16 text-center sm:py-24">
        <p className="eyebrow">Return {done.reference}</p>
        <h1 className="mt-3 text-5xl">Request received</h1>
        <p className="mt-4 text-[15px] text-stone">
          We'll review your request and update you by email and SMS. You can check its status here any time with your
          order number and mobile number.
        </p>
      </div>
    );
  if (!ctx)
    return (
      <div className="page-container max-w-md py-16 sm:py-24">
        <h1 className="text-center text-5xl">Returns</h1>
        <p className="mb-8 mt-4 text-center text-[15px] text-stone">
          Find your order to start a return or check an existing one.
        </p>
        <OrderLookupForm
          label="Find my order"
          onSubmit={async (n, p) => {
            const [order, existing] = await Promise.all([trackOrder(n, p), lookupReturns(n, p)]);
            setCtx({ order, phone: p, existing });
          }}
        />
      </div>
    );
  return (
    <div className="page-container max-w-3xl py-14 sm:py-24">
      <h1 className="text-4xl sm:text-5xl">Order {ctx.order.orderNumber}</h1>
      {ctx.existing.length > 0 && (
        <section className="mt-10">
          <h2 className="eyebrow mb-4">Your return requests</h2>
          <ul className="space-y-4">
            {ctx.existing.map((r) => (
              <ReturnCard key={r.reference} r={r} />
            ))}
          </ul>
        </section>
      )}
      <section className="mt-12">
        <h2 className="mb-6 font-display text-3xl">Start a return</h2>
        {ctx.order.status === 'delivered' ? (
          <ReturnForm
            order={ctx.order}
            phone={ctx.phone}
            onDone={(r) => {
              toast.success('Return request submitted');
              setDone(r);
            }}
          />
        ) : (
          <p className="text-[15px] text-stone">
            Returns can be requested once your order has been delivered. Its status is currently “
            {ctx.order.status.replace(/_/g, ' ')}”.
          </p>
        )}
      </section>
      <button onClick={() => setCtx(null)} className="btn-ghost mt-10">
        Look up another order
      </button>
    </div>
  );
}
