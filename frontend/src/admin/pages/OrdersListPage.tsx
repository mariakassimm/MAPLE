import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { adminOrders } from '@/admin/api';
import { Badge, DemoTag, Empty, PageHeader, Pager, Table, Td } from '@/admin/components/ui';
import { ErrorState, Skeleton } from '@/components/ui/States';
import { formatDateTime, formatPKR, methodLabel, statusLabel } from '@/lib/format';

const STATUSES = [
  'awaiting_payment',
  'pending_confirmation',
  'confirmed',
  'processing',
  'packed',
  'ready_for_dispatch',
  'shipped',
  'out_for_delivery',
  'delivered',
  'delivery_failed',
  'returned_to_origin',
  'cancelled',
];
const PAYMENT = [
  'unpaid',
  'pending',
  'processing',
  'paid',
  'failed',
  'cancelled',
  'expired',
  'refund_pending',
  'partially_refunded',
  'refunded',
];

export default function OrdersListPage() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const q = {
    page,
    limit: 20,
    status: params.get('status') ?? undefined,
    paymentStatus: params.get('paymentStatus') ?? undefined,
    paymentMethod: params.get('paymentMethod') ?? undefined,
    q: params.get('q') ?? undefined,
  };
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-orders', q],
    queryFn: () => adminOrders(q),
    placeholderData: (p) => p,
  });
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(params);
    v ? n.set(k, v) : n.delete(k);
    n.delete('page');
    setParams(n);
  };

  return (
    <>
      <PageHeader title="Orders" />
      <form
        className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          set('q', String(new FormData(e.currentTarget).get('q') ?? '').trim());
        }}
      >
        <input
          name="q"
          defaultValue={params.get('q') ?? ''}
          className="field"
          placeholder="Order number, name or phone"
          aria-label="Search orders"
        />
        <select
          className="field"
          aria-label="Order status"
          value={params.get('status') ?? ''}
          onChange={(e) => set('status', e.target.value)}
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </select>
        <select
          className="field"
          aria-label="Payment status"
          value={params.get('paymentStatus') ?? ''}
          onChange={(e) => set('paymentStatus', e.target.value)}
        >
          <option value="">All payment states</option>
          {PAYMENT.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </select>
        <select
          className="field"
          aria-label="Payment method"
          value={params.get('paymentMethod') ?? ''}
          onChange={(e) => set('paymentMethod', e.target.value)}
        >
          <option value="">All methods</option>
          {['cod', 'jazzcash', 'easypaisa'].map((m) => (
            <option key={m} value={m}>
              {methodLabel(m)}
            </option>
          ))}
        </select>
      </form>
      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isLoading || !data ? (
        <Skeleton className="h-96" />
      ) : data.items.length === 0 ? (
        <Empty>No orders match.</Empty>
      ) : (
        <>
          <Table head={['Order', 'Placed', 'Customer', 'City', 'Total', 'Method', 'Payment', 'Status']}>
            {data.items.map((o) => (
              <tr key={o.id} className="hover:bg-ivory/40">
                <Td>
                  <Link className="underline underline-offset-4" to={`/admin/orders/${o.id}`}>
                    {o.orderNumber}
                  </Link>
                </Td>
                <Td className="whitespace-nowrap text-stone">{formatDateTime(o.placedAt)}</Td>
                <Td>
                  {o.customerName}
                  <br />
                  <span className="text-[12px] text-stone">{o.phone}</span>
                </Td>
                <Td>{o.city}</Td>
                <Td className="whitespace-nowrap">{formatPKR(o.total)}</Td>
                <Td>
                  {methodLabel(o.paymentMethod)}
                  {o.demoPayment && <DemoTag />}
                </Td>
                <Td>
                  <Badge value={o.paymentStatus} />
                </Td>
                <Td>
                  <Badge value={o.status} />
                </Td>
              </tr>
            ))}
          </Table>
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
