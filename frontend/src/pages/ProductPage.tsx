import { Check } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ProductCard } from '@/components/product/ProductCard';
import { Img } from '@/components/ui/Img';
import { kindFor, type PlaceholderKind } from '@/components/ui/Placeholder';
import { Price } from '@/components/ui/Price';
import { Stars } from '@/components/ui/Stars';
import { ErrorState, Skeleton } from '@/components/ui/States';
import { useProduct, useProducts, useReviews } from '@/hooks/queries';
import { formatDate } from '@/lib/format';
import { breadcrumbJsonLd, productJsonLd, useSeo } from '@/lib/seo';
import { useCart } from '@/store/cart';
import { useUi } from '@/store/ui';
import type { ProductDetail, Variant } from '@/types/api';

const optionNames = (p: ProductDetail) => [...new Set(p.variants.flatMap((v) => v.options.map((o) => o.name)))];
const valuesFor = (p: ProductDetail, name: string) => [
  ...new Set(p.variants.flatMap((v) => v.options.filter((o) => o.name === name).map((o) => o.value))),
];

function Reviews({ slug }: { slug: string }) {
  const [page, setPage] = useState(1);
  const { data } = useReviews(slug, page);
  if (!data) return null;
  return (
    <section className="section border-t border-taupe" aria-labelledby="reviews-h">
      <div className="page-container max-w-3xl">
        <h2 id="reviews-h" className="text-4xl">
          Reviews
        </h2>
        {data.items.length === 0 ? (
          <p className="mt-4 text-[15px] text-stone">
            No reviews yet. Reviews appear here once customers who have received this piece share their thoughts.
          </p>
        ) : (
          <>
            {data.summary?.average != null && (
              <p className="mt-4 flex items-center gap-3 text-[14px]">
                <Stars value={data.summary.average} /> {data.summary.average.toFixed(1)} from {data.summary.count}{' '}
                review{data.summary.count === 1 ? '' : 's'}
              </p>
            )}
            <ul className="mt-8 divide-y divide-taupe">
              {data.items.map((r) => (
                <li key={r.id} className="py-6">
                  <Stars value={r.rating} />
                  {r.title && <h3 className="mt-3 font-display text-2xl">{r.title}</h3>}
                  <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-stone">{r.body}</p>
                  <p className="mt-3 text-[12px] uppercase tracking-[0.14em] text-stone">
                    {r.displayName} · Verified purchase · {formatDate(r.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
            {data.pagination.totalPages > 1 && (
              <div className="mt-8 flex gap-6 text-[12px] uppercase tracking-[0.16em]">
                <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="disabled:opacity-30">
                  Previous
                </button>
                <button
                  disabled={page >= data.pagination.totalPages}
                  onClick={() => setPage(page + 1)}
                  className="disabled:opacity-30"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function Related({ product }: { product: ProductDetail }) {
  const { data } = useProducts({ category: product.category?.slug, limit: 5 });
  const items = data?.items.filter((p) => p.id !== product.id).slice(0, 4) ?? [];
  if (items.length === 0) return null;
  return (
    <section className="section border-t border-taupe" aria-labelledby="related-h">
      <div className="page-container">
        <h2 id="related-h" className="mb-10 text-4xl">
          You may also like
        </h2>
        <div className="grid grid-cols-2 gap-x-4 gap-y-10 lg:grid-cols-4 lg:gap-x-6">
          {items.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </div>
    </section>
  );
}

/** Mobile: swipeable snap gallery. Desktop: one large image that follows the pointer when zoomed. */
function MainImage({
  images,
  index,
  onIndex,
  kind,
}: {
  images: ProductDetail['images'];
  index: number;
  onIndex: (i: number) => void;
  kind: PlaceholderKind;
}) {
  const strip = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const el = strip.current;
    if (el && el.clientWidth && Math.round(el.scrollLeft / el.clientWidth) !== index)
      el.scrollTo({ left: index * el.clientWidth });
  }, [index]);
  if (images.length === 0)
    return (
      <div className="order-1 aspect-[4/5] overflow-hidden bg-ivory sm:order-2">
        <Img kind={kind} image={undefined} className="h-full w-full" />
      </div>
    );
  return (
    <div className="order-1 sm:order-2">
      <div className="relative sm:hidden">
        <div
          ref={strip}
          className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          onScroll={(e) => {
            const el = e.currentTarget;
            const i = Math.round(el.scrollLeft / el.clientWidth);
            if (i !== index) onIndex(i);
          }}
        >
          {images.map((img, i) => (
            <div key={img.url} className="aspect-[4/5] w-full shrink-0 snap-center bg-ivory">
              <Img image={img} eager={i === 0} width={900} sizes="100vw" className="h-full w-full" />
            </div>
          ))}
        </div>
        {images.length > 1 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1.5" aria-hidden>
            {images.map((img, i) => (
              <span
                key={img.url}
                className={`h-1.5 w-1.5 rounded-full transition-colors ${i === index ? 'bg-charcoal' : 'bg-charcoal/25'}`}
              />
            ))}
          </div>
        )}
      </div>
      <div
        className="relative hidden aspect-[4/5] cursor-zoom-in overflow-hidden bg-ivory sm:block"
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
        }}
        onMouseLeave={() => setZoom(null)}
      >
        <div
          className="h-full w-full transition-transform duration-300 ease-luxe"
          style={zoom ? { transform: 'scale(1.7)', transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined}
        >
          <Img
            image={images[index] ?? images[0]}
            eager
            width={1400}
            sizes="(min-width: 1024px) 55vw, 100vw"
            className="h-full w-full"
          />
        </div>
      </div>
    </div>
  );
}

function Detail({ product }: { product: ProductDetail }) {
  const names = useMemo(() => optionNames(product), [product]);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [qty, setQty] = useState(1);
  const [imageIndex, setImageIndex] = useState(0);
  // The sticky mobile bar is only needed while the real Add to bag button is out of view; showing both is redundant.
  const ctaRef = useRef<HTMLDivElement>(null);
  const [ctaInView, setCtaInView] = useState(false);
  const addLine = useCart((s) => s.addLine);
  const blocked = useCart((s) => s.blocked);
  const openCart = useUi((s) => s.openCart);

  useEffect(() => {
    const el = ctaRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    // The bottom margin keeps a button that is hiding behind the sticky bar from counting as visible.
    const io = new IntersectionObserver(([entry]) => setCtaInView(!!entry?.isIntersecting), {
      rootMargin: '0px 0px -72px 0px',
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // A single-variant product needs no choosing; otherwise the shopper must pick every option.
  useEffect(() => {
    if (product.variants.length === 1)
      setSelected(Object.fromEntries(product.variants[0]!.options.map((o) => [o.name, o.value])));
  }, [product]);

  const variant: Variant | undefined = useMemo(
    () => product.variants.find((v) => names.every((n) => v.options.find((o) => o.name === n)?.value === selected[n])),
    [product, names, selected],
  );
  const optionAvailable = (name: string, value: string) =>
    product.variants.some(
      (v) =>
        v.inStock &&
        v.options.some((o) => o.name === name && o.value === value) &&
        Object.entries(selected).every(([k, val]) => k === name || v.options.find((o) => o.name === k)?.value === val),
    );

  const shownPrice = variant?.price ?? product.price;
  const shownCompare = variant ? variant.compareAtPrice : product.compareAtPrice;
  const needsChoice = names.length > 0 && !variant;
  const canBuy = !!variant && variant.inStock;

  function add() {
    if (!variant) return toast.message('Please choose your options first.');
    if (blocked) return;
    addLine(variant.id, qty);
    toast.success(`${product.name} added to your bag`);
    openCart();
  }

  return (
    <>
      <div className="page-container py-8 sm:py-14">
        <nav aria-label="Breadcrumb" className="mb-6 text-[12px] uppercase tracking-[0.14em] text-stone">
          <Link to="/shop" className="hover:text-charcoal">
            Shop
          </Link>
          {product.category && (
            <>
              {' '}
              /{' '}
              <Link to={`/collections/${product.category.slug}`} className="hover:text-charcoal">
                {product.category.name}
              </Link>
            </>
          )}
        </nav>
        <div className="grid gap-8 lg:grid-cols-[1.25fr_1fr] lg:gap-16">
          <div className={`grid gap-3 ${product.images.length > 1 ? 'sm:grid-cols-[84px_1fr]' : ''}`}>
            {/* One photograph needs no thumbnail strip: it would only repeat the large image. */}
            {product.images.length > 1 && (
              <div
                className="order-2 flex gap-2 overflow-x-auto sm:order-1 sm:flex-col"
                role="tablist"
                aria-label="Product images"
              >
                {product.images.map((img, i) => (
                  <button
                    key={img.url}
                    role="tab"
                    aria-selected={i === imageIndex}
                    aria-label={`Show image ${i + 1}`}
                    onClick={() => setImageIndex(i)}
                    className={`h-24 w-20 shrink-0 overflow-hidden bg-ivory sm:h-28 sm:w-full ${i === imageIndex ? 'ring-1 ring-charcoal' : 'opacity-70 hover:opacity-100'}`}
                  >
                    <Img image={img} width={200} sizes="84px" className="h-full w-full" />
                  </button>
                ))}
              </div>
            )}
            <MainImage
              images={product.images}
              index={imageIndex}
              onIndex={setImageIndex}
              kind={kindFor(`${product.category?.slug ?? ''} ${product.name}`)}
            />
          </div>

          <div className="lg:sticky lg:top-28 lg:self-start">
            <p className="eyebrow">{product.category?.name}</p>
            <h1 className="mt-3 text-4xl leading-tight sm:text-6xl">{product.name}</h1>
            <div className="mt-4 flex items-center gap-4">
              <Price
                price={shownPrice}
                compareAt={shownCompare}
                from={!variant && product.hasPriceRange}
                className="!text-[20px]"
              />
              {product.rating && (
                <span className="flex items-center gap-2 text-[13px] text-stone">
                  <Stars value={product.rating.average} /> ({product.rating.count})
                </span>
              )}
            </div>
            {product.shortDescription && (
              <p className="mt-6 text-[15px] leading-[1.8] text-stone">{product.shortDescription}</p>
            )}

            {names.map((name) => (
              <fieldset key={name} className="mt-8">
                <legend className="field-label capitalize">
                  {name}:{' '}
                  <span className="normal-case tracking-normal text-charcoal">{selected[name] ?? 'Select'}</span>
                </legend>
                <div className="flex flex-wrap gap-2">
                  {valuesFor(product, name).map((value) => {
                    const active = selected[name] === value;
                    const ok = optionAvailable(name, value);
                    return (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setSelected((s) => ({ ...s, [name]: value }))}
                        className={`min-h-[44px] min-w-[52px] border px-4 text-[13px] transition-colors ${active ? 'border-charcoal bg-charcoal text-paper' : 'border-taupe hover:border-charcoal'} ${!ok && !active ? 'text-stone line-through decoration-stone/60' : ''}`}
                      >
                        {value}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ))}

            <div ref={ctaRef} className="mt-8 flex items-center gap-4">
              <div className="flex items-center border border-taupe" role="group" aria-label="Quantity">
                <button
                  aria-label="Decrease quantity"
                  className="px-4 py-3 hover:text-bronze"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                >
                  −
                </button>
                <span className="w-8 text-center text-[14px]" aria-live="polite">
                  {qty}
                </span>
                <button
                  aria-label="Increase quantity"
                  className="px-4 py-3 hover:text-bronze"
                  onClick={() => setQty((q) => Math.min(10, q + 1))}
                >
                  +
                </button>
              </div>
              <button
                onClick={add}
                disabled={
                  blocked || product.variants.length === 0 || (!!variant && !variant.inStock) || !product.inStock
                }
                className="btn-primary flex-1"
              >
                {blocked
                  ? 'Admin accounts cannot shop'
                  : !product.inStock || (variant && !variant.inStock)
                    ? 'Sold out'
                    : needsChoice
                      ? 'Select options'
                      : 'Add to bag'}
              </button>
            </div>
            {variant?.lowStock && variant.inStock && <p className="mt-3 text-[13px] text-bronze">Only a few left.</p>}
            {canBuy && (
              <p className="mt-4 flex items-center gap-2 text-[13px] text-stone">
                <Check size={14} /> Cash on delivery, JazzCash and Easypaisa available
              </p>
            )}

            {product.description && (
              <div className="mt-10 border-t border-taupe pt-8">
                <h2 className="font-display text-2xl">Details</h2>
                <p className="mt-3 whitespace-pre-line text-[15px] leading-[1.8] text-stone">{product.description}</p>
              </div>
            )}
            {product.attributes.length > 0 && (
              <dl className="mt-8 grid grid-cols-[auto_1fr] gap-x-8 gap-y-2 border-t border-taupe pt-8 text-[14px]">
                {product.attributes.map((a) => (
                  <div key={a.label} className="contents">
                    <dt className="text-stone">{a.label}</dt>
                    <dd>{a.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </div>
      </div>

      {/* Mobile sticky bar keeps the purchase action in reach while reading the page. */}
      <div
        aria-hidden={ctaInView}
        className={`fixed inset-x-0 bottom-0 z-30 flex items-center gap-4 border-t border-taupe bg-paper/95 px-5 py-3 backdrop-blur transition-transform duration-300 ease-luxe lg:hidden ${ctaInView ? 'pointer-events-none translate-y-full' : ''}`}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-lg leading-tight">{product.name}</p>
          <Price price={shownPrice} compareAt={shownCompare} from={!variant && product.hasPriceRange} />
        </div>
        <button
          onClick={add}
          tabIndex={ctaInView ? -1 : 0}
          disabled={!product.inStock || (!!variant && !variant.inStock)}
          className="btn-primary !px-6"
        >
          {!product.inStock ? 'Sold out' : needsChoice ? 'Select' : 'Add'}
        </button>
      </div>
    </>
  );
}

export default function ProductPage() {
  const { slug = '' } = useParams();
  const { data: product, isLoading, isError, error, refetch } = useProduct(slug);
  useSeo({
    title: product?.seo.title ?? product?.name,
    description: product?.seo.description ?? product?.shortDescription ?? undefined,
    image: product?.images[0]?.url,
    jsonLd: product
      ? [
          productJsonLd(product),
          breadcrumbJsonLd([
            { name: 'Shop', path: '/shop' },
            { name: product.name, path: `/products/${product.slug}` },
          ]),
        ]
      : undefined,
  });
  if (isLoading)
    return (
      <div className="page-container grid gap-10 py-14 lg:grid-cols-2">
        <Skeleton className="aspect-[4/5]" />
        <div className="space-y-4">
          <Skeleton className="h-12" />
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-40" />
        </div>
      </div>
    );
  if (isError || !product) {
    const notFound = (error as { status?: number } | null)?.status === 404;
    return notFound ? (
      <div className="page-container">
        <div className="mx-auto max-w-md py-24 text-center">
          <h1 className="text-4xl">This piece is no longer available</h1>
          <Link to="/shop" className="btn-secondary mt-8">
            Back to the collection
          </Link>
        </div>
      </div>
    ) : (
      <ErrorState onRetry={() => refetch()} />
    );
  }
  return (
    <>
      <Detail product={product} />
      <Reviews slug={product.slug} />
      <Related product={product} />
      <div className="h-16 lg:hidden" />
    </>
  );
}
