import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { adminDashboard } from '@/admin/api';
import { Badge, Card, Empty, PageHeader, Stat, Table, Td } from '@/admin/components/ui';
import { ErrorState, Skeleton } from '@/components/ui/States';
import { formatDate, formatPKR, statusLabel } from '@/lib/format';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => iso(new Date(Date.now() - n * 86_400_000));
const rupees = (paisa: number) => Math.round(paisa / 100);
const BRONZE = '#77634D';

export default function DashboardPage() {
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(iso(new Date()));
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-dashboard', from, to],
    queryFn: () => adminDashboard(from, to),
    placeholderData: (p) => p,
  });
  if (isError) return <ErrorState onRetry={() => refetch()} />;
  if (isLoading || !data)
    return (
      <div className="grid gap-4 sm:grid-cols-4">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
    );
  const s = data.sales;
  const attention = [
    {
      n: data.orders.pending,
      label: 'orders waiting for confirmation',
      to: '/admin/orders?status=pending_confirmation',
    },
    {
      n: data.attention.shipmentsNeedingReview,
      label: 'shipments need a check',
      to: '/admin/shipments?needsReview=true',
    },
    { n: data.attention.openReturns, label: 'open return requests', to: '/admin/returns' },
    { n: data.attention.pendingReviews, label: 'reviews awaiting moderation', to: '/admin/reviews' },
    { n: data.lowStock.count, label: 'variants low on stock', to: '/admin/inventory?lowStock=true' },
  ].filter((a) => a.n > 0);

  return (
    <>
      <PageHeader
        title="Dashboard"
        sub="Live figures from your orders. Each money figure means one specific thing and they are not added together."
        actions={
          <div className="flex flex-wrap items-end gap-3 text-[13px]">
            <label>
              From
              <input
                type="date"
                value={from}
                max={to}
                onChange={(e) => setFrom(e.target.value)}
                className="field mt-1 !py-2"
              />
            </label>
            <label>
              To
              <input
                type="date"
                value={to}
                min={from}
                onChange={(e) => setTo(e.target.value)}
                className="field mt-1 !py-2"
              />
            </label>
          </div>
        }
      />

      {attention.length > 0 && (
        <Card title="Needs attention" className="mb-6">
          <ul className="grid gap-2 sm:grid-cols-2">
            {attention.map((a) => (
              <li key={a.label}>
                <Link
                  to={a.to}
                  className="flex items-center justify-between border border-taupe px-4 py-3 text-[14px] hover:bg-ivory"
                >
                  <span>
                    <strong className="font-medium">{a.n}</strong> {a.label}
                  </span>
                  <span aria-hidden>→</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Orders placed"
          value={data.orders.placed}
          hint={`${data.orders.delivered} delivered · ${data.orders.cancelled} cancelled`}
        />
        <Stat
          label="Order value (excl. cancelled)"
          value={formatPKR(s.grossOrderValue)}
          hint={`${s.ordersCounted} orders · avg ${formatPKR(s.averageOrderValue)}`}
        />
        <Stat
          label="Online payments received"
          value={formatPKR(s.onlinePaid.value)}
          hint={`${s.onlinePaid.orders} verified orders`}
        />
        <Stat
          label="COD collected by couriers"
          value={formatPKR(s.cod.collected)}
          hint={`${formatPKR(s.cod.remittedToUs)} received · ${formatPKR(s.cod.awaitingRemittance)} outstanding`}
        />
        <Stat label="Refunded" value={formatPKR(s.refunded)} />
        <Stat label="Customers" value={data.customers.total} hint={`${data.customers.newInRange} new in range`} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[2fr_1fr]">
        <Card title="Order value by day">
          <div className="h-72" role="img" aria-label="Area chart of order value per day">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={data.series.map((p) => ({ ...p, rs: rupees(p.gross) }))}
                margin={{ left: 0, right: 8, top: 8 }}
              >
                <CartesianGrid stroke="#D8D0C5" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d: string) => d.slice(5)}
                  stroke="#706C64"
                  fontSize={11}
                  minTickGap={24}
                />
                <YAxis
                  stroke="#706C64"
                  fontSize={11}
                  width={56}
                  tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                />
                <Tooltip
                  formatter={(v: number) => [`Rs ${v.toLocaleString('en-PK')}`, 'Order value']}
                  labelFormatter={(d: string) => formatDate(d)}
                  contentStyle={{ borderRadius: 2, border: '1px solid #D8D0C5' }}
                />
                <Area type="monotone" dataKey="rs" stroke={BRONZE} fill={BRONZE} fillOpacity={0.14} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Orders by status">
          {Object.keys(data.orders.byStatus).length === 0 ? (
            <Empty>No orders in this range.</Empty>
          ) : (
            <div className="h-72" role="img" aria-label="Bar chart of orders by status">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={Object.entries(data.orders.byStatus).map(([k, v]) => ({ name: statusLabel(k), v }))}
                  margin={{ left: 40 }}
                >
                  <XAxis type="number" allowDecimals={false} stroke="#706C64" fontSize={11} />
                  <YAxis type="category" dataKey="name" stroke="#706C64" fontSize={11} width={120} />
                  <Tooltip contentStyle={{ borderRadius: 2, border: '1px solid #D8D0C5' }} />
                  <Bar dataKey="v" fill={BRONZE} name="Orders" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Top products">
          {data.topProducts.length === 0 ? (
            <Empty>No sales in this range.</Empty>
          ) : (
            <Table head={['Product', 'Units', 'Revenue']}>
              {data.topProducts.map((p) => (
                <tr key={p.productId}>
                  <Td>{p.name}</Td>
                  <Td>{p.units}</Td>
                  <Td>{formatPKR(p.revenue)}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
        <Card title="Low stock">
          {data.lowStock.items.length === 0 ? (
            <Empty>Nothing is running low.</Empty>
          ) : (
            <Table head={['Product', 'SKU', 'Available']}>
              {data.lowStock.items.map((i) => (
                <tr key={i.variantId}>
                  <Td>{i.productName}</Td>
                  <Td>{i.sku}</Td>
                  <Td>{i.available}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>

      <Card
        title="Recent orders"
        className="mt-6"
        actions={
          <Link to="/admin/orders" className="link-underline text-[12px] uppercase tracking-[0.16em]">
            All orders
          </Link>
        }
      >
        {data.recentOrders.length === 0 ? (
          <Empty>No orders yet.</Empty>
        ) : (
          <Table head={['Order', 'Customer', 'Total', 'Status', 'Payment']}>
            {data.recentOrders.map((o) => (
              <tr key={o.id}>
                <Td>
                  <Link className="underline underline-offset-4" to={`/admin/orders/${o.id}`}>
                    {o.orderNumber}
                  </Link>
                </Td>
                <Td>{o.customerName}</Td>
                <Td>{formatPKR(o.total)}</Td>
                <Td>
                  <Badge value={o.status} />
                </Td>
                <Td>
                  <Badge value={o.paymentStatus} />
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
