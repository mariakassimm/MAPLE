import { useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { useIsStaff, useSession } from '@/hooks/queries';
import { useCart, type CartLine } from '@/store/cart';
import type { PricedCart } from '@/types/api';

/** Pure merge used when a shopper signs in: the larger quantity wins per item, so the same device never doubles a line. */
export function mergeCarts(local: CartLine[], server: CartLine[]): CartLine[] {
  const merged = new Map<string, number>();
  for (const l of [...server, ...local])
    merged.set(l.variantId, Math.min(99, Math.max(merged.get(l.variantId) ?? 0, l.quantity)));
  return [...merged].map(([variantId, quantity]) => ({ variantId, quantity }));
}

/**
 * Signed-in shoppers keep their bag on the server (FR-CART-006). On sign-in the saved bag is merged with the guest bag;
 * afterwards every change is saved. Failures are silent: the local bag always keeps working.
 */
export function useCartSync() {
  const { data: session } = useSession();
  const staff = useIsStaff();
  // Staff accounts have no bag: it is emptied and locked, and nothing is read from or saved to the server.
  useEffect(() => {
    useCart.setState(staff ? { blocked: true, lines: [], couponCode: null } : { blocked: false });
  }, [staff]);
  const userId = staff ? undefined : session?.user.id;
  const ready = useRef<string | null>(null);

  useEffect(() => {
    if (!userId || ready.current === userId) return;
    let cancelled = false;
    (async () => {
      try {
        const { cart } = await api.get<{ cart: PricedCart }>('/cart');
        if (cancelled) return;
        const server = cart.lines
          .filter((l) => l.status !== 'unavailable')
          .map((l) => ({ variantId: l.variantId, quantity: l.quantity }));
        const state = useCart.getState();
        useCart.setState({ lines: mergeCarts(state.lines, server) });
      } catch {
        /* keep the local bag */
      }
      if (!cancelled) ready.current = userId;
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      ready.current = null;
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsub = useCart.subscribe((s) => {
      if (ready.current !== userId) return; // do not overwrite the saved bag before it has been merged
      clearTimeout(timer);
      timer = setTimeout(() => {
        api
          .put('/cart', { items: s.lines, ...(s.couponCode ? { couponCode: s.couponCode } : {}) })
          .catch(() => undefined);
      }, 800);
    });
    return () => {
      clearTimeout(timer);
      unsub();
    };
  }, [userId]);
}
