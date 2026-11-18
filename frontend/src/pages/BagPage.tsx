import { AnimatePresence } from 'motion/react';
import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { CartLine, CartSummary } from '@/components/cart/CartLines';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { useIsStaff, usePricedCart } from '@/hooks/queries';
import { formatPKR } from '@/lib/format';
import { useSeo } from '@/lib/seo';
import { useCart } from '@/store/cart';

export default function BagPage() {
  useSeo({ title: 'Your Bag', noindex: true });
  const count = useCart((s) => s.lines.length);
  const couponCode = useCart((s) => s.couponCode);
  const setCoupon = useCart((s) => s.setCoupon);
  const [code, setCode] = useState('');
  const staff = useIsStaff();
  const { data: cart, isLoading, isError, refetch } = usePricedCart();
  if (staff) return <Navigate to="/admin" replace />;

  if (count === 0)
    return (
      <div className="page-container">
        <EmptyState
          title="Your bag is empty"
          body="Discover pieces made to be lived in."
          action={{ to: '/shop', label: 'Explore the collection' }}
        />
      </div>
    );
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  return (
    <div className="page-container py-12 sm:py-20">
      <h1 className="text-5xl sm:text-6xl">Your Bag</h1>
      <div className="mt-10 grid gap-12 lg:grid-cols-[1fr_400px]">
        <section aria-label="Items in your bag">
          {isLoading || !cart ? (
            <div className="space-y-5">
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
            </div>
          ) : (
            <ul className="divide-y divide-taupe border-y border-taupe">
              <AnimatePresence initial={false}>
                {cart.lines.map((l) => (
                  <CartLine key={l.variantId} line={l} />
                ))}
              </AnimatePresence>
            </ul>
          )}
        </section>
        <aside className="h-fit space-y-6 bg-ivory p-6 sm:p-8" aria-label="Order summary">
          <h2 className="font-display text-3xl">Summary</h2>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const c = code.trim().toUpperCase();
              if (c) {
                setCoupon(c);
                setCode('');
              }
            }}
          >
            <label htmlFor="coupon" className="sr-only">
              Discount code
            </label>
            <input
              id="coupon"
              className="field"
              placeholder="Discount code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={40}
            />
            <button className="btn-secondary !px-5">Apply</button>
          </form>
          {couponCode && cart?.coupon && (
            <p role="status" className={`text-[13px] ${cart.coupon.valid ? 'text-bronze' : 'text-[#8a2f26]'}`}>
              {cart.coupon.valid
                ? `${cart.coupon.code} applied.`
                : (cart.coupon.message ?? 'This code cannot be used.')}{' '}
              <button className="underline underline-offset-4" onClick={() => setCoupon(null)}>
                Remove
              </button>
            </p>
          )}
          {cart && (
            <>
              {cart.freeShippingRemaining != null && cart.freeShippingRemaining > 0 && (
                <p className="text-[13px] text-stone">
                  Add {formatPKR(cart.freeShippingRemaining)} more for complimentary delivery.
                </p>
              )}
              <CartSummary cart={cart} />
              {cart.canCheckout ? (
                <Link to="/checkout" className="btn-primary w-full">
                  Proceed to checkout
                </Link>
              ) : (
                <>
                  <button disabled className="btn-primary w-full">
                    Proceed to checkout
                  </button>
                  <p role="alert" className="text-[13px] text-[#8a2f26]">
                    Please resolve the items marked above to continue.
                  </p>
                </>
              )}
              <p className="text-center text-[12px] text-stone">
                Final prices and delivery are confirmed by us at checkout.
              </p>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
