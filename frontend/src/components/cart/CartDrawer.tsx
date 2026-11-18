import { AnimatePresence } from 'motion/react';
import { Link } from 'react-router-dom';
import { Drawer } from '@/components/ui/Drawer';
import { Skeleton } from '@/components/ui/States';
import { CartLine, CartSummary } from '@/components/cart/CartLines';
import { usePricedCart } from '@/hooks/queries';
import { formatPKR } from '@/lib/format';
import { useCart } from '@/store/cart';
import { useUi } from '@/store/ui';

export function CartDrawer() {
  const open = useUi((s) => s.cartOpen);
  const close = useUi((s) => s.closeCart);
  const count = useCart((s) => s.lines.length);
  const { data: cart, isLoading, isError, refetch } = usePricedCart();

  return (
    <Drawer open={open} onClose={close} title="Your Bag">
      {count === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <p className="font-display text-3xl">Your bag is empty</p>
          <p className="mt-3 text-[15px] text-stone">Discover pieces made to be lived in.</p>
          <Link to="/shop" onClick={close} className="btn-secondary mt-8">
            Explore the collection
          </Link>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto px-6">
            {isLoading && (
              <div className="space-y-5 py-5">
                <Skeleton className="h-28" />
                <Skeleton className="h-28" />
              </div>
            )}
            {isError && (
              <div role="alert" className="py-8 text-center text-[14px] text-stone">
                We couldn't update your bag.{' '}
                <button className="underline" onClick={() => refetch()}>
                  Try again
                </button>
              </div>
            )}
            {cart && (
              <ul className="divide-y divide-taupe">
                <AnimatePresence initial={false}>
                  {cart.lines.map((l) => (
                    <CartLine key={l.variantId} line={l} onNavigate={close} />
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </div>
          {cart && (
            <div className="space-y-5 border-t border-taupe bg-paper px-6 py-6">
              {cart.freeShippingRemaining != null && cart.freeShippingRemaining > 0 && (
                <p className="text-[13px] text-stone">
                  Add {formatPKR(cart.freeShippingRemaining)} more for complimentary delivery.
                </p>
              )}
              <CartSummary cart={cart} />
              <div className="grid gap-3">
                {cart.canCheckout ? (
                  <Link to="/checkout" onClick={close} className="btn-primary">
                    Checkout
                  </Link>
                ) : (
                  <button disabled className="btn-primary">
                    Checkout
                  </button>
                )}
                <Link to="/bag" onClick={close} className="btn-ghost">
                  View bag
                </Link>
              </div>
              <p className="text-center text-[12px] text-stone">Prices are confirmed by us at checkout.</p>
            </div>
          )}
        </>
      )}
    </Drawer>
  );
}
