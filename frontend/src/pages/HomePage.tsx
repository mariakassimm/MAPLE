import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, Banknote, PackageCheck, Smartphone } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { NewsletterForm } from '@/components/home/NewsletterForm';
import { ProductCard, ProductGridSkeleton } from '@/components/product/ProductCard';
import { GoldDust } from '@/components/ui/GoldDust';
import { Img } from '@/components/ui/Img';
import { Placeholder, kindFor } from '@/components/ui/Placeholder';
import { Reveal } from '@/components/ui/Reveal';
import { Sparkles } from '@/components/ui/Sparkles';
import { Stars } from '@/components/ui/Stars';
import { ErrorState } from '@/components/ui/States';
import { useHome } from '@/hooks/queries';
import { EASE } from '@/lib/motion';
import { useSeo } from '@/lib/seo';
import type { ProductCard as Card } from '@/types/api';

/**
 * Hero video that never shows a play button. Phones often refuse autoplay (low-power mode, data saver, or React not setting
 * the `muted` attribute early enough), and browsers then draw their own play icon. So the poster stays visible underneath,
 * the video is invisible until it is really playing, and if the browser refuses, the poster simply stays.
 */
function HeroVideo({ src, poster }: { src: string; poster?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const saveData =
    typeof navigator !== 'undefined' &&
    (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;

  useEffect(() => {
    const v = ref.current;
    if (!v || saveData) return;
    v.muted = true;
    v.defaultMuted = true;
    v.setAttribute('muted', '');
    v.setAttribute('playsinline', '');
    const start = () => void v.play().catch(() => undefined);
    start();
    // Some phones only allow playback after the first touch; try once more then.
    window.addEventListener('touchstart', start, { once: true, passive: true });
    const onVisibility = () => (document.hidden ? v.pause() : start());
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('touchstart', start);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [saveData]);

  return (
    <>
      {poster && <img src={poster} alt="" aria-hidden className="absolute inset-0 -z-10 h-full w-full object-cover" />}
      {!saveData && (
        <video
          ref={ref}
          className={`absolute inset-0 -z-10 h-full w-full object-cover transition-opacity duration-700 ${playing ? 'opacity-100' : 'opacity-0'}`}
          src={src}
          poster={poster}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          disablePictureInPicture
          controls={false}
          onPlaying={() => setPlaying(true)}
          aria-hidden
        />
      )}
    </>
  );
}

function ProductRow({
  eyebrow,
  title,
  items,
  href,
  dark,
}: {
  eyebrow: string;
  title: string;
  items: Card[];
  href: string;
  dark?: boolean;
}) {
  if (items.length === 0) return null; // empty sections are omitted, never padded with fake products
  return (
    <section
      className={
        dark
          ? 'section on-dark relative overflow-hidden bg-gradient-to-b from-[#2A1E17] via-[#33261D] to-[#241A14] text-ivory'
          : 'section'
      }
      aria-labelledby={`h-${eyebrow}`}
    >
      {dark && (
        <div
          aria-hidden
          className="pointer-events-none absolute -right-32 top-0 h-[420px] w-[420px] rounded-full bg-[radial-gradient(closest-side,rgba(182,154,112,0.11),transparent)] scale-[1.6]"
        />
      )}
      <div className="page-container relative">
        <Reveal className="mb-10 flex items-end justify-between gap-6">
          <div>
            <p className={dark ? 'eyebrow !text-[#B69A70]' : 'eyebrow'}>{eyebrow}</p>
            <h2 id={`h-${eyebrow}`} className="mt-3 text-4xl sm:text-5xl">
              {title}
            </h2>
          </div>
          <Link
            to={href}
            className="link-underline hidden items-center gap-2 text-[12px] uppercase tracking-[0.18em] sm:inline-flex"
          >
            View all <ArrowRight size={14} />
          </Link>
        </Reveal>
        <div className="grid grid-cols-2 gap-x-4 gap-y-10 lg:grid-cols-4 lg:gap-x-6">
          {items.slice(0, 4).map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </div>
    </section>
  );
}

export default function HomePage() {
  const { data, isLoading, isError, refetch } = useHome();
  const reduce = useReducedMotion();
  useSeo({ description: 'MAPLE: thoughtfully made pieces, delivered across Pakistan. Elegance, without effort.' });

  if (isError) return <ErrorState onRetry={() => refetch()} />;
  if (isLoading || !data)
    return (
      <div className="page-container section">
        <ProductGridSkeleton />
      </div>
    );
  // Shipped demo artwork (public/brand) stands in until real photography is uploaded in the admin.
  const fallback = (src: string, alt: string) => ({ url: src, alt });
  const hero = {
    ...data.hero,
    image:
      data.hero.image ??
      fallback('/brand/hero.svg', 'A MAPLE leather bag, a gold necklace and a watch in warm studio light'),
  };
  const rise = (delay: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 28 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 1, ease: EASE, delay },
        };

  return (
    <>
      <section
        className="relative isolate flex min-h-[78svh] items-end overflow-hidden bg-ivory sm:min-h-[88svh] sm:items-center"
        aria-label="Introduction"
      >
        {hero.videoUrl && !reduce ? (
          <HeroVideo src={hero.videoUrl} poster={hero.videoPoster?.url ?? hero.image?.url} />
        ) : hero.image ? (
          <picture>
            {hero.imageMobile && <source media="(max-width: 639px)" srcSet={hero.imageMobile.url} />}
            <Img image={hero.image} eager sizes="100vw" width={1600} className="absolute inset-0 -z-10 h-full w-full" />
          </picture>
        ) : (
          <motion.div
            className="absolute inset-0 -z-10"
            {...(reduce
              ? {}
              : {
                  initial: { opacity: 0, scale: 1.04 },
                  animate: { opacity: 1, scale: 1 },
                  transition: { duration: 1.6, ease: EASE },
                })}
          >
            <Placeholder seed={1} kind="plain" mark={false} className="h-full w-full" />
          </motion.div>
        )}
        <Sparkles count={5} className="-z-[4]" />
        {(hero.image || hero.videoUrl) && (
          <>
            <div
              aria-hidden
              className="absolute inset-0 -z-[5] bg-gradient-to-t from-[#171715]/85 via-[#171715]/40 to-[#171715]/25 sm:bg-gradient-to-r sm:from-[#171715]/80 sm:via-[#171715]/45 sm:to-[#171715]/5"
            />
            <div
              aria-hidden
              className="absolute inset-x-0 bottom-0 -z-[5] h-1/3 bg-gradient-to-t from-[#171715]/60 to-transparent sm:block"
            />
          </>
        )}
        <div
          className={`page-container pb-20 pt-28 sm:py-32 ${hero.image || hero.videoUrl ? 'text-paper' : 'text-charcoal'}`}
        >
          <div className="max-w-xl sm:max-w-2xl">
            <motion.p
              {...rise(0.1)}
              className={`eyebrow flex items-center gap-4 ${hero.image || hero.videoUrl ? '!text-[#E3D3B4]' : ''}`}
            >
              <span aria-hidden className="h-px w-10 bg-current opacity-70" />
              {hero.label}
            </motion.p>
            <motion.h1
              {...rise(0.25)}
              className={`mt-6 text-[46px] leading-[1.02] sm:text-[78px] ${hero.image || hero.videoUrl ? '[text-shadow:0_2px_28px_rgba(0,0,0,0.35)]' : ''}`}
            >
              {hero.headline}
            </motion.h1>
            <motion.p
              {...rise(0.4)}
              className={`mt-6 max-w-md text-[16px] leading-[1.75] ${hero.image || hero.videoUrl ? 'text-ivory [text-shadow:0_1px_16px_rgba(0,0,0,0.4)]' : 'opacity-90'}`}
            >
              {hero.subheadline}
            </motion.p>
            <motion.div {...rise(0.55)} className="mt-10">
              <Link
                to={hero.ctaUrl}
                className={
                  hero.image || hero.videoUrl ? 'btn sheen bg-paper text-charcoal hover:bg-ivory' : 'btn-primary'
                }
              >
                {hero.ctaLabel}
              </Link>
            </motion.div>
          </div>
        </div>
      </section>

      <section aria-label="How we deliver" className="border-b border-taupe bg-paper">
        <ul className="page-container grid gap-px py-6 text-[12px] uppercase tracking-[0.16em] text-stone sm:grid-cols-3 sm:py-8">
          {[
            { icon: PackageCheck, text: 'Delivered across Pakistan' },
            { icon: Banknote, text: 'Cash on delivery in eligible cities' },
            { icon: Smartphone, text: 'Pay with JazzCash or Easypaisa' },
          ].map(({ icon: Icon, text }, i) => (
            <li key={text}>
              <Reveal delay={i * 0.08} className="flex items-center gap-3 py-2 sm:justify-center">
                <Icon size={18} strokeWidth={1.3} className="text-bronze" aria-hidden />
                {text}
              </Reveal>
            </li>
          ))}
        </ul>
      </section>

      {data.collections.length > 0 && (
        <section className="section" aria-labelledby="collections-h">
          <div className="page-container">
            <Reveal className="mb-10">
              <p className="eyebrow">Collections</p>
              <h2 id="collections-h" className="mt-3 text-4xl sm:text-5xl">
                Shop by collection
              </h2>
            </Reveal>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {data.collections.map((c, i) => (
                <Reveal key={c.url} delay={i * 0.06}>
                  <Link to={c.url} className="group relative block aspect-[3/4] overflow-hidden bg-ivory">
                    <Img
                      seed={i}
                      kind={kindFor(c.title)}
                      image={c.image}
                      className="absolute inset-0 h-full w-full transition-transform duration-[1200ms] ease-luxe group-hover:scale-[1.04]"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-charcoal/60 to-transparent p-6 pt-20 text-paper">
                      <h3 className="font-display text-3xl">{c.title}</h3>
                      <span className="mt-2 inline-flex items-center gap-2 text-[11px] uppercase tracking-eyebrow">
                        Explore <ArrowRight size={13} />
                      </span>
                    </div>
                  </Link>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      <ProductRow eyebrow="New Arrivals" title="Just arrived" items={data.newArrivals} href="/new-arrivals" />

      <section
        className="relative isolate overflow-hidden bg-gradient-to-b from-ivory via-[#EFE9DF] to-ivory"
        aria-labelledby="story-h"
      >
        <GoldDust tone="warm" count={44} className="-z-[1]" />
        <div className="page-container grid items-center gap-10 py-16 sm:py-24 md:grid-cols-[1.1fr_1fr] md:gap-20">
          <Reveal>
            <div className="relative">
              <span
                aria-hidden
                className="absolute -bottom-4 -right-4 hidden h-full w-full border border-[#B69A70]/60 md:block"
              />
              <div className="sheen-hover relative overflow-hidden">
                <Img
                  seed={2}
                  kind="plain"
                  image={
                    data.brandStory.image ??
                    fallback(
                      '/brand/about-jewellery.jpg',
                      'Fine gold necklaces, a cuff and a ring resting on soft cream fabric',
                    )
                  }
                  className="aspect-[4/3] w-full object-[60%_50%]"
                  sizes="(min-width: 768px) 50vw, 100vw"
                />
              </div>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="eyebrow flex items-center gap-4">
              <span aria-hidden className="h-px w-10 bg-bronze" />
              Our Story
            </p>
            <h2 id="story-h" className="mt-4 text-balance text-4xl leading-[1.05] sm:text-5xl">
              {data.brandStory.headline}
            </h2>
            <p className="mt-6 max-w-md text-[16px] leading-[1.8] text-stone">{data.brandStory.body}</p>
            <Link
              to="/about"
              className="link-underline group mt-8 inline-flex items-center gap-3 text-[12px] uppercase tracking-[0.18em]"
            >
              Read our story{' '}
              <ArrowRight size={14} className="transition-transform duration-500 group-hover:translate-x-1.5" />
            </Link>
          </Reveal>
        </div>
      </section>

      <ProductRow eyebrow="Bestsellers" title="Most loved" items={data.bestsellers} href="/shop" />

      <section className="section" aria-labelledby="editorial-h">
        <div className="page-container grid items-center gap-10 md:grid-cols-[1.1fr_1fr] md:gap-20">
          <Reveal className="md:order-2">
            <Img
              seed={0}
              kind="plain"
              image={
                data.editorial.image ??
                fallback(
                  '/brand/quiet-edit.jpg',
                  'Sunglasses, a silk scrunchie, pearls and a woven bag on a linen-covered table',
                )
              }
              className="aspect-[4/3] w-full"
              sizes="(min-width: 768px) 50vw, 100vw"
            />
          </Reveal>
          <Reveal delay={0.1}>
            <p className="eyebrow">Editorial</p>
            <h2 id="editorial-h" className="mt-4 text-4xl sm:text-5xl">
              {data.editorial.headline}
            </h2>
            <p className="mt-6 max-w-md text-[16px] leading-[1.8] text-stone">{data.editorial.body}</p>
            <Link to={data.editorial.linkUrl} className="link-underline mt-8 text-[12px] uppercase tracking-[0.18em]">
              {data.editorial.linkLabel}
            </Link>
          </Reveal>
        </div>
      </section>

      {data.testimonials.length > 0 && (
        <section className="bg-ivory py-16 sm:py-24" aria-labelledby="voices-h">
          <div className="page-container">
            <Reveal className="mb-12 text-center">
              <p className="eyebrow">Words from our customers</p>
              <h2 id="voices-h" className="mt-3 text-4xl sm:text-5xl">
                In their words
              </h2>
            </Reveal>
            <div className="grid gap-6 md:grid-cols-3">
              {data.testimonials.slice(0, 3).map((t, i) => (
                <Reveal key={`${t.displayName}-${i}`} delay={i * 0.08}>
                  <figure className="h-full bg-paper p-8">
                    <Stars value={t.rating} />
                    <blockquote className="mt-5 font-display text-[22px] leading-snug">“{t.body}”</blockquote>
                    <figcaption className="mt-6 text-[12px] uppercase tracking-[0.14em] text-stone">
                      {t.displayName}
                      {t.product ? (
                        <>
                          {' '}
                          ·{' '}
                          <Link to={`/products/${t.product.slug}`} className="underline underline-offset-4">
                            {t.product.name}
                          </Link>
                        </>
                      ) : null}
                    </figcaption>
                  </figure>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="-mb-24 bg-charcoal py-20 text-center text-ivory sm:py-28" aria-labelledby="nl-h">
        <div className="page-container">
          <Reveal>
            <p className="eyebrow !text-sand">Newsletter</p>
            <h2 id="nl-h" className="mx-auto mt-4 max-w-xl text-4xl sm:text-5xl">
              {data.newsletter.headline}
            </h2>
            <p className="mx-auto mt-4 max-w-md text-[15px] text-sand">{data.newsletter.subheadline}</p>
            <div className="mt-9">
              <NewsletterForm tone="dark" />
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
