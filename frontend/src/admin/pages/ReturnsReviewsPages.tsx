import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { adminReturns, adminReviews, moderateReview, updateReturn, type AdminReturn } from '@/admin/api';
import { Badge, Card, Empty, PageHeader, Pager } from '@/admin/components/ui';
import { can } from '@/admin/permissions';
import { Stars } from '@/components/ui/Stars';
import { ErrorState, Skeleton } from '@/components/ui/States';
import { useSession } from '@/hooks/queries';
import { formatDate, formatPKR, rupeesToPaisa, statusLabel } from '@/lib/format';

const NEXT: Record<string, string[]> = {
  requested: ['approved', 'rejected'],
  approved: ['received', 'closed'],
  received: ['refunded', 'exchanged', 'closed'],
};

function ReturnCard({ r, canManage }: { r: AdminReturn; canManage: boolean }) {
  const qc = useQueryClient();
  const options = (NEXT[r.status] ?? []).filter((s) =>
    s === 'refunded' ? r.type === 'refund' : s === 'exchanged' ? r.type === 'exchange' : true,
  );
  const [status, setStatus] = useState('');
  const [note, setNote] = useState('');
  const [amount, setAmount] = useState('');
  const [restock, setRestock] = useState<Record<string, number>>({});
  const m = useMutation({
    mutationFn: () => {
      const body: Parameters<typeof updateReturn>[1] = { status, ...(note.trim() ? { note: note.trim() } : {}) };
      if (status === 'refunded') {
        const a = rupeesToPaisa(amount);
        if (!a) throw new Error('Enter the refund amount in rupees.');
        body.refundAmount = a;
      }
      if (status === 'received') {
        const list = (Object.entries(restock) as [string, number][])
          .filter(([, q]) => q > 0)
          .map(([variantId, quantity]) => ({ variantId, quantity }));
        if (list.length) body.restock = list;
      }
      if (status === 'rejected' && !note.trim()) throw new Error('Give the customer a reason for declining.');
      return updateReturn(r.id, body);
    },
    onSuccess: () => {
      toast.success('Return updated.');
      setStatus('');
      setNote('');
      qc.invalidateQueries({ queryKey: ['admin-returns'] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <li className="border border-taupe bg-paper p-5 text-[14px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-display text-2xl">{r.reference}</p>
        <div className="flex gap-2">
          <Badge value="pending" label={r.type === 'refund' ? 'Refund' : 'Exchange'} />
          <Badge value={r.status} />
        </div>
      </div>
      <p className="mt-1 text-stone">
        Order {r.orderNumber} · {r.customer.name} · {r.customer.phone} · {formatDate(r.createdAt)}
      </p>
      <p className="mt-3">
        Reason: {statusLabel(r.reason)}
        {r.details ? ` — ${r.details}` : ''}
      </p>
      <ul className="mt-2">
        {r.items.map((i) => (
          <li key={i.variantId}>
            {i.quantity} × {i.name} <span className="text-stone">({i.sku})</span>
          </li>
        ))}
      </ul>
      {r.refundAmount != null && <p className="mt-2">Refunded: {formatPKR(r.refundAmount)}</p>}
      {r.resolutionNote && <p className="mt-2 text-stone">{r.resolutionNote}</p>}
      {canManage && options.length > 0 && (
        <form
          className="mt-4 space-y-3 border-t border-taupe pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            m.mutate();
          }}
        >
          <div className="flex flex-wrap gap-3">
            <select
              aria-label="Move to"
              className="field !w-48"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">Move to…</option>
              {options.map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </select>
            {status === 'refunded' && (
              <input
                aria-label="Refund amount in rupees"
                className="field !w-48"
                placeholder="Refund (Rs)"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            )}
          </div>
          {status === 'received' && (
            <div>
              <p className="field-label">Put back on sale after inspection (nothing returns to stock automatically)</p>
              <ul className="space-y-2">
                {r.items.map((i) => (
                  <li key={i.variantId} className="flex items-center gap-3">
                    <span className="flex-1">{i.name}</span>
                    <select
                      aria-label={`Restock ${i.name}`}
                      className="field !w-20 !py-2"
                      value={restock[i.variantId] ?? 0}
                      onChange={(e) => setRestock({ ...restock, [i.variantId]: Number(e.target.value) })}
                    >
                      {Array.from({ length: i.quantity + 1 }, (_, n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {status && (
            <input
              aria-label="Note to customer"
              className="field"
              placeholder={status === 'rejected' ? 'Reason (required)' : 'Note to customer (optional)'}
              maxLength={300}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          )}
          {status && (
            <button className="btn-primary !min-h-[44px]" disabled={m.isPending}>
              Update return
            </button>
          )}
        </form>
      )}
    </li>
  );
}

export function AdminReturnsPage() {
  const [params, setParams] = useSearchParams();
  const { data: session } = useSession();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const q = { page, limit: 20, status: params.get('status') ?? undefined };
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-returns', q],
    queryFn: () => adminReturns(q),
  });
  return (
    <>
      <PageHeader
        title="Returns"
        actions={
          <select
            className="field !w-48"
            aria-label="Status"
            value={params.get('status') ?? ''}
            onChange={(e) => {
              const n = new URLSearchParams();
              if (e.target.value) n.set('status', e.target.value);
              setParams(n);
            }}
          >
            <option value="">All</option>
            {['requested', 'approved', 'received', 'refunded', 'exchanged', 'rejected', 'closed'].map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
        }
      />
      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isLoading || !data ? (
        <Skeleton className="h-64" />
      ) : data.items.length === 0 ? (
        <Empty>No return requests.</Empty>
      ) : (
        <>
          <ul className="space-y-4">
            {data.items.map((r) => (
              <ReturnCard key={r.id} r={r} canManage={can(session?.user.role, 'returns:manage')} />
            ))}
          </ul>
          <Pager
            page={data.pagination.page}
            totalPages={data.pagination.totalPages}
            onPage={(p) => {
              const n = new URLSearchParams(params);
              n.set('page', String(p));
              setParams(n);
            }}
          />
        </>
      )}
    </>
  );
}

export function AdminReviewsPage() {
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();
  const status = params.get('status') ?? 'pending';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-reviews', status, page],
    queryFn: () => adminReviews({ status, page, limit: 20 }),
  });
  const m = useMutation({
    mutationFn: (v: { id: string; b: { status?: string; featured?: boolean } }) => moderateReview(v.id, v.b),
    onSuccess: () => {
      toast.success('Review updated.');
      qc.invalidateQueries({ queryKey: ['admin-reviews'] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <>
      <PageHeader
        title="Reviews"
        sub="Only approved reviews appear on the store. Featured reviews also appear on the homepage."
        actions={
          <select
            className="field !w-48"
            aria-label="Status"
            value={status}
            onChange={(e) => setParams({ status: e.target.value })}
          >
            {['pending', 'approved', 'rejected', 'hidden'].map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
        }
      />
      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isLoading || !data ? (
        <Skeleton className="h-64" />
      ) : data.items.length === 0 ? (
        <Empty>No {status} reviews.</Empty>
      ) : (
        <>
          <ul className="space-y-4">
            {data.items.map((r) => (
              <Card key={r.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Stars value={r.rating} />
                  <span className="text-[12px] text-stone">
                    {r.productName ?? 'Removed product'} · {formatDate(r.createdAt)}
                  </span>
                </div>
                {r.title && <p className="mt-2 font-display text-xl">{r.title}</p>}
                <p className="mt-1 whitespace-pre-line text-[14px] text-stone">{r.body}</p>
                <p className="mt-2 text-[12px] uppercase tracking-[0.12em] text-stone">{r.displayName}</p>
                <div className="mt-4 flex flex-wrap gap-4 text-[12px] uppercase tracking-[0.14em]">
                  {r.status !== 'approved' && (
                    <button disabled={m.isPending} onClick={() => m.mutate({ id: r.id, b: { status: 'approved' } })}>
                      Approve
                    </button>
                  )}
                  {r.status === 'pending' && (
                    <button
                      disabled={m.isPending}
                      className="text-[#8a2f26]"
                      onClick={() => m.mutate({ id: r.id, b: { status: 'rejected' } })}
                    >
                      Reject
                    </button>
                  )}
                  {r.status === 'approved' && (
                    <button disabled={m.isPending} onClick={() => m.mutate({ id: r.id, b: { status: 'hidden' } })}>
                      Hide
                    </button>
                  )}
                  {r.status === 'approved' && (
                    <button disabled={m.isPending} onClick={() => m.mutate({ id: r.id, b: { featured: !r.featured } })}>
                      {r.featured ? 'Remove from homepage' : 'Feature on homepage'}
                    </button>
                  )}
                </div>
              </Card>
            ))}
          </ul>
          <Pager
            page={data.pagination.page}
            totalPages={data.pagination.totalPages}
            onPage={(p) => setParams({ status, page: String(p) })}
          />
        </>
      )}
    </>
  );
}
