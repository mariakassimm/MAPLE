import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  addCustomerNote,
  adminCoupons,
  adminCustomer,
  adminCustomers,
  createCoupon,
  updateCoupon,
  type AdminCoupon,
} from '@/admin/api';
import { Badge, Card, Empty, PageHeader, Pager, Stat, Table, Td } from '@/admin/components/ui';
import { can } from '@/admin/permissions';
import { ErrorState, Skeleton } from '@/components/ui/States';
import { useSession } from '@/hooks/queries';
import { formatDate, formatDateTime, formatPKR, rupeesToPaisa } from '@/lib/format';

export function CustomersPage() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const q = { page, limit: 20, q: params.get('q') ?? undefined };
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-customers', q],
    queryFn: () => adminCustomers(q),
    placeholderData: (p) => p,
  });
  return (
    <>
      <PageHeader title="Customers" />
      <form
        role="search"
        className="mb-6 max-w-sm"
        onSubmit={(e) => {
          e.preventDefault();
          const v = String(new FormData(e.currentTarget).get('q') ?? '').trim();
          setParams(v ? { q: v } : {});
        }}
      >
        <input
          name="q"
          className="field"
          aria-label="Search customers"
          placeholder="Name, email or phone"
          defaultValue={params.get('q') ?? ''}
        />
      </form>
      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isLoading || !data ? (
        <Skeleton className="h-80" />
      ) : data.items.length === 0 ? (
        <Empty>No customers found.</Empty>
      ) : (
        <>
          <Table head={['Name', 'Contact', 'Orders', 'Spent', 'Joined', 'Status']}>
            {data.items.map((c) => (
              <tr key={c.id}>
                <Td>
                  <Link className="underline underline-offset-4" to={`/admin/customers/${c.id}`}>
                    {c.name}
                  </Link>
                </Td>
                <Td>
                  {c.email}
                  <br />
                  <span className="text-[12px] text-stone">{c.phone ?? ''}</span>
                </Td>
                <Td>{c.orders}</Td>
                <Td>{formatPKR(c.totalSpent)}</Td>
                <Td className="text-stone">{formatDate(c.joinedAt)}</Td>
                <Td>
                  <Badge value={c.status === 'active' ? 'approved' : 'cancelled'} label={c.status} />
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

export function CustomerDetailPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const { data: session } = useSession();
  const [note, setNote] = useState('');
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-customer', id],
    queryFn: () => adminCustomer(id),
  });
  const add = useMutation({
    mutationFn: () => addCustomerNote(id, note.trim()),
    onSuccess: () => {
      setNote('');
      qc.invalidateQueries({ queryKey: ['admin-customer', id] });
      toast.success('Note added.');
    },
    onError: (e) => toast.error((e as Error).message),
  });
  if (isError) return <ErrorState onRetry={() => refetch()} />;
  if (isLoading || !data) return <Skeleton className="h-96" />;
  const c = data.customer;
  return (
    <>
      <Link to="/admin/customers" className="text-[12px] uppercase tracking-[0.16em] text-stone hover:text-charcoal">
        ← Customers
      </Link>
      <PageHeader
        title={c.name}
        sub={`${c.email}${c.phone ? ` · ${c.phone}` : ''} · joined ${formatDate(c.createdAt)}${c.lastLoginAt ? ` · last seen ${formatDate(c.lastLoginAt)}` : ''}`}
      />
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Orders" value={data.stats.orders} />
        <Stat label="Total spent" value={formatPKR(data.stats.totalSpent)} />
        <Stat label="Cancelled" value={data.stats.cancelled} />
        <Stat label="Returns" value={data.stats.returns} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Recent orders">
          {data.recentOrders.length === 0 ? (
            <Empty>No orders.</Empty>
          ) : (
            <Table head={['Order', 'Total', 'Status']}>
              {data.recentOrders.map((o) => (
                <tr key={o.id}>
                  <Td>
                    <Link className="underline underline-offset-4" to={`/admin/orders/${o.id}`}>
                      {o.orderNumber}
                    </Link>
                  </Td>
                  <Td>{formatPKR(o.total)}</Td>
                  <Td>
                    <Badge value={o.status} />
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
        <Card title="Internal notes">
          <p className="mb-3 text-[12px] text-stone">Visible to staff only.</p>
          {can(session?.user.role, 'customers:notes') && (
            <form
              className="mb-5 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (note.trim().length >= 2) add.mutate();
              }}
            >
              <textarea
                aria-label="New note"
                className="field min-h-[80px]"
                maxLength={1000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <button className="btn-secondary !min-h-[42px]" disabled={add.isPending || note.trim().length < 2}>
                Add note
              </button>
            </form>
          )}
          {data.notes.length === 0 ? (
            <p className="text-[14px] text-stone">No notes.</p>
          ) : (
            <ul className="space-y-4 text-[14px]">
              {data.notes.map((n) => (
                <li key={n.id}>
                  <p className="whitespace-pre-line">{n.body}</p>
                  <p className="text-[12px] text-stone">
                    {n.author} · {formatDateTime(n.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : '');
function CouponForm({ c, onDone }: { c?: AdminCoupon; onDone: () => void }) {
  const qc = useQueryClient();
  const [code, setCode] = useState(c?.code ?? '');
  const [description, setDescription] = useState(c?.description ?? '');
  const [type, setType] = useState<'percent' | 'fixed'>(c?.type ?? 'percent');
  const [value, setValue] = useState(c ? String(c.type === 'fixed' ? c.value / 100 : c.value) : '');
  const [min, setMin] = useState(c?.minOrderValue ? String(c.minOrderValue / 100) : '');
  const [max, setMax] = useState(c?.maxDiscount ? String(c.maxDiscount / 100) : '');
  const [starts, setStarts] = useState(toDateInput(c?.startsAt ?? null));
  const [expires, setExpires] = useState(toDateInput(c?.expiresAt ?? null));
  const [limit, setLimit] = useState(c?.usageLimit ? String(c.usageLimit) : '');
  const [active, setActive] = useState(c?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: () => {
      const v = type === 'percent' ? Number(value) : rupeesToPaisa(value);
      if (!v || !Number.isInteger(v) || v < 1)
        throw new Error(
          type === 'percent' ? 'Enter a whole percentage from 1 to 100.' : 'Enter the discount amount in rupees.',
        );
      const minP = min.trim() ? rupeesToPaisa(min) : 0;
      const maxP = max.trim() ? rupeesToPaisa(max) : null;
      if (minP == null || (max.trim() && maxP == null))
        throw new Error('Check the minimum order and maximum discount amounts.');
      const lim = limit.trim() ? Number(limit) : null;
      if (lim != null && (!Number.isInteger(lim) || lim < 1)) throw new Error('Usage limit must be a whole number.');
      const body = {
        code: code.trim().toUpperCase(),
        description: description.trim(),
        type,
        value: v,
        minOrderValue: minP,
        maxDiscount: maxP,
        startsAt: starts ? new Date(starts).toISOString() : null,
        expiresAt: expires ? new Date(`${expires}T23:59:59+05:00`).toISOString() : null,
        usageLimit: lim,
        isActive: active,
      };
      return c ? updateCoupon(c.id, body) : createCoupon(body);
    },
    onSuccess: () => {
      toast.success('Coupon saved.');
      qc.invalidateQueries({ queryKey: ['admin-coupons'] });
      onDone();
    },
    onError: (e) => setError((e as Error).message),
  });
  const f = (
    id: string,
    label: string,
    val: string,
    set: (v: string) => void,
    extra: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <input id={id} className="field" value={val} onChange={(e) => set(e.target.value)} {...extra} />
    </div>
  );
  return (
    <form
      className="mb-6 space-y-5 border border-taupe p-5"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        m.mutate();
      }}
    >
      <div className="grid gap-5 sm:grid-cols-3">
        {f('cp-code', 'Code', code, setCode, { maxLength: 40 })}
        <div>
          <label htmlFor="cp-type" className="field-label">
            Type
          </label>
          <select
            id="cp-type"
            className="field"
            value={type}
            onChange={(e) => setType(e.target.value as 'percent' | 'fixed')}
          >
            <option value="percent">Percentage</option>
            <option value="fixed">Fixed amount (Rs)</option>
          </select>
        </div>
        {f('cp-val', type === 'percent' ? 'Percent off' : 'Amount off (Rs)', value, setValue, { inputMode: 'decimal' })}
      </div>
      {f('cp-desc', 'Description (internal)', description, setDescription, { maxLength: 200 })}
      <div className="grid gap-5 sm:grid-cols-3">
        {f('cp-min', 'Minimum order (Rs)', min, setMin, { inputMode: 'decimal' })}
        {f('cp-max', 'Maximum discount (Rs)', max, setMax, { inputMode: 'decimal' })}
        {f('cp-lim', 'Usage limit', limit, setLimit, { inputMode: 'numeric' })}
      </div>
      <div className="grid gap-5 sm:grid-cols-3">
        {f('cp-s', 'Starts', starts, setStarts, { type: 'date' })}
        {f('cp-e', 'Expires (end of day, PKT)', expires, setExpires, { type: 'date' })}
        <label className="flex items-end gap-2 pb-3 text-[14px]">
          <input
            type="checkbox"
            className="accent-charcoal"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />{' '}
          Active
        </label>
      </div>
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <button className="btn-primary" disabled={m.isPending}>
          Save coupon
        </button>
        <button type="button" className="btn-ghost" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function CouponsPage() {
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['admin-coupons'], queryFn: adminCoupons });
  const [editing, setEditing] = useState<AdminCoupon | 'new' | null>(null);
  if (isError) return <ErrorState onRetry={() => refetch()} />;
  return (
    <>
      <PageHeader
        title="Coupons"
        actions={
          !editing && (
            <button className="btn-primary !min-h-[44px]" onClick={() => setEditing('new')}>
              New coupon
            </button>
          )
        }
      />
      {editing && (
        <CouponForm
          key={editing === 'new' ? 'new' : editing.id}
          c={editing === 'new' ? undefined : editing}
          onDone={() => setEditing(null)}
        />
      )}
      {isLoading || !data ? (
        <Skeleton className="h-64" />
      ) : data.length === 0 ? (
        <Empty>No coupons yet.</Empty>
      ) : (
        <Table head={['Code', 'Discount', 'Min order', 'Used', 'Expires', 'Status', '']}>
          {data.map((c) => (
            <tr key={c.id}>
              <Td className="font-medium">{c.code}</Td>
              <Td>
                {c.type === 'percent' ? `${c.value}%` : formatPKR(c.value)}
                {c.maxDiscount ? <span className="text-stone"> (max {formatPKR(c.maxDiscount)})</span> : null}
              </Td>
              <Td>{c.minOrderValue ? formatPKR(c.minOrderValue) : '–'}</Td>
              <Td>
                {c.usedCount}
                {c.usageLimit ? ` / ${c.usageLimit}` : ''}
              </Td>
              <Td className="text-stone">{c.expiresAt ? formatDate(c.expiresAt) : 'Never'}</Td>
              <Td>
                <Badge value={c.isActive ? 'approved' : 'cancelled'} label={c.isActive ? 'Active' : 'Off'} />
              </Td>
              <Td>
                <button className="text-[12px] uppercase tracking-[0.14em]" onClick={() => setEditing(c)}>
                  Edit
                </button>
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
