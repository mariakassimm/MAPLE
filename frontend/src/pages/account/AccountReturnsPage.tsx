import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { ReturnCard, ReturnForm } from '@/pages/ReturnsPage';
import { EmptyState, Skeleton } from '@/components/ui/States';
import { fetchAccountOrder, fetchAccountOrders, fetchAccountReturns } from '@/services/shop';

export default function AccountReturnsPage() {
  const qc = useQueryClient();
  const { data: returns, isLoading } = useQuery({ queryKey: ['account-returns'], queryFn: fetchAccountReturns });
  const { data: orders } = useQuery({ queryKey: ['account-orders', 1], queryFn: () => fetchAccountOrders(1) });
  const [selected, setSelected] = useState('');
  const delivered = orders?.items.filter((o) => o.status === 'delivered') ?? [];
  const { data: order } = useQuery({
    queryKey: ['account-order', selected],
    queryFn: () => fetchAccountOrder(selected),
    enabled: !!selected,
  });

  if (isLoading || !returns) return <Skeleton className="h-48" />;
  return (
    <div className="max-w-3xl space-y-12">
      <section>
        <h2 className="mb-4 font-display text-3xl">Your requests</h2>
        {returns.length === 0 ? (
          <EmptyState title="No return requests" body="Requests you make will appear here with their status." />
        ) : (
          <ul className="space-y-4">
            {returns.map((r) => (
              <ReturnCard key={r.reference} r={r} />
            ))}
          </ul>
        )}
      </section>
      {delivered.length > 0 && (
        <section>
          <h2 className="mb-4 font-display text-3xl">Start a return</h2>
          <label htmlFor="ret-order" className="field-label">
            Delivered order
          </label>
          <select id="ret-order" className="field mb-8" value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">Choose an order</option>
            {delivered.map((o) => (
              <option key={o.orderNumber} value={o.orderNumber}>
                {o.orderNumber}
              </option>
            ))}
          </select>
          {order && (
            <ReturnForm
              key={order.orderNumber}
              order={order}
              phone={order.customer.phone}
              onDone={() => {
                toast.success('Return request submitted');
                setSelected('');
                qc.invalidateQueries({ queryKey: ['account-returns'] });
              }}
            />
          )}
        </section>
      )}
    </div>
  );
}
