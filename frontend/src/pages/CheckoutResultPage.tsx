import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AutoPostForm } from '@/components/ui/AutoPostForm';
import { OrderLookupForm } from '@/components/ui/OrderLookupForm';
import { OrderBody, StatusPill } from '@/components/ui/OrderParts';
import { Spinner } from '@/components/ui/States';
import { useSeo } from '@/lib/seo';
import { initiatePayment, trackOrder } from '@/services/shop';
import type { Order, RedirectForm } from '@/types/api';

const readLast = (orderNumber: string): string | null => {
  try {
    const v = JSON.parse(sessionStorage.getItem('maple-last-order') ?? 'null') as {
      orderNumber: string;
      phone: string;
    } | null;
    return v?.orderNumber === orderNumber ? v.phone : null;
  } catch {
    return null;
  }
};
const IN_FLIGHT = ['unpaid', 'pending', 'processing'];
const FAILED = ['failed', 'cancelled', 'expired'];

/**
 * Nothing on this page comes from the URL except the order number. What it says about payment is whatever the server
 * reports for that order, which only a verified provider message can change.
 */
export default function CheckoutResultPage() {
  useSeo({ title: 'Order status', noindex: true });
  const [params] = useSearchParams();
  const orderNumber = (params.get('order') ?? '').toUpperCase();
  const [phone, setPhone] = useState<string | null>(() => readLast(orderNumber));
  const [redirect, setRedirect] = useState<RedirectForm | null>(null);
  const [polls, setPolls] = useState(0);

  const {
    data: order,
    isError,
    error,
  } = useQuery({
    queryKey: ['order-result', orderNumber, phone],
    enabled: !!phone && /^MPL-[A-Z0-9]{8}$/.test(orderNumber),
    queryFn: async () => {
      setPolls((n) => n + 1);
      return trackOrder(orderNumber, phone!);
    },
    refetchInterval: (q) => {
      const o = q.state.data as Order | undefined;
      return o &&
        o.paymentMethod !== 'cod' &&
        IN_FLIGHT.includes(o.paymentStatus) &&
        o.status === 'awaiting_payment' &&
        polls < 30
        ? 4000
        : false;
    },
    retry: false,
  });
  const retry = useMutation({
    mutationFn: () => initiatePayment(order!.paymentMethod as 'jazzcash' | 'easypaisa', order!.orderNumber, phone!),
    onSuccess: (r) => setRedirect(r.redirect),
  });

  if (redirect)
    return (
      <div className="page-container py-32">
        <AutoPostForm form={redirect} />
      </div>
    );
  if (!phone || (isError && (error as { status?: number }).status === 404)) {
    return (
      <div className="page-container max-w-md py-16 sm:py-24">
        <h1 className="text-center text-5xl">Order status</h1>
        <p className="mb-8 mt-4 text-center text-[15px] text-stone">
          Enter your mobile number to see the latest status of your order.
        </p>
        <OrderLookupForm
          initialOrder={orderNumber}
          label="View order"
          onSubmit={async (n, p) => {
            await trackOrder(n, p);
            setPhone(p);
            try {
              sessionStorage.setItem('maple-last-order', JSON.stringify({ orderNumber: n, phone: p }));
            } catch {
              /* ignore */
            }
          }}
        />
      </div>
    );
  }
  if (!order)
    return (
      <div className="py-40">
        {isError ? (
          <p role="alert" className="text-center text-stone">
            We couldn't load your order. Please refresh.
          </p>
        ) : (
          <Spinner label="Checking your order" />
        )}
      </div>
    );

  const online = order.paymentMethod !== 'cod';
  const paid = order.paymentStatus === 'paid';
  const failed = online && FAILED.includes(order.paymentStatus) && order.status === 'awaiting_payment';
  const waiting =
    online && !paid && !failed && IN_FLIGHT.includes(order.paymentStatus) && order.status === 'awaiting_payment';
  const cancelled = order.status === 'cancelled';

  const heading = cancelled
    ? 'Order cancelled'
    : paid
      ? 'Payment received'
      : failed
        ? "Payment didn't go through"
        : waiting
          ? 'Confirming your payment'
          : 'Thank you for your order';
  const body = cancelled
    ? 'This order has been cancelled.'
    : paid
      ? 'Your payment has been verified. We are preparing your order.'
      : failed
        ? 'Your order is saved, but we have not received the payment. You can try paying again.'
        : waiting
          ? polls >= 30
            ? 'Your bank is taking longer than usual. You can leave this page; we will email you once it is confirmed.'
            : 'Please keep this page open while we confirm with your payment provider.'
          : `We've received your order and will confirm it shortly${order.customer.email ? `, then email ${order.customer.email}` : ''}. You'll pay in cash on delivery.`;

  return (
    <div className="page-container max-w-3xl py-14 sm:py-24">
      <div className="text-center" role="status" aria-live="polite">
        {waiting && polls < 30 && (
          <div className="mb-6">
            <Spinner label="Confirming payment" />
          </div>
        )}
        <p className="eyebrow">Order {order.orderNumber}</p>
        <h1 className="mt-3 text-5xl sm:text-6xl">{heading}</h1>
        <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-stone">{body}</p>
        <div className="mt-5">
          <StatusPill status={order.status} />
        </div>
      </div>
      {failed && (
        <div className="mt-8 text-center">
          <button className="btn-primary" disabled={retry.isPending} onClick={() => retry.mutate()}>
            {retry.isPending ? 'Opening payment' : 'Try payment again'}
          </button>
          {retry.isError && (
            <p role="alert" className="field-error">
              {(retry.error as Error).message}
            </p>
          )}
        </div>
      )}
      <div className="mt-14">
        <OrderBody order={order} />
      </div>
      <div className="mt-12 flex flex-wrap justify-center gap-4">
        <Link to="/shop" className="btn-secondary">
          Continue shopping
        </Link>
        <Link to="/order-tracking" className="btn-ghost">
          Track an order
        </Link>
      </div>
    </div>
  );
}
