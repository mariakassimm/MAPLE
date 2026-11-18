import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { adminPayments, adminShipments, codSummary } from '@/admin/api';
import { Badge, Card, Empty, PageHeader, Pager, Stat, Table, Td } from '@/admin/components/ui';
import { ErrorState, Skeleton } from '@/components/ui/States';
import { formatDateTime, formatPKR, methodLabel } from '@/lib/format';

export function ShipmentsPage() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const q = {
    page,
    limit: 20,
    status: params.get('status') ?? undefined,
    courier: params.get('courier') ?? undefined,
    needsReview: params.get('needsReview') ?? undefined,
  };
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-shipments', q],
    queryFn: () => adminShipments(q),
    placeholderData: (p) => p,
  });
  return (
    <>
      <PageHeader
        title="Shipments"
        actions={
          <button
            className="btn-secondary !min-h-[42px] !px-5"
            onClick={() => {
              const n = new URLSearchParams(params);
              params.get('needsReview') ? n.delete('needsReview') : n.set('needsReview', 'true');
              n.delete('page');
              setParams(n);
            }}
          >
            {params.get('needsReview') ? 'Show all' : 'Needs check only'}
          </button>
        }
      />
      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isLoading || !data ? (
        <Skeleton className="h-80" />
      ) : data.items.length === 0 ? (
        <Empty>No shipments.</Empty>
      ) : (
        <>
          <Table head={['Order', 'Courier', 'Tracking', 'Status', 'COD', 'Last sync']}>
            {data.items.map((s) => (
              <tr key={s.id}>
                <Td>
                  <Link className="underline underline-offset-4" to={`/admin/orders?q=${s.orderNumber}`}>
                    {s.orderNumber}
                  </Link>
                </Td>
                <Td>{s.courier.toUpperCase()}</Td>
                <Td>{s.trackingNumber ?? '–'}</Td>
                <Td>
                  <div className="flex gap-2">
                    <Badge value={s.status} />
                    {s.needsReview && <Badge value="pending" label="Needs check" />}
                  </div>
                </Td>
                <Td>{s.codAmount ? formatPKR(s.codAmount) : '–'}</Td>
                <Td className="text-stone">{s.lastSyncedAt ? formatDateTime(s.lastSyncedAt) : '–'}</Td>
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

export function PaymentsPage() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const q = {
    page,
    limit: 20,
    status: params.get('status') ?? undefined,
    provider: params.get('provider') ?? undefined,
  };
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-payments', q],
    queryFn: () => adminPayments(q),
    placeholderData: (p) => p,
  });
  return (
    <>
      <PageHeader
        title="Online payments"
        sub="Every JazzCash and Easypaisa attempt. Status changes only from verified provider messages."
      />
      <div className="mb-6 flex gap-3">
        <select
          className="field !w-52"
          aria-label="Provider"
          value={params.get('provider') ?? ''}
          onChange={(e) => {
            const n = new URLSearchParams(params);
            e.target.value ? n.set('provider', e.target.value) : n.delete('provider');
            n.delete('page');
            setParams(n);
          }}
        >
          <option value="">All providers</option>
          <option value="jazzcash">JazzCash</option>
          <option value="easypaisa">Easypaisa</option>
        </select>
      </div>
      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isLoading || !data ? (
        <Skeleton className="h-80" />
      ) : data.items.length === 0 ? (
        <Empty>No payment attempts.</Empty>
      ) : (
        <>
          <Table head={['Reference', 'Order', 'Provider', 'Amount', 'Status', 'Created', 'Note']}>
            {data.items.map((p) => (
              <tr key={p.paymentRef}>
                <Td>{p.paymentRef}</Td>
                <Td>{p.orderNumber}</Td>
                <Td>{methodLabel(p.provider)}</Td>
                <Td>{formatPKR(p.amount)}</Td>
                <Td>
                  <Badge value={p.status} />
                </Td>
                <Td className="text-stone">{formatDateTime(p.createdAt)}</Td>
                <Td className="text-[13px] text-stone">{p.reviewReason ?? p.responseMessage ?? ''}</Td>
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

export function CodPage() {
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['admin-cod'], queryFn: codSummary });
  if (isError) return <ErrorState onRetry={() => refetch()} />;
  if (isLoading || !data) return <Skeleton className="h-80" />;
  return (
    <>
      <PageHeader
        title="COD ledger"
        sub="Delivered cash-on-delivery orders: what couriers hold, and what has reached you."
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Delivered, collection not recorded"
          value={data.awaitingCollection.count}
          hint={formatPKR(data.awaitingCollection.amount)}
        />
        <Stat
          label="Collected, awaiting remittance"
          value={formatPKR(data.awaitingRemittance.amount)}
          hint={`${data.awaitingRemittance.count} orders`}
        />
        <Stat
          label="Settled orders"
          value={data.settled.count}
          hint={`${formatPKR(data.settled.received)} received · ${formatPKR(data.settled.courierCharges)} charges`}
        />
      </div>
      <Card title="Awaiting remittance" className="mt-6">
        {data.awaitingRemittance.orders.length === 0 ? (
          <Empty>Nothing outstanding.</Empty>
        ) : (
          <Table head={['Order', 'Collected on', 'Collected', 'Outstanding']}>
            {data.awaitingRemittance.orders.map((o) => (
              <tr key={o.orderNumber}>
                <Td>
                  <Link className="underline underline-offset-4" to={`/admin/orders?q=${o.orderNumber}`}>
                    {o.orderNumber}
                  </Link>
                </Td>
                <Td className="text-stone">{formatDateTime(o.collectedAt)}</Td>
                <Td>{formatPKR(o.collected)}</Td>
                <Td>{formatPKR(o.outstanding)}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
