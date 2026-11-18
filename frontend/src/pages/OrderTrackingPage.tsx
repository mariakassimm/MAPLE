import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { OrderLookupForm } from '@/components/ui/OrderLookupForm';
import { CANCELLABLE, OrderBody, StatusPill } from '@/components/ui/OrderParts';
import { useSeo } from '@/lib/seo';
import { cancelGuestOrder, trackOrder } from '@/services/shop';
import type { Order } from '@/types/api';

export default function OrderTrackingPage() {
  const confirm = useConfirm();
  useSeo({ title: 'Track your order', noindex: true });
  const [state, setState] = useState<{ order: Order; phone: string } | null>(null);
  const [cancelling, setCancelling] = useState(false);
  // Links in our emails carry the order number, so the customer only has to add their phone.
  const [params] = useSearchParams();
  const linked = (params.get('order') ?? '').toUpperCase();

  if (!state)
    return (
      <div className="page-container max-w-md py-16 sm:py-24">
        <h1 className="text-center text-5xl">Track your order</h1>
        <p className="mb-8 mt-4 text-center text-[15px] text-stone">
          Enter your order number and the mobile number you used at checkout.
        </p>
        <OrderLookupForm
          label="Track order"
          initialOrder={/^MPL-[A-Z0-9]{8}$/.test(linked) ? linked : undefined}
          onSubmit={async (n, p) => setState({ order: await trackOrder(n, p), phone: p })}
        />
      </div>
    );
  const { order, phone } = state;
  async function cancel() {
    if (
      !(await confirm({
        title: 'Cancel this order?',
        description: 'This cannot be undone.',
        confirmLabel: 'Cancel order',
        destructive: true,
      }))
    )
      return;
    setCancelling(true);
    try {
      setState({ order: await cancelGuestOrder(order.orderNumber, phone), phone });
      toast.success('Your order has been cancelled.');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCancelling(false);
    }
  }
  return (
    <div className="page-container max-w-3xl py-14 sm:py-24">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="eyebrow">Order</p>
          <h1 className="mt-2 text-4xl sm:text-5xl">{order.orderNumber}</h1>
        </div>
        <StatusPill status={order.status} />
      </div>
      <div className="mt-12">
        <OrderBody order={order} />
      </div>
      <div className="mt-12 flex flex-wrap gap-4">
        {CANCELLABLE.includes(order.status) && (
          <button onClick={cancel} disabled={cancelling} className="btn-secondary">
            {cancelling ? 'Cancelling' : 'Cancel order'}
          </button>
        )}
        <button onClick={() => setState(null)} className="btn-ghost">
          Look up another order
        </button>
      </div>
    </div>
  );
}
