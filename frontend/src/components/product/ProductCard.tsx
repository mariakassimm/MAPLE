import { Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import type { ProductCard as Card } from '@/types/api';
import { Img } from '@/components/ui/Img';
import { Sparkles } from '@/components/ui/Sparkles';
import { kindFor } from '@/components/ui/Placeholder';
import { Price } from '@/components/ui/Price';
import { Stars } from '@/components/ui/Stars';
import { useCart } from '@/store/cart';
import { useUi } from '@/store/ui';

export function ProductCard({ product }: { product: Card }) {
  const [first, second] = product.images;
  const addLine = useCart((s) => s.addLine);
  const openCart = useUi((s) => s.openCart);
  const blocked = useCart((s) => s.blocked);
  const seed = [...product.slug].reduce((n, ch) => n + ch.charCodeAt(0), 0);
  const href = `/products/${product.slug}`;
  return (
    <article className="group">
      <div className="sheen-hover relative aspect-[4/5] overflow-hidden bg-ivory">
        {product.featured && <Sparkles count={2} />}
        <Link to={href} tabIndex={-1} aria-hidden className="absolute inset-0 block">
          <Img
            seed={seed}
            kind={kindFor(`${product.category?.slug ?? ''} ${product.name}`)}
            image={first}
            className="absolute inset-0 h-full w-full transition duration-[1200ms] ease-luxe group-hover:scale-[1.03]"
          />
          {second && (
            <Img
              image={second}
              className="absolute inset-0 h-full w-full opacity-0 transition-opacity duration-700 ease-luxe group-hover:opacity-100"
            />
          )}
        </Link>
        {!product.inStock && (
          <span className="absolute left-3 top-3 bg-paper/90 px-3 py-1 text-[10px] uppercase tracking-eyebrow text-stone">
            Sold out
          </span>
        )}
        {product.compareAtPrice && product.inStock && (
          <span className="absolute left-3 top-3 bg-charcoal px-3 py-1 text-[10px] uppercase tracking-eyebrow text-paper">
            Sale
          </span>
        )}
        {product.isNew && product.inStock && !product.compareAtPrice && (
          <span className="absolute left-3 top-3 bg-paper/95 px-3 py-1 text-[10px] uppercase tracking-eyebrow text-bronze">
            New
          </span>
        )}
        {product.quickAddVariantId && !blocked && (
          <button
            type="button"
            aria-label={`Quick add ${product.name} to bag`}
            onClick={() => {
              addLine(product.quickAddVariantId!, 1);
              toast.success(`${product.name} added to your bag`);
              openCart();
            }}
            className="absolute bottom-3 right-3 flex h-11 w-11 items-center justify-center bg-paper/95 text-charcoal shadow-sm transition duration-500 ease-luxe hover:bg-charcoal hover:text-paper sm:translate-y-2 sm:opacity-0 sm:group-hover:translate-y-0 sm:group-hover:opacity-100 sm:focus-visible:translate-y-0 sm:focus-visible:opacity-100"
          >
            <Plus size={18} strokeWidth={1.4} />
          </button>
        )}
      </div>
      <Link to={href} className="mt-4 block space-y-1.5">
        <h3 className="font-display text-[22px] leading-tight">{product.name}</h3>
        <Price price={product.price} compareAt={product.compareAtPrice} from={product.hasPriceRange} />
        {product.colors.length > 1 && <p className="text-[12px] text-stone">{product.colors.length} colours</p>}
        {product.rating && (
          <div className="flex items-center gap-2 text-[12px] text-stone">
            <Stars value={product.rating.average} size={12} />({product.rating.count})
          </div>
        )}
      </Link>
    </article>
  );
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-10 lg:grid-cols-4 lg:gap-x-6" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div key={i}>
          <div className="aspect-[4/5] animate-pulse bg-taupe/50" />
          <div className="mt-4 h-5 w-2/3 animate-pulse bg-taupe/50" />
        </div>
      ))}
    </div>
  );
}
