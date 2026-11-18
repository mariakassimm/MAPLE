import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { CANCELLABLE, OrderBody, StatusPill } from '@/components/ui/OrderParts';
import { ErrorState, Skeleton } from '@/components/ui/States';
import { Stars } from '@/components/ui/Stars';
import { cancelAccountOrder, fetchAccountOrder, submitReview } from '@/services/shop';

function ReviewForm({ productName, slug }: { productName: string; slug: string }) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const m = useMutation({
    mutationFn: () =>
      submitReview({ productSlug: slug, rating, ...(title.trim() ? { title: title.trim() } : {}), body: body.trim() }),
    onSuccess: (r) => {
      toast.success(r.message);
      setOpen(false);
    },
  });
  if (!open)
    return (
      <button className="link-underline text-[12px] uppercase tracking-[0.16em]" onClick={() => setOpen(true)}>
        Review {productName}
      </button>
    );
  return (
    <form
      className="mt-3 space-y-4 border border-taupe p-5"
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate();
      }}
    >
      <p className="font-display text-2xl">{productName}</p>
      <div role="radiogroup" aria-label="Rating" className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            type="button"
            key={n}
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            onClick={() => setRating(n)}
          >
            <Stars value={n <= rating ? 5 : 0} size={22} />
          </button>
        ))}
      </div>
      <input
        className="field"
        placeholder="Title (optional)"
        maxLength={100}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        aria-label="Review title"
      />
      <textarea
        className="field min-h-[110px]"
        required
        minLength={10}
        maxLength={2000}
        placeholder="Share your experience"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        aria-label="Review"
      />
      {m.isError && (
        <p role="alert" className="field-error">
          {(m.error as Error).message}
        </p>
      )}
      <div className="flex gap-3">
        <button className="btn-primary" disabled={m.isPending}>
          Submit review
        </button>
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function OrderDetailPage() {
  const confirm = useConfirm();
  const { orderNumber = '' } = useParams();
  const qc = useQueryClient();
  const {
    data: order,
    isLoading,
    isError,
    refetch,
  } = useQuery({ queryKey: ['account-order', orderNumber], queryFn: () => fetchAccountOrder(orderNumber) });
  const cancel = useMutation({
    mutationFn: () => cancelAccountOrder(orderNumber),
    onSuccess: (o) => {
      qc.setQueryData(['account-order', orderNumber], o);
      qc.invalidateQueries({ queryKey: ['account-orders'] });
      toast.success('Your order has been cancelled.');
    },
    onError: (e) => toast.error((e as Error).message),
  });
  if (isError) return <ErrorState message="We couldn't find that order." onRetry={() => refetch()} />;
  if (isLoading || !order) return <Skeleton className="h-96" />;
  return (
    <div className="max-w-3xl">
      <Link to="/account/orders" className="text-[12px] uppercase tracking-[0.16em] text-stone hover:text-charcoal">
        ← All orders
      </Link>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-4xl">{order.orderNumber}</h2>
        <StatusPill status={order.status} />
      </div>
      <div className="mt-10">
        <OrderBody order={order} />
      </div>
      {order.status === 'delivered' && (
        <section className="mt-12">
          <h3 className="eyebrow mb-4">Share your thoughts</h3>
          <ul className="space-y-4">
            {order.items
              .filter((i) => i.productSlug)
              .map((i) => (
                <li key={i.variantId}>
                  <ReviewForm productName={i.name} slug={i.productSlug!} />
                </li>
              ))}
          </ul>
        </section>
      )}
      {CANCELLABLE.includes(order.status) && (
        <button
          className="btn-secondary mt-12"
          disabled={cancel.isPending}
          onClick={async () => {
            if (
              await confirm({
                title: 'Cancel this order?',
                description: 'This cannot be undone.',
                confirmLabel: 'Cancel order',
                destructive: true,
              })
            )
              cancel.mutate();
          }}
        >
          {cancel.isPending ? 'Cancelling' : 'Cancel order'}
        </button>
      )}
    </div>
  );
}
