import { Minus, Plus } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { Link } from 'react-router-dom';
import { Img } from '@/components/ui/Img';
import { kindFor } from '@/components/ui/Placeholder';
import { formatPKR, optionLabel } from '@/lib/format';
import { useCart } from '@/store/cart';
import type { PricedLine } from '@/types/api';

export function CartLine({ line, onNavigate }: { line: PricedLine; onNavigate?: () => void }) {
  const setQty = useCart((s) => s.setLineQuantity);
  const remove = useCart((s) => s.removeLine);
  const reduce = useReducedMotion();
  const unavailable = line.status === 'unavailable';
  const max = line.availableQuantity ?? 99;
  return (
    <motion.li
      layout={!reduce}
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? undefined : { opacity: 0, x: 24 }}
      transition={{ duration: 0.35 }}
      className="flex gap-4 py-5"
    >
      <div className="h-28 w-24 shrink-0 overflow-hidden bg-ivory">
        <Img kind={kindFor(line.name)} image={line.image} width={300} sizes="96px" className="h-full w-full" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex justify-between gap-3">
          <div className="min-w-0">
            {line.productSlug ? (
              <Link
                to={`/products/${line.productSlug}`}
                onClick={onNavigate}
                className="block truncate font-display text-xl leading-tight hover:text-bronze"
              >
                {line.name}
              </Link>
            ) : (
              <p className="font-display text-xl">No longer available</p>
            )}
            {line.options.length > 0 && <p className="mt-0.5 text-[13px] text-stone">{optionLabel(line.options)}</p>}
          </div>
          {!unavailable && <p className="shrink-0 text-[14px]">{formatPKR(line.lineTotal)}</p>}
        </div>
        {line.status === 'insufficient_stock' && (
          <p role="alert" className="mt-1 text-[13px] text-[#8a2f26]">
            Only {line.availableQuantity} left. Please lower the quantity.
          </p>
        )}
        {unavailable && (
          <p role="alert" className="mt-1 text-[13px] text-[#8a2f26]">
            This piece is no longer available.
          </p>
        )}
        <div className="mt-auto flex items-center justify-between pt-3">
          {unavailable ? (
            <span />
          ) : (
            <div className="flex items-center border border-taupe">
              <button
                aria-label="Decrease quantity"
                className="p-2.5 hover:text-bronze"
                onClick={() => setQty(line.variantId, line.quantity - 1)}
              >
                <Minus size={14} />
              </button>
              <span className="w-8 text-center text-[14px]" aria-live="polite">
                {line.quantity}
              </span>
              <button
                aria-label="Increase quantity"
                disabled={line.quantity >= max}
                className="p-2.5 hover:text-bronze disabled:opacity-30"
                onClick={() => setQty(line.variantId, line.quantity + 1)}
              >
                <Plus size={14} />
              </button>
            </div>
          )}
          <button
            onClick={() => remove(line.variantId)}
            className="text-[12px] uppercase tracking-[0.14em] text-stone underline-offset-4 hover:text-charcoal hover:underline"
          >
            Remove
          </button>
        </div>
      </div>
    </motion.li>
  );
}

export function CartSummary({ cart }: { cart: import('@/types/api').PricedCart }) {
  return (
    <dl className="space-y-2.5 text-[14px]">
      <div className="flex justify-between">
        <dt className="text-stone">Subtotal</dt>
        <dd>{formatPKR(cart.subtotal)}</dd>
      </div>
      {cart.discount > 0 && (
        <div className="flex justify-between">
          <dt className="text-stone">Discount{cart.coupon ? ` (${cart.coupon.code})` : ''}</dt>
          <dd>−{formatPKR(cart.discount)}</dd>
        </div>
      )}
      <div className="flex justify-between">
        <dt className="text-stone">Delivery</dt>
        <dd>{cart.shippingFee === 0 ? 'Complimentary' : formatPKR(cart.shippingFee)}</dd>
      </div>
      <div className="flex justify-between border-t border-taupe pt-3 text-[16px]">
        <dt>Total</dt>
        <dd className="font-medium">{formatPKR(cart.total)}</dd>
      </div>
    </dl>
  );
}
