import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CartLine {
  variantId: string;
  quantity: number;
}
const MAX_QTY = 99;

interface CartState {
  lines: CartLine[];
  /** True while a staff account is signed in: the bag is closed for them (never persisted). */
  blocked: boolean;
  couponCode: string | null;
  addLine: (variantId: string, quantity?: number) => void;
  setLineQuantity: (variantId: string, quantity: number) => void;
  removeLine: (variantId: string) => void;
  setCoupon: (code: string | null) => void;
  clear: () => void;
  totalUnits: () => number;
}

// Only variant ids and quantities are stored; every price shown comes from the server (POST /cart/price).
export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      lines: [],
      blocked: false,
      couponCode: null,
      addLine: (variantId, quantity = 1) =>
        set((s) => {
          if (s.blocked) return s;
          const found = s.lines.find((l) => l.variantId === variantId);
          if (found)
            return {
              lines: s.lines.map((l) =>
                l.variantId === variantId ? { ...l, quantity: Math.min(MAX_QTY, l.quantity + quantity) } : l,
              ),
            };
          return { lines: [...s.lines, { variantId, quantity: Math.min(MAX_QTY, quantity) }] };
        }),
      setLineQuantity: (variantId, quantity) =>
        set((s) =>
          s.blocked
            ? s
            : {
                lines:
                  quantity <= 0
                    ? s.lines.filter((l) => l.variantId !== variantId)
                    : s.lines.map((l) =>
                        l.variantId === variantId ? { ...l, quantity: Math.min(MAX_QTY, quantity) } : l,
                      ),
              },
        ),
      removeLine: (variantId) => set((s) => ({ lines: s.lines.filter((l) => l.variantId !== variantId) })),
      setCoupon: (couponCode) => set({ couponCode }),
      clear: () => set({ lines: [], couponCode: null }),
      totalUnits: () => get().lines.reduce((n, l) => n + l.quantity, 0),
    }),
    { name: 'maple-cart', version: 1, partialize: (s) => ({ lines: s.lines, couponCode: s.couponCode }) },
  ),
);
