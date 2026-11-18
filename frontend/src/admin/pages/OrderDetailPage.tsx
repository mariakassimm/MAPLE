import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  adminOrder,
  attachTracking,
  bookShipment,
  cancelShipment,
  couriers,
  recordCodCollection,
  recordCodRemittance,
  setOrderStatus,
  setShipmentStatus,
  syncShipment,
} from '@/admin/api';
import { Badge, Card, PageHeader, Table, Td } from '@/admin/components/ui';
import { can, ORDER_TRANSITIONS } from '@/admin/permissions';
import type { AdminOrder, ShipmentRow } from '@/admin/types';
import { ErrorState, Skeleton } from '@/components/ui/States';
import { useSession } from '@/hooks/queries';
import { formatDateTime, formatPKR, methodLabel, optionLabel, rupeesToPaisa, statusLabel } from '@/lib/format';

const errToast = (e: unknown) => toast.error((e as Error).message);

function StatusPanel({ order, onDone }: { order: AdminOrder; onDone: () => void }) {
  const confirm = useConfirm();
  const { data: session } = useSession();
  const role = session?.user.role;
  const [reason, setReason] = useState('');
  const next = (ORDER_TRANSITIONS[order.status] ?? []).filter((s) =>
    s === 'cancelled' ? can(role, 'orders:cancel') : can(role, 'orders:write'),
  );
  const m = useMutation({
    mutationFn: (s: string) => setOrderStatus(order.id, s, reason.trim() || undefined),
    onSuccess: () => {
      toast.success('Status updated.');
      setReason('');
      onDone();
    },
    onError: errToast,
  });
  if (next.length === 0) return <p className="text-[14px] text-stone">No further status changes are available.</p>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {next.map((s) => (
          <button
            key={s}
            disabled={m.isPending || (s === 'cancelled' && reason.trim().length < 3)}
            onClick={async () => {
              if (
                s !== 'cancelled' ||
                (await confirm({
                  title: 'Cancel this order?',
                  description: 'Stock is released and any open payment is stopped.',
                  confirmLabel: 'Cancel order',
                  destructive: true,
                }))
              )
                m.mutate(s);
            }}
            className={s === 'cancelled' ? 'btn-secondary !min-h-[42px] !px-5' : 'btn-primary !min-h-[42px] !px-5'}
          >
            {s === 'cancelled' ? 'Cancel order' : `Mark ${statusLabel(s).toLowerCase()}`}
          </button>
        ))}
      </div>
      {next.includes('cancelled') && (
        <div>
          <label htmlFor="reason" className="field-label">
            Reason (required to cancel)
          </label>
          <input
            id="reason"
            className="field"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={200}
          />
        </div>
      )}
    </div>
  );
}

function CodPanel({ order, onDone }: { order: AdminOrder; onDone: () => void }) {
  const cod = order.cod!;
  const [collect, setCollect] = useState('');
  const [remit, setRemit] = useState('');
  const [charges, setCharges] = useState('0');
  const [ref, setRef] = useState('');
  const col = useMutation({
    mutationFn: (a: number) => recordCodCollection(order.id, a),
    onSuccess: () => {
      toast.success('Collection recorded.');
      setCollect('');
      onDone();
    },
    onError: errToast,
  });
  const rem = useMutation({
    mutationFn: (b: { amount: number; courierCharges: number; reference: string }) => recordCodRemittance(order.id, b),
    onSuccess: () => {
      toast.success('Remittance recorded.');
      setRemit('');
      setRef('');
      onDone();
    },
    onError: errToast,
  });
  const outstanding = cod.collectedAmount - cod.remittedAmount - cod.courierCharges;
  return (
    <div className="space-y-6 text-[14px]">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Amount due', cod.amountDue],
          ['Collected by courier', cod.collectedAmount],
          ['Received by us', cod.remittedAmount],
          ['Courier charges', cod.courierCharges],
        ].map(([l, v]) => (
          <div key={l as string}>
            <dt className="text-[11px] uppercase tracking-eyebrow text-stone">{l}</dt>
            <dd className="mt-1 font-display text-2xl">{formatPKR(v as number)}</dd>
          </div>
        ))}
      </dl>
      {cod.collectedAmount > 0 && (
        <p className="text-stone">Outstanding from courier: {formatPKR(Math.max(0, outstanding))}</p>
      )}
      <p className="text-[13px] text-stone">
        An order is marked paid only after the money is received from the courier, never on delivery alone.
      </p>
      {order.status === 'delivered' && cod.collectedAmount === 0 && (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const a = rupeesToPaisa(collect);
            if (!a) return toast.error('Enter the amount collected in rupees.');
            col.mutate(a);
          }}
        >
          <div>
            <label htmlFor="collect" className="field-label">
              Cash collected by courier (Rs)
            </label>
            <input
              id="collect"
              className="field"
              inputMode="decimal"
              value={collect}
              onChange={(e) => setCollect(e.target.value)}
              placeholder={String(cod.amountDue / 100)}
            />
          </div>
          <button className="btn-primary !min-h-[48px]" disabled={col.isPending}>
            Record collection
          </button>
        </form>
      )}
      {cod.collectedAmount > 0 && outstanding > 0 && (
        <form
          className="grid gap-3 sm:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            const a = rupeesToPaisa(remit);
            const c = rupeesToPaisa(charges || '0');
            if (a == null || c == null || ref.trim().length < 3)
              return toast.error('Enter the amount received, courier charges and a reference.');
            rem.mutate({ amount: a, courierCharges: c, reference: ref.trim() });
          }}
        >
          <div>
            <label htmlFor="remit" className="field-label">
              Received (Rs)
            </label>
            <input
              id="remit"
              className="field"
              inputMode="decimal"
              value={remit}
              onChange={(e) => setRemit(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="charges" className="field-label">
              Courier charges (Rs)
            </label>
            <input
              id="charges"
              className="field"
              inputMode="decimal"
              value={charges}
              onChange={(e) => setCharges(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="ref" className="field-label">
              Reference
            </label>
            <input id="ref" className="field" value={ref} onChange={(e) => setRef(e.target.value)} maxLength={60} />
          </div>
          <div className="flex items-end">
            <button className="btn-primary w-full !min-h-[48px]" disabled={rem.isPending}>
              Record remittance
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function ShipmentCard({ s, canWrite, onDone }: { s: ShipmentRow; canWrite: boolean; onDone: () => void }) {
  const confirm = useConfirm();
  const [tracking, setTracking] = useState('');
  const run =
    <T,>(fn: () => Promise<T>, ok: string) =>
    async () => {
      try {
        await fn();
        toast.success(ok);
        onDone();
      } catch (e) {
        errToast(e);
      }
    };
  const manualNext = [
    'picked_up',
    'in_transit',
    'out_for_delivery',
    'delivered',
    'delivery_failed',
    'return_initiated',
    'returned_to_origin',
  ];
  return (
    <li className="border border-taupe p-5 text-[14px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-display text-xl">
          {s.courier.toUpperCase()} {s.trackingNumber ?? <span className="text-stone">no tracking number yet</span>}
        </p>
        <div className="flex gap-2">
          <Badge value={s.status} />
          {s.needsReview && <Badge value="pending" label="Needs check" />}
          {!s.active && <Badge value="cancelled" label="Inactive" />}
        </div>
      </div>
      {s.bookingError && (
        <p role="alert" className="mt-2 text-[#8a2f26]">
          {s.bookingError}
        </p>
      )}
      <p className="mt-2 text-stone">
        {s.weightKg} kg · {s.pieces} pc · COD {formatPKR(s.codAmount)}{' '}
        {s.lastSyncedAt && `· synced ${formatDateTime(s.lastSyncedAt)}`}
      </p>
      {s.events.length > 0 && (
        <ul className="mt-3 space-y-1 text-[13px]">
          {[...s.events]
            .reverse()
            .slice(0, 5)
            .map((e, i) => (
              <li key={i}>
                <span className="text-stone">{formatDateTime(e.at)}</span> {e.description}
              </li>
            ))}
        </ul>
      )}
      {canWrite && s.active && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {s.mode !== 'manual' && s.trackingNumber && (
            <button
              className="btn-secondary !min-h-[40px] !px-4"
              onClick={run(() => syncShipment(s.id), 'Tracking synced.')}
            >
              Sync tracking
            </button>
          )}
          {!s.trackingNumber && (
            <>
              <input
                aria-label="Tracking number"
                className="field !w-48 !py-2"
                placeholder="Tracking number"
                value={tracking}
                onChange={(e) => setTracking(e.target.value)}
              />
              <button
                className="btn-secondary !min-h-[40px] !px-4"
                onClick={run(() => attachTracking(s.id, tracking.trim()), 'Tracking attached.')}
              >
                Attach
              </button>
            </>
          )}
          <select
            aria-label="Set status manually"
            className="field !w-52 !py-2"
            value=""
            onChange={async (e) => {
              const v = e.target.value;
              if (
                v &&
                (await confirm({ title: `Set shipment to “${statusLabel(v)}”?`, confirmLabel: 'Update status' }))
              )
                run(() => setShipmentStatus(s.id, v), 'Status updated.')();
            }}
          >
            <option value="">Set status manually</option>
            {manualNext.map((m) => (
              <option key={m} value={m}>
                {statusLabel(m)}
              </option>
            ))}
          </select>
          <button
            className="text-[12px] uppercase tracking-[0.14em] text-[#8a2f26]"
            onClick={async () => {
              if (await confirm({ title: 'Cancel this shipment?', confirmLabel: 'Cancel shipment', destructive: true }))
                run(() => cancelShipment(s.id), 'Shipment cancelled.')();
            }}
          >
            Cancel shipment
          </button>
        </div>
      )}
    </li>
  );
}

function BookPanel({ order, onDone }: { order: AdminOrder; onDone: () => void }) {
  const { data: configured } = useQuery({ queryKey: ['couriers'], queryFn: couriers, staleTime: 5 * 60_000 });
  const [courier, setCourier] = useState('tcs');
  const [weight, setWeight] = useState('0.5');
  const [pieces, setPieces] = useState('1');
  const [tracking, setTracking] = useState('');
  const m = useMutation({
    mutationFn: () =>
      bookShipment(order.id, {
        courier,
        weightKg: Number(weight),
        pieces: Number(pieces),
        ...(courier === 'manual' && tracking ? { trackingNumber: tracking.trim() } : {}),
      }),
    onSuccess: () => {
      toast.success('Shipment booked.');
      onDone();
    },
    onError: errToast,
  });
  return (
    <form
      className="mt-6 grid gap-3 border-t border-taupe pt-6 sm:grid-cols-5"
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate();
      }}
    >
      <div>
        <label htmlFor="courier" className="field-label">
          Courier
        </label>
        <select id="courier" className="field" value={courier} onChange={(e) => setCourier(e.target.value)}>
          <option value="tcs" disabled={configured?.tcs === false}>
            TCS{configured?.tcs === false ? ' (not configured)' : ''}
          </option>
          <option value="leopards" disabled={configured?.leopards === false}>
            Leopards{configured?.leopards === false ? ' (not configured)' : ''}
          </option>
          <option value="manual">Manual</option>
        </select>
      </div>
      <div>
        <label htmlFor="wt" className="field-label">
          Weight (kg)
        </label>
        <input
          id="wt"
          className="field"
          inputMode="decimal"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="pc" className="field-label">
          Pieces
        </label>
        <input
          id="pc"
          className="field"
          inputMode="numeric"
          value={pieces}
          onChange={(e) => setPieces(e.target.value)}
        />
      </div>
      {courier === 'manual' && (
        <div>
          <label htmlFor="trk" className="field-label">
            Tracking no. (optional)
          </label>
          <input id="trk" className="field" value={tracking} onChange={(e) => setTracking(e.target.value)} />
        </div>
      )}
      <div className="flex items-end">
        <button className="btn-primary w-full !min-h-[48px]" disabled={m.isPending}>
          {m.isPending ? 'Booking' : 'Book shipment'}
        </button>
      </div>
    </form>
  );
}

export default function OrderDetailPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const { data: session } = useSession();
  const role = session?.user.role;
  const {
    data: order,
    isLoading,
    isError,
    refetch,
  } = useQuery({ queryKey: ['admin-order', id], queryFn: () => adminOrder(id) });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['admin-order', id] });
    qc.invalidateQueries({ queryKey: ['admin-orders'] });
  };
  if (isError) return <ErrorState message="We couldn't load this order." onRetry={() => refetch()} />;
  if (isLoading || !order) return <Skeleton className="h-96" />;
  const a = order.shippingAddress;
  const canBook =
    can(role, 'shipments:write') &&
    ['ready_for_dispatch', 'packed', 'processing', 'confirmed'].includes(order.status) &&
    !order.shipments.some((s) => s.active);

  return (
    <>
      <Link to="/admin/orders" className="text-[12px] uppercase tracking-[0.16em] text-stone hover:text-charcoal">
        ← Orders
      </Link>
      <PageHeader
        title={order.orderNumber}
        sub={`Placed ${formatDateTime(order.placedAt)} · ${methodLabel(order.paymentMethod)}${order.demoPayment ? ' · Demo payment, no real money' : ''}`}
        actions={
          <div className="flex gap-2">
            <Badge value={order.status} />
            <Badge value={order.paymentStatus} />
          </div>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card title="Items">
            <Table head={['Item', 'Qty', 'Price', 'Total']}>
              {order.items.map((i) => (
                <tr key={i.variantId}>
                  <Td>
                    {i.name}
                    <br />
                    <span className="text-[12px] text-stone">
                      {i.sku} {i.options.length ? `· ${optionLabel(i.options)}` : ''}
                    </span>
                  </Td>
                  <Td>{i.quantity}</Td>
                  <Td>{formatPKR(i.unitPrice)}</Td>
                  <Td>{formatPKR(i.lineTotal)}</Td>
                </tr>
              ))}
            </Table>
            <dl className="ml-auto mt-4 max-w-xs space-y-1.5 text-[14px]">
              <div className="flex justify-between">
                <dt className="text-stone">Subtotal</dt>
                <dd>{formatPKR(order.subtotal)}</dd>
              </div>
              {order.discountTotal > 0 && (
                <div className="flex justify-between">
                  <dt className="text-stone">Discount {order.couponCode ? `(${order.couponCode})` : ''}</dt>
                  <dd>−{formatPKR(order.discountTotal)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-stone">Delivery</dt>
                <dd>{formatPKR(order.shippingFee)}</dd>
              </div>
              <div className="flex justify-between border-t border-taupe pt-2 text-[16px]">
                <dt>Total</dt>
                <dd className="font-medium">{formatPKR(order.total)}</dd>
              </div>
            </dl>
          </Card>

          {can(role, 'orders:write') && (
            <Card title="Update status">
              <StatusPanel order={order} onDone={refresh} />
            </Card>
          )}
          {order.cod && (
            <Card title="Cash on delivery">
              <CodPanel order={order} onDone={refresh} />
            </Card>
          )}

          <Card title="Shipments">
            {order.shipments.length === 0 ? (
              <p className="text-[14px] text-stone">No shipment yet.</p>
            ) : (
              <ul className="space-y-4">
                {order.shipments.map((s) => (
                  <ShipmentCard key={s.id} s={s} canWrite={can(role, 'shipments:write')} onDone={refresh} />
                ))}
              </ul>
            )}
            {canBook && <BookPanel order={order} onDone={refresh} />}
          </Card>

          {can(role, 'payments:read') && order.payments.length > 0 && (
            <Card title="Payment attempts">
              <Table head={['Reference', 'Provider', 'Amount', 'Status', 'Note']}>
                {order.payments.map((p) => (
                  <tr key={p.paymentRef}>
                    <Td>{p.paymentRef}</Td>
                    <Td>{methodLabel(p.provider)}</Td>
                    <Td>{formatPKR(p.amount)}</Td>
                    <Td>
                      <Badge value={p.status} />
                    </Td>
                    <Td className="text-[13px] text-stone">{p.reviewReason ?? p.responseMessage ?? ''}</Td>
                  </tr>
                ))}
              </Table>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card title="Customer">
            <p className="text-[14px] leading-relaxed">
              {order.customer.name}
              <br />
              {order.customer.phone}
              <br />
              {order.customer.email ?? <span className="text-stone">No email</span>}
            </p>
            {order.userId && <p className="mt-2 text-[12px] text-stone">Registered customer</p>}
          </Card>
          <Card title="Delivery address">
            <address className="text-[14px] not-italic leading-relaxed">
              {a.recipientName ?? order.customer.name}
              <br />
              {a.line1}, {a.area}
              <br />
              {a.city}, {a.province} {a.postalCode ?? ''}
            </address>
            {order.notes && <p className="mt-3 text-[13px] text-stone">Note: {order.notes}</p>}
          </Card>
          <Card title="History">
            <ol className="space-y-3 text-[13px]">
              {[...order.statusHistory].reverse().map((h, i) => (
                <li key={i}>
                  <span className="font-medium">{statusLabel(h.status)}</span>{' '}
                  <span className="text-stone">
                    {formatDateTime(h.at)}
                    {h.actorRole ? ` · ${h.actorRole.replace('_', ' ')}` : ''}
                  </span>
                  {h.reason && <p className="text-stone">{h.reason}</p>}
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}
