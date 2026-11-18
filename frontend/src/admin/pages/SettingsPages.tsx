import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  createArea,
  createStaff,
  getSettingsAdmin,
  patchSettings,
  serviceAreas,
  staffList,
  updateArea,
  updateStaff,
} from '@/admin/api';
import { Badge, Card, Empty, PageHeader, Table, Td } from '@/admin/components/ui';
import { Skeleton } from '@/components/ui/States';
import { useSession } from '@/hooks/queries';
import { formatPKR, normalizePhone, PK_MOBILE, rupeesToPaisa } from '@/lib/format';
import { PROVINCES } from '@/types/api';

export function SettingsPage() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['admin-settings'], queryFn: getSettingsAdmin });
  const [flat, setFlat] = useState('');
  const [free, setFree] = useState('');
  const [codOn, setCodOn] = useState(true);
  const [codMax, setCodMax] = useState('');
  const [maxQty, setMaxQty] = useState('10');
  const [days, setDays] = useState('7');
  useEffect(() => {
    if (!data) return;
    setFlat(String(data.shipping.flatRate / 100));
    setFree(data.shipping.freeShippingThreshold != null ? String(data.shipping.freeShippingThreshold / 100) : '');
    setCodOn(data.cod.enabled);
    setCodMax(data.cod.maxOrderValue != null ? String(data.cod.maxOrderValue / 100) : '');
    setMaxQty(String(data.maxQuantityPerLine));
    setDays(String(data.returns?.windowDays ?? 7));
  }, [data]);
  const m = useMutation({
    mutationFn: () => {
      const flatRate = flat.trim() === '0' ? 0 : rupeesToPaisa(flat);
      const freeP = free.trim() ? rupeesToPaisa(free) : null;
      const codP = codMax.trim() ? rupeesToPaisa(codMax) : null;
      if (flatRate == null || (free.trim() && freeP == null) || (codMax.trim() && codP == null))
        throw new Error('Check the money amounts (rupees, up to 2 decimals).');
      const q = Number(maxQty),
        d = Number(days);
      if (!Number.isInteger(q) || q < 1 || q > 99 || !Number.isInteger(d) || d < 0 || d > 90)
        throw new Error('Check the quantity (1–99) and return window (0–90 days).');
      return patchSettings({
        shipping: { flatRate, freeShippingThreshold: freeP },
        cod: { enabled: codOn, maxOrderValue: codP },
        maxQuantityPerLine: q,
        returns: { windowDays: d },
      });
    },
    onSuccess: () => {
      toast.success('Settings saved.');
      qc.invalidateQueries({ queryKey: ['admin-settings'] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  if (!data) return <Skeleton className="h-64" />;
  const f = (id: string, label: string, v: string, s: (x: string) => void, hint?: string) => (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <input id={id} className="field" inputMode="decimal" value={v} onChange={(e) => s(e.target.value)} />
      {hint && <p className="mt-1.5 text-[13px] text-stone">{hint}</p>}
    </div>
  );
  return (
    <>
      <PageHeader
        title="Settings"
        sub="These apply to every new order immediately. Already-placed orders keep the price they were placed at."
      />
      <form
        className="max-w-2xl space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
      >
        <Card title="Delivery charges">
          <div className="space-y-5">
            {f(
              's-flat',
              'Flat delivery fee (Rs)',
              flat,
              setFlat,
              `Currently ${formatPKR(data.shipping.flatRate)}. Confirm your real courier rates.`,
            )}
            {f('s-free', 'Free delivery from (Rs)', free, setFree, 'Leave empty to always charge delivery.')}
          </div>
        </Card>
        <Card title="Cash on delivery">
          <div className="space-y-5">
            <label className="flex items-center gap-2 text-[14px]">
              <input
                type="checkbox"
                className="accent-charcoal"
                checked={codOn}
                onChange={(e) => setCodOn(e.target.checked)}
              />{' '}
              Offer cash on delivery
            </label>
            {f('s-cod', 'Maximum COD order (Rs)', codMax, setCodMax, 'Leave empty for no limit.')}
          </div>
        </Card>
        <Card title="Orders and returns">
          <div className="grid gap-5 sm:grid-cols-2">
            {f('s-qty', 'Max quantity per item', maxQty, setMaxQty)}
            {f('s-days', 'Return window (days after delivery)', days, setDays)}
          </div>
        </Card>
        <button className="btn-primary" disabled={m.isPending}>
          Save settings
        </button>
      </form>
    </>
  );
}

export function ServiceAreasPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['admin-areas'], queryFn: serviceAreas });
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');
  const [cod, setCod] = useState(true);
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin-areas'] });
  const add = useMutation({
    mutationFn: () =>
      createArea({ city: city.trim(), province, codAvailable: cod, couriers: { tcs: true, leopards: true } }),
    onSuccess: () => {
      toast.success('Area added.');
      setCity('');
      refresh();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const upd = useMutation({
    mutationFn: (v: { id: string; b: unknown }) => updateArea(v.id, v.b),
    onSuccess: refresh,
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <>
      <PageHeader
        title="Delivery areas"
        sub="Customers can only order to cities listed here. Turn COD off for areas couriers cannot collect cash."
      />
      <form
        className="mb-6 grid gap-3 border border-taupe p-5 sm:grid-cols-[1fr_1fr_auto_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          if (city.trim().length >= 2 && province) add.mutate();
        }}
      >
        <input
          aria-label="City"
          className="field"
          placeholder="City"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          maxLength={60}
        />
        <select aria-label="Province" className="field" value={province} onChange={(e) => setProvince(e.target.value)}>
          <option value="">Province</option>
          {PROVINCES.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-[14px]">
          <input type="checkbox" className="accent-charcoal" checked={cod} onChange={(e) => setCod(e.target.checked)} />{' '}
          COD
        </label>
        <button className="btn-primary !min-h-[48px]" disabled={add.isPending || !province || city.trim().length < 2}>
          Add
        </button>
      </form>
      {isLoading || !data ? (
        <Skeleton className="h-64" />
      ) : data.length === 0 ? (
        <Empty>No delivery areas yet. Add your first city so customers can check out.</Empty>
      ) : (
        <Table head={['City', 'Province', 'Delivers', 'COD', 'TCS', 'Leopards']}>
          {data.map((a) => (
            <tr key={a.id}>
              <Td>{a.city}</Td>
              <Td className="text-stone">{a.province}</Td>
              {(
                [
                  ['isActive', a.isActive],
                  ['codAvailable', a.codAvailable],
                ] as const
              ).map(([k, v]) => (
                <Td key={k}>
                  <input
                    type="checkbox"
                    aria-label={`${a.city} ${k}`}
                    className="accent-charcoal"
                    checked={v}
                    onChange={(e) => upd.mutate({ id: a.id, b: { [k]: e.target.checked } })}
                  />
                </Td>
              ))}
              {(['tcs', 'leopards'] as const).map((c) => (
                <Td key={c}>
                  <input
                    type="checkbox"
                    aria-label={`${a.city} ${c}`}
                    className="accent-charcoal"
                    checked={a.couriers[c]}
                    onChange={(e) =>
                      upd.mutate({ id: a.id, b: { couriers: { ...a.couriers, [c]: e.target.checked } } })
                    }
                  />
                </Td>
              ))}
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}

export function StaffPage() {
  const qc = useQueryClient();
  const { data: session } = useSession();
  const { data, isLoading } = useQuery({ queryKey: ['admin-staff'], queryFn: staffList });
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', role: 'order_manager' });
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const add = useMutation({
    mutationFn: () => {
      if (form.phone && !PK_MOBILE.test(normalizePhone(form.phone)))
        throw new Error('Enter a Pakistani mobile number or leave it empty.');
      return createStaff({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        role: form.role,
        ...(form.phone ? { phone: normalizePhone(form.phone) } : {}),
      });
    },
    onSuccess: () => {
      toast.success('Staff account created.');
      setOpen(false);
      setForm({ name: '', email: '', phone: '', password: '', role: 'order_manager' });
      qc.invalidateQueries({ queryKey: ['admin-staff'] });
    },
    onError: (e) => setError((e as Error).message),
  });
  const upd = useMutation({
    mutationFn: (v: { id: string; b: { role?: string; status?: string } }) => updateStaff(v.id, v.b),
    onSuccess: () => {
      toast.success('Updated.');
      qc.invalidateQueries({ queryKey: ['admin-staff'] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <>
      <PageHeader
        title="Staff"
        sub="Roles decide what each person can see and do."
        actions={
          !open && (
            <button
              className="btn-primary !min-h-[44px]"
              onClick={() => {
                setError(null);
                setOpen(true);
              }}
            >
              Add staff
            </button>
          )
        }
      />
      {open && (
        <form
          className="mb-6 space-y-4 border border-taupe p-5"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            add.mutate();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                ['name', 'Name'],
                ['email', 'Email'],
                ['phone', 'Mobile (optional)'],
                ['password', 'Temporary password'],
              ] as const
            ).map(([k, l]) => (
              <div key={k}>
                <label htmlFor={`st-${k}`} className="field-label">
                  {l}
                </label>
                <input
                  id={`st-${k}`}
                  className="field"
                  type={k === 'password' ? 'password' : k === 'email' ? 'email' : 'text'}
                  autoComplete={k === 'password' ? 'new-password' : 'off'}
                  value={form[k]}
                  onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                />
              </div>
            ))}
          </div>
          <div>
            <label htmlFor="st-role" className="field-label">
              Role
            </label>
            <select
              id="st-role"
              className="field max-w-xs"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              <option value="product_manager">Product manager</option>
              <option value="order_manager">Order manager</option>
              <option value="support_staff">Support staff</option>
            </select>
          </div>
          <p className="text-[13px] text-stone">
            Password needs 10+ characters with a letter and a number. Ask them to change it after first sign-in.
          </p>
          {error && (
            <p role="alert" className="field-error">
              {error}
            </p>
          )}
          <div className="flex gap-3">
            <button className="btn-primary" disabled={add.isPending}>
              Create account
            </button>
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {isLoading || !data ? (
        <Skeleton className="h-64" />
      ) : (
        <Table head={['Name', 'Email', 'Role', 'Status', '']}>
          {data.map((u) => {
            const self = u.id === session?.user.id;
            const locked = u.role === 'super_admin';
            return (
              <tr key={u.id}>
                <Td>
                  {u.name}
                  {self && <span className="ml-2 text-[11px] uppercase tracking-[0.12em] text-stone">You</span>}
                </Td>
                <Td>{u.email}</Td>
                <Td>
                  {locked ? (
                    'Super admin'
                  ) : (
                    <select
                      aria-label={`Role for ${u.name}`}
                      className="field !w-44 !py-2"
                      value={u.role}
                      onChange={(e) => upd.mutate({ id: u.id, b: { role: e.target.value } })}
                    >
                      <option value="product_manager">Product manager</option>
                      <option value="order_manager">Order manager</option>
                      <option value="support_staff">Support staff</option>
                    </select>
                  )}
                </Td>
                <Td>
                  <Badge value={u.status === 'active' ? 'approved' : 'cancelled'} label={u.status} />
                </Td>
                <Td>
                  {!locked && !self && (
                    <button
                      className="text-[12px] uppercase tracking-[0.14em]"
                      onClick={() =>
                        upd.mutate({ id: u.id, b: { status: u.status === 'active' ? 'suspended' : 'active' } })
                      }
                    >
                      {u.status === 'active' ? 'Suspend' : 'Reactivate'}
                    </button>
                  )}
                </Td>
              </tr>
            );
          })}
        </Table>
      )}
    </>
  );
}
