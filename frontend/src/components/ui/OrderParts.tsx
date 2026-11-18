import { Link } from 'react-router-dom';
import { Img } from '@/components/ui/Img';
import { formatDateTime, formatPKR, methodLabel, optionLabel, statusLabel } from '@/lib/format';
import type { Order } from '@/types/api';

export const StatusPill = ({ status }: { status: string }) => (
  <span className="inline-block bg-ivory px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-bronze">
    {statusLabel(status)}
  </span>
);

export function Timeline({ order }: { order: Order }) {
  return (
    <ol className="space-y-4 border-l border-taupe pl-6">
      {[...order.timeline].reverse().map((t, i) => (
        <li key={`${t.status}-${t.at}`} className="relative">
          <span
            className={`absolute -left-[29px] top-1.5 h-2.5 w-2.5 rounded-full ${i === 0 ? 'bg-bronze' : 'bg-taupe'}`}
            aria-hidden
          />
          <p className="text-[14px]">{statusLabel(t.status)}</p>
          <p className="text-[12px] text-stone">{formatDateTime(t.at)}</p>
        </li>
      ))}
    </ol>
  );
}

export function OrderBody({ order }: { order: Order }) {
  const a = order.shippingAddress;
  return (
    <div className="space-y-10">
      <section aria-label="Items">
        <ul className="divide-y divide-taupe border-y border-taupe">
          {order.items.map((i) => (
            <li key={i.variantId} className="flex gap-4 py-4">
              <div className="h-24 w-20 shrink-0 bg-ivory">
                <Img image={i.image} width={200} sizes="80px" className="h-full w-full" />
              </div>
              <div className="flex-1">
                <p className="font-display text-xl">{i.name}</p>
                {i.options.length > 0 && <p className="text-[13px] text-stone">{optionLabel(i.options)}</p>}
                <p className="mt-1 text-[13px] text-stone">Qty {i.quantity}</p>
              </div>
              <p className="text-[14px]">{formatPKR(i.lineTotal)}</p>
            </li>
          ))}
        </ul>
      </section>
      <div className="grid gap-10 sm:grid-cols-2">
        <section>
          <h3 className="eyebrow mb-3">Delivery address</h3>
          <address className="text-[14px] not-italic leading-relaxed text-stone">
            {a.recipientName ?? order.customer.name}
            <br />
            {a.line1 ? `${a.line1}, ` : ''}
            {a.area}
            <br />
            {a.city}, {a.province}
            {a.postalCode ? ` ${a.postalCode}` : ''}
            <br />
            {a.phone ?? order.customer.phone}
          </address>
        </section>
        <section>
          <h3 className="eyebrow mb-3">Payment</h3>
          <p className="text-[14px] text-stone">
            {methodLabel(order.paymentMethod)}
            <br />
            {statusLabel(order.paymentStatus)}
          </p>
        </section>
      </div>
      <dl className="ml-auto max-w-xs space-y-2 text-[14px]">
        <div className="flex justify-between">
          <dt className="text-stone">Subtotal</dt>
          <dd>{formatPKR(order.subtotal)}</dd>
        </div>
        {order.discountTotal > 0 && (
          <div className="flex justify-between">
            <dt className="text-stone">Discount</dt>
            <dd>−{formatPKR(order.discountTotal)}</dd>
          </div>
        )}
        <div className="flex justify-between">
          <dt className="text-stone">Delivery</dt>
          <dd>{order.shippingFee === 0 ? 'Complimentary' : formatPKR(order.shippingFee)}</dd>
        </div>
        <div className="flex justify-between border-t border-taupe pt-3 text-[16px]">
          <dt>Total</dt>
          <dd className="font-medium">{formatPKR(order.total)}</dd>
        </div>
      </dl>
      {order.shipment && (
        <section>
          <h3 className="eyebrow mb-3">
            Shipment · {order.shipment.courier.toUpperCase()} · {order.shipment.trackingNumber}
          </h3>
          <ul className="space-y-3 text-[14px]">
            {order.shipment.events.slice(0, 8).map((e, i) => (
              <li key={i}>
                <span className="text-stone">{formatDateTime(e.at)}</span> {e.description}
                {e.location ? `, ${e.location}` : ''}
              </li>
            ))}
          </ul>
        </section>
      )}
      <section>
        <h3 className="eyebrow mb-4">Progress</h3>
        <Timeline order={order} />
      </section>
      {order.status === 'delivered' && (
        <p className="text-[13px] text-stone">
          Need to send something back?{' '}
          <Link to="/returns" className="link-underline">
            Request a return
          </Link>
        </p>
      )}
    </div>
  );
}

export const CANCELLABLE = ['awaiting_payment', 'pending_confirmation'];
