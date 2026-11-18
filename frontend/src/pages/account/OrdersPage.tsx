import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Img } from '@/components/ui/Img';
import { StatusPill } from '@/components/ui/OrderParts';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { formatDate, formatPKR, methodLabel } from '@/lib/format';
import { fetchAccountOrders } from '@/services/shop';

export default function OrdersPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['account-orders', page],
    queryFn: () => fetchAccountOrders(page),
  });
  if (isError) return <ErrorState onRetry={() => refetch()} />;
  if (isLoading || !data)
    return (
      <div className="space-y-4">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
    );
  if (data.items.length === 0)
    return (
      <EmptyState
        title="No orders yet"
        body="When you place an order it will appear here."
        action={{ to: '/shop', label: 'Explore the collection' }}
      />
    );
  return (
    <>
      <ul className="divide-y divide-taupe border-y border-taupe">
        {data.items.map((o) => (
          <li key={o.orderNumber}>
            <Link to={`/account/orders/${o.orderNumber}`} className="flex items-center gap-5 py-5 hover:bg-ivory/50">
              <div className="h-20 w-16 shrink-0 bg-ivory">
                <Img image={o.thumbnail} width={160} sizes="64px" className="h-full w-full" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-display text-2xl">{o.orderNumber}</p>
                <p className="text-[13px] text-stone">
                  {formatDate(o.placedAt)} · {o.itemCount} item{o.itemCount === 1 ? '' : 's'} ·{' '}
                  {methodLabel(o.paymentMethod)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[14px]">{formatPKR(o.total)}</p>
                <div className="mt-1">
                  <StatusPill status={o.status} />
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {data.pagination.totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-6 text-[12px] uppercase tracking-[0.16em]">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="disabled:opacity-30">
            Previous
          </button>
          <span className="text-stone">
            Page {page} of {data.pagination.totalPages}
          </span>
          <button
            disabled={page >= data.pagination.totalPages}
            onClick={() => setPage(page + 1)}
            className="disabled:opacity-30"
          >
            Next
          </button>
        </div>
      )}
    </>
  );
}
