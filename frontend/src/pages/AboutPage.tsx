import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { GoldDust } from '@/components/ui/GoldDust';
import { Reveal } from '@/components/ui/Reveal';
import { EASE } from '@/lib/motion';
import { useSeo } from '@/lib/seo';

// MIDNIGHT LUXURY editorial About page.
// Imagery lives in /public/brand: replace a file with the same name (or change the paths below) to use new photography.
// Copy: the supplied brand statement and the three chapter themes only. No history, craftsmanship, sustainability or
// manufacturing claims are made.
const IMG = {
  hero: {
    src: '/brand/about-hero.jpg',
    alt: 'A collection of leather handbags, gloves, a scarf and a hat arranged on a pale wooden table',
  },
  coat: { src: '/brand/about-coat.jpg', alt: 'A woman in a taupe coat and cream knitwear against a warm neutral wall' },
  design: {
    src: '/brand/about-design.jpg',
    alt: 'A beige handbag, heels, sunglasses, a watch and jewellery arranged together',
  },
  everyday: { src: '/brand/about-everyday.jpg', alt: 'A woman in cream tailoring seated beside a taupe handbag' },
  details: {
    src: '/brand/about-jewellery.jpg',
    alt: 'Fine gold necklaces, a cuff and a ring resting on soft cream fabric',
  },
};

const SLIDES = [
  {
    src: '/brand/about-boutique.jpg',
    alt: 'A handbag and silk scarf on a marble plinth in a bright boutique',
    label: 'The boutique',
  },
  {
    src: '/brand/cat-handbags.jpg',
    alt: 'A black leather tote on a wooden table beside a notebook and a cup of coffee',
    label: 'Handbags',
  },
  {
    src: '/brand/about-details.jpg',
    alt: 'Close view of the stitching and hardware on a beige leather handbag',
    label: 'Jewellery',
  },
  {
    src: '/brand/cat-wallets.jpg',
    alt: 'A tan leather wallet and a black zip wallet on a dark surface',
    label: 'Small leather goods',
  },
  {
    src: '/brand/cat-watches.jpg',
    alt: 'A woman in an ivory top wearing a gold watch on a dark strap',
    label: 'Watches',
  },
  {
    src: '/brand/about-eyewear.jpg',
    alt: 'Sunglasses, a watch and gold hoops arranged beside a blush leather case',
    label: 'Eyewear and accessories',
  },
  {
    src: '/brand/about-bracelet.jpg',
    alt: 'A hand adjusting a delicate pearl bracelet over a cream knit sleeve',
    label: 'The finishing touch',
  },
  { src: IMG.design.src, alt: IMG.design.alt, label: 'Considered design' },
  { src: '/brand/about-jewellery.jpg', alt: IMG.details.alt, label: 'The details' },
  { src: IMG.everyday.src, alt: IMG.everyday.alt, label: 'Everyday elegance' },
];

/** A fine gold line that draws itself as it scrolls into view. */
function Divider({ className = '', width = 'w-24' }: { className?: string; width?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.span
      aria-hidden
      className={`block h-px origin-left bg-gradient-to-r from-[#B69A70] to-[#B69A70]/0 ${width} ${className}`}
      {...(reduce
        ? {}
        : {
            initial: { scaleX: 0 },
            whileInView: { scaleX: 1 },
            viewport: { once: true, margin: '-40px' },
            transition: { duration: 1.4, ease: EASE },
          })}
    />
  );
}

/** Words that rise from a mask one after another; `sweep` adds the champagne highlight travelling word to word. */
function Words({
  text,
  className,
  delay = 0,
  onScroll = true,
  sweep,
}: {
  text: string;
  className?: string;
  delay?: number;
  onScroll?: boolean;
  sweep?: boolean;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <span className={className}>{text}</span>;
  const trigger = onScroll
    ? { initial: 'hidden', whileInView: 'show', viewport: { once: true, margin: '-80px' } }
    : { initial: 'hidden', animate: 'show' };
  return (
    <motion.span className={className} {...trigger} transition={{ staggerChildren: 0.07, delayChildren: delay }}>
      <span className="sr-only">{text}</span>
      {text.split(' ').map((w, i, arr) => (
        <span key={i} aria-hidden className="inline-block overflow-hidden pb-[0.14em] align-bottom">
          <motion.span
            className="inline-block"
            variants={{ hidden: { y: '115%' }, show: { y: 0 } }}
            transition={{ duration: 1, ease: EASE }}
          >
            <span
              className={sweep ? 'text-sweep' : undefined}
              style={sweep ? { animationDelay: `${3 + i * 0.4}s` } : undefined}
            >
              {w}
            </span>
            {i < arr.length - 1 ? '\u00A0' : null}
          </motion.span>
        </span>
      ))}
    </motion.span>
  );
}

/** Image that emerges through a soft mask, drifts slightly slower than the page and brightens a touch on hover. */
function Frame({
  src,
  alt,
  className = '',
  ratio = 'aspect-[4/3]',
  strength = 5,
  pos = 'object-center',
  dim = true,
}: {
  src: string;
  alt: string;
  className?: string;
  ratio?: string;
  strength?: number;
  pos?: string;
  dim?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], [`-${strength}%`, `${strength}%`]);
  return (
    <motion.div
      ref={ref}
      className={`sheen-hover group relative overflow-hidden bg-[#30251F] ${ratio} ${className}`}
      {...(reduce
        ? {}
        : {
            initial: { clipPath: 'inset(12% 12% 12% 12%)', opacity: 0 },
            whileInView: { clipPath: 'inset(0% 0% 0% 0%)', opacity: 1 },
            viewport: { once: true, margin: '-80px' },
            transition: { duration: 1.5, ease: EASE },
          })}
    >
      <motion.img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        style={reduce ? undefined : { y, scale: 1.14 }}
        className={`absolute inset-0 h-full w-full object-cover ${pos} ${dim ? 'brightness-[0.9] contrast-[1.03]' : ''} transition-[filter] duration-[1800ms] ease-luxe group-hover:brightness-100`}
      />
      {dim && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#171715]/45 via-transparent to-[#171715]/10"
        />
      )}
      <span aria-hidden className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-[#B69A70]/20" />
    </motion.div>
  );
}

/**
 * One chapter. Every chapter shares exactly the same grid: image 7 columns, text 4 columns, both vertically centred, the same
 * image ratio, the same numeral / rule / heading / paragraph stack. Only the side alternates, so everything lines up.
 */
function Chapter({
  n,
  title,
  text,
  img,
  flip,
  light,
  id,
}: {
  n: string;
  title: string;
  text: string;
  img: { src: string; alt: string; pos?: string };
  flip?: boolean;
  light?: boolean;
  id: string;
}) {
  return (
    <div className="page-container grid items-center gap-10 py-20 md:grid-cols-12 md:gap-0 md:py-32">
      <div className={`md:row-start-1 md:col-span-7 ${flip ? 'md:col-start-6' : 'md:col-start-1'}`}>
        <Frame src={img.src} alt={img.alt} pos={img.pos} dim={!light} className={light ? '!bg-[#D8D0C5]' : ''} />
      </div>
      <div className={`md:row-start-1 md:col-span-4 ${flip ? 'md:col-start-1' : 'md:col-start-9'}`}>
        <Reveal>
          <span
            aria-hidden
            className="block font-display text-[88px] font-light italic leading-none sm:text-[120px]"
            style={{ WebkitTextStroke: `1px ${light ? '#77634D' : '#B69A70'}`, color: 'transparent' }}
          >
            {n}
          </span>
        </Reveal>
        <Divider className="my-7" width="w-16" />
        <h3
          id={id}
          className="text-[38px] font-light uppercase leading-[1.04] tracking-[0.03em] sm:text-5xl lg:text-[54px]"
        >
          <Words text={title} />
        </h3>
        <Reveal delay={0.1}>
          <p className={`mt-6 max-w-sm text-[17px] leading-[1.9] ${light ? 'text-[#4a463f]' : 'text-[#AAA39A]'}`}>
            {text}
          </p>
        </Reveal>
      </div>
    </div>
  );
}

/** One slow, seamless right-to-left row of small photographs of varied heights. Two identical copies, shifted by exactly half. */
const HEIGHTS = [
  'h-[190px] sm:h-[230px]',
  'h-[250px] sm:h-[300px]',
  'h-[215px] sm:h-[260px]',
  'h-[270px] sm:h-[330px]',
  'h-[200px] sm:h-[245px]',
];

function PhotoMarquee() {
  const row = (copy: number) => (
    <ul key={copy} aria-hidden={copy === 1} className="flex shrink-0 items-center">
      {SLIDES.map((s, k) => (
        <li key={s.src} className="mr-3 shrink-0 sm:mr-4">
          <figure
            className={`group relative w-[132px] overflow-hidden rounded-xl bg-[#211D19] sm:w-[165px] lg:w-[180px] ${HEIGHTS[k % HEIGHTS.length]}`}
          >
            <img
              src={s.src}
              alt={copy === 0 ? s.alt : ''}
              loading="lazy"
              decoding="async"
              draggable={false}
              className="h-full w-full object-cover brightness-[0.82] contrast-[1.05] saturate-[0.9] transition-[transform,filter] duration-[1200ms] ease-luxe group-hover:scale-[1.08] group-hover:brightness-100"
            />
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-inset ring-[#B69A70]/20"
            />
          </figure>
        </li>
      ))}
    </ul>
  );
  return (
    <div
      className="photo-marquee relative -mx-5 overflow-hidden sm:-mx-8 lg:-mx-12"
      role="group"
      aria-label="The MAPLE world"
    >
      <div className="photo-track flex w-max">{[0, 1].map(row)}</div>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-[#171715] to-transparent sm:w-32"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-[#211D19] to-transparent sm:w-32"
      />
    </div>
  );
}

export default function AboutPage() {
  useSeo({
    title: 'About MAPLE',
    description: 'MAPLE is an independent house of considered pieces, made to be lived in. The Art of Everyday Luxury.',
  });
  const reduce = useReducedMotion();
  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const heroY = useTransform(scrollYProgress, [0, 1], ['0%', '14%']);
  const heroFade = useTransform(scrollYProgress, [0, 0.7], [1, 0]);
  const fadeIn = (delay: number, y = 16) =>
    reduce
      ? {}
      : { initial: { opacity: 0, y }, animate: { opacity: 1, y: 0 }, transition: { delay, duration: 1.1, ease: EASE } };

  return (
    <article className="-mb-24 overflow-x-clip bg-[#171715] text-[#EAE4D9]">
      {/* 1. Hero */}
      <header
        ref={heroRef}
        className="relative isolate flex min-h-[calc(100svh-6.5rem)] flex-col justify-end overflow-hidden bg-[#171715]"
      >
        <motion.div className="absolute inset-0 -z-10" style={reduce ? undefined : { y: heroY }}>
          <motion.img
            src={IMG.hero.src}
            alt={IMG.hero.alt}
            className="h-[112%] w-full object-cover object-[50%_60%] brightness-[0.72] contrast-[1.08] sepia-[0.25] saturate-[1.05]"
            {...(reduce
              ? {}
              : {
                  initial: { scale: 1, opacity: 0 },
                  animate: { scale: 1.08, opacity: 1 },
                  transition: { scale: { duration: 30, ease: 'linear' }, opacity: { duration: 1.8, ease: EASE } },
                })}
          />
        </motion.div>
        <div className="absolute inset-0 -z-[5] bg-gradient-to-t from-[#171715] via-[#171715]/35 to-[#171715]/55" />
        <div className="absolute inset-0 -z-[5] bg-gradient-to-r from-[#171715]/90 via-[#171715]/45 to-transparent sm:via-[#171715]/35" />
        <GoldDust className="-z-[4]" count={46} />
        <motion.div className="page-container pb-16 pt-32 sm:pb-24" style={reduce ? undefined : { opacity: heroFade }}>
          <motion.p
            className="metal-wordmark font-display text-2xl uppercase sm:text-3xl"
            {...(reduce
              ? { style: { letterSpacing: '0.5em' } }
              : {
                  initial: { opacity: 0, letterSpacing: '0.15em' },
                  animate: { opacity: 1, letterSpacing: '0.5em' },
                  transition: { duration: 2.6, ease: EASE, delay: 0.3 },
                })}
          >
            <span className="sr-only">MAPLE</span>
            <span aria-hidden>MAPLE</span>
          </motion.p>
          <h1 className="mt-8 max-w-[9em] text-[46px] font-light uppercase leading-[0.98] tracking-[0.03em] sm:text-[76px] lg:text-[96px]">
            <Words text="The Art of Everyday Luxury." onScroll={false} delay={1.1} sweep />
          </h1>
          <motion.p className="mt-8 max-w-md text-[16px] leading-[1.85] text-[#AAA39A] sm:text-[17px]" {...fadeIn(2.2)}>
            An independent house of considered pieces, made to be lived in.
          </motion.p>
          <motion.span
            aria-hidden
            className="mt-10 block h-px w-24 origin-left bg-[#B69A70]"
            {...(reduce
              ? {}
              : {
                  initial: { scaleX: 0 },
                  animate: { scaleX: 1 },
                  transition: { delay: 2.6, duration: 1.4, ease: EASE },
                })}
          />
        </motion.div>
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-6 right-5 hidden flex-col items-center gap-3 text-[10px] uppercase tracking-[0.3em] text-[#B69A70] sm:flex md:right-12"
        >
          <span style={{ writingMode: 'vertical-rl' }}>Scroll</span>
          <span className="scroll-cue block h-12 w-px bg-[#B69A70]/70" />
        </div>
      </header>

      {/* 2. Brand story */}
      <section
        className="relative bg-gradient-to-b from-[#171715] via-[#211D19] to-[#211D19]"
        aria-labelledby="story-h"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -left-40 top-10 h-[480px] w-[480px] rounded-full bg-[#77634D]/15 blur-[120px]"
        />
        <div className="page-container relative grid items-center gap-14 py-24 md:grid-cols-12 md:gap-0 md:py-40">
          <div className="md:col-span-6 md:pr-14">
            <Reveal>
              <p className="eyebrow !text-[#B69A70]">About MAPLE</p>
            </Reveal>
            <h2
              id="story-h"
              className="mt-8 text-balance text-[38px] font-light leading-[1.08] sm:text-6xl lg:text-[68px]"
            >
              <Words text="MAPLE is an independent house of considered pieces, made to be lived in." />
            </h2>
            <Divider className="mt-12" />
            <div className="mt-10 space-y-6">
              <Reveal delay={0.05}>
                <p className="max-w-md text-[17px] leading-[1.9] text-[#AAA39A]">
                  We believe luxury is <span className="font-display text-[1.25em] text-gold">quiet</span>: the right
                  proportions, honest materials and finishing you notice only when you look closely.
                </p>
              </Reveal>
              <Reveal delay={0.15}>
                <p className="max-w-md text-[17px] leading-[1.9] text-[#AAA39A]">
                  Every piece is chosen to move easily from one day to the next.{' '}
                  <span className="font-display text-[1.3em] italic text-gold">Elegance, without effort.</span>
                </p>
              </Reveal>
            </div>
          </div>
          <div className="md:col-span-5 md:col-start-8">
            <Frame src={IMG.coat.src} alt={IMG.coat.alt} ratio="aspect-[4/5]" pos="object-[46%_50%]" strength={6} />
          </div>
        </div>
      </section>

      {/* Statement band */}
      <div aria-hidden className="overflow-hidden border-y border-[#B69A70]/20 bg-[#211D19] py-6 sm:py-8">
        <div
          className="marquee-track flex w-max whitespace-nowrap font-display text-4xl font-light uppercase tracking-[0.14em] sm:text-6xl"
          style={{ WebkitTextStroke: '1px rgba(182,154,112,0.55)', color: 'transparent' }}
        >
          {[0, 1].map((k) => (
            <span key={k} className="px-8">
              The Art of Everyday Luxury &nbsp;·&nbsp; Elegance, without effort &nbsp;·&nbsp; The Art of Everyday Luxury
              &nbsp;·&nbsp; Elegance, without effort &nbsp;·&nbsp;
            </span>
          ))}
        </div>
      </div>

      {/* 3. Chapters: one shared grid, three tones */}
      <section className="bg-[#171715]" aria-labelledby="c1">
        <Chapter
          id="c1"
          n="01"
          title="Considered Design"
          text="Thoughtful proportions, understated style and carefully selected pieces."
          img={IMG.design}
        />
      </section>
      <section className="relative bg-[#30251F]" aria-labelledby="c2">
        <div
          aria-hidden
          className="pointer-events-none absolute right-0 top-1/3 h-[420px] w-[420px] rounded-full bg-[#B69A70]/10 blur-[130px]"
        />
        <div className="relative">
          <Chapter
            id="c2"
            flip
            n="02"
            title="Everyday Elegance"
            text="Pieces that complement everyday moments and personal style."
            img={{ ...IMG.everyday, pos: 'object-[34%_50%]' }}
          />
        </div>
      </section>
      <section className="relative bg-gradient-to-b from-[#4A3424] to-[#2E2118]" aria-labelledby="c3">
        <div
          aria-hidden
          className="pointer-events-none absolute left-0 top-1/4 h-[420px] w-[420px] rounded-full bg-[#B69A70]/10 blur-[130px]"
        />
        <div className="relative">
          <Chapter
            id="c3"
            n="03"
            title="The Details"
            text="An appreciation of textures, materials, finishing and the small details that matter."
            img={IMG.details}
          />
        </div>
      </section>

      {/* 4. The MAPLE world: slideshow */}
      <section className="relative bg-gradient-to-b from-[#171715] to-[#211D19]" aria-labelledby="world-h">
        <GoldDust className="opacity-60" count={22} />
        <div className="page-container relative py-24 md:py-36">
          <div className="mx-auto max-w-3xl text-center">
            <Reveal>
              <p className="eyebrow !text-[#B69A70]">The MAPLE world</p>
            </Reveal>
            <h2
              id="world-h"
              className="mt-6 text-balance text-[38px] font-light leading-[1.06] sm:text-6xl lg:text-[68px]"
            >
              <Words text="Warm neutrals, soft light, considered pieces." />
            </h2>
          </div>
          <div className="mt-14 md:mt-20">
            <Reveal>
              <PhotoMarquee />
            </Reveal>
          </div>
        </div>
      </section>

      {/* 5. Closing */}
      <section className="relative isolate overflow-hidden bg-[#211D19]" aria-labelledby="close-h">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[620px] w-[620px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#B69A70]/[0.13] blur-[140px]"
        />
        <GoldDust className="-z-[5]" count={40} />
        <div className="page-container py-28 text-center md:py-48">
          <Divider className="mx-auto mb-14" width="w-40" />
          <h2
            id="close-h"
            className="mx-auto max-w-6xl text-balance text-[42px] font-light uppercase leading-[1.04] tracking-[0.03em] sm:text-[72px] lg:text-[100px]"
          >
            <Words text="Elegance, without effort." sweep />
          </h2>
          <Reveal delay={0.2}>
            <p className="mx-auto mt-8 max-w-md text-[17px] leading-[1.85] text-[#AAA39A]">
              Discover the pieces that make everyday feel considered.
            </p>
          </Reveal>
          <Reveal delay={0.3} className="mt-12">
            <Link
              to="/shop"
              className="link-underline group inline-flex items-center gap-3 text-[13px] uppercase tracking-[0.24em] text-[#EAE4D9] hover:text-[#B69A70]"
            >
              Explore the Collection{' '}
              <ArrowRight size={15} className="transition-transform duration-500 group-hover:translate-x-1.5" />
            </Link>
          </Reveal>
          <motion.p
            aria-hidden
            className="metal-wordmark mt-24 pl-[0.38em] font-display text-[56px] uppercase sm:text-[120px] md:mt-36"
            {...(reduce
              ? { style: { letterSpacing: '0.38em' } }
              : {
                  initial: { opacity: 0, letterSpacing: '0.1em' },
                  whileInView: { opacity: 1, letterSpacing: '0.38em' },
                  viewport: { once: true },
                  transition: { duration: 2.6, ease: EASE },
                })}
          >
            MAPLE
          </motion.p>
        </div>
      </section>
    </article>
  );
}
