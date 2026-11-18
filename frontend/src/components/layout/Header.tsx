import { ArrowRight, ChevronDown, LayoutDashboard, Menu, Search, ShoppingBag, User } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Drawer } from '@/components/ui/Drawer';
import { useCategories, useIsStaff, useSession, useSite } from '@/hooks/queries';
import { cn } from '@/lib/cn';
import { useCart } from '@/store/cart';
import { useUi } from '@/store/ui';

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('font-display text-[28px] font-medium tracking-[0.34em] sm:text-[32px]', className)}>
      MAPLE
    </span>
  );
}

function AnnouncementBar() {
  const { data: site } = useSite();
  if (!site?.announcement) return null;
  const text = site.announcement;
  // Two identical groups; the track slides left by exactly one group, so the loop is seamless. Pauses on hover.
  const group = (copy: number) => (
    <div key={copy} aria-hidden={copy === 1} className="flex shrink-0 items-center">
      {Array.from({ length: 8 }, (_, i) => (
        <span key={i} className="flex items-center whitespace-nowrap">
          <span className="px-8">{text}</span>
          <span aria-hidden className="h-1 w-1 rotate-45 bg-[#B69A70]" />
        </span>
      ))}
    </div>
  );
  return (
    <div
      className="ticker group/t overflow-hidden bg-charcoal py-2.5 text-[11px] uppercase tracking-[0.2em] text-ivory"
      role="region"
      aria-label="Announcement"
    >
      <p className="sr-only">{text}</p>
      <div className="ticker-track flex w-max">{[0, 1].map(group)}</div>
    </div>
  );
}

function SearchBar({ onDone }: { onDone: () => void }) {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  return (
    <form
      role="search"
      className="px-6 py-6"
      onSubmit={(e) => {
        e.preventDefault();
        const t = q.trim();
        if (t) {
          nav(`/shop?q=${encodeURIComponent(t)}`);
          setQ('');
          onDone();
        }
      }}
    >
      <label htmlFor="site-search" className="field-label">
        Search
      </label>
      <input
        id="site-search"
        className="field"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search the collection"
        maxLength={100}
      />
      <button className="btn-primary mt-4 w-full">Search</button>
    </form>
  );
}

function CollectionsMenu({
  items,
  linkClass,
}: {
  items: { id: string; name: string; slug: string; image?: { url: string; alt: string } | null }[];
  linkClass: string;
}) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef(0);
  const { pathname } = useLocation();
  const active = pathname.startsWith('/collections/');
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);
  if (items.length === 0) return null;

  // Hover opens the menu for a mouse only. On touch, a tap must toggle it (otherwise the emulated hover opens it and the click closes it again).
  const hover = (on: boolean) => (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    window.clearTimeout(closeTimer.current);
    if (on) setOpen(true);
    else closeTimer.current = window.setTimeout(() => setOpen(false), 160);
  };
  const links = () => [...(ref.current?.querySelectorAll<HTMLAnchorElement>('[data-menu-link]') ?? [])];
  const move = (e: React.KeyboardEvent, dir: 1 | -1) => {
    const all = links();
    if (!all.length) return;
    e.preventDefault();
    const i = all.indexOf(document.activeElement as HTMLAnchorElement);
    all[(i + dir + all.length) % all.length]!.focus();
  };
  const withImages = items.every((c) => c.image?.url);

  return (
    <div
      ref={ref}
      className="relative"
      onPointerEnter={hover(true)}
      onPointerLeave={hover(false)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls="collections-menu"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            requestAnimationFrame(() => links()[0]?.focus());
          }
        }}
        className={cn(linkClass, 'inline-flex items-center gap-1.5', active && 'text-bronze')}
      >
        Collections{' '}
        <ChevronDown
          size={13}
          strokeWidth={1.6}
          className={cn('transition-transform duration-300', open && 'rotate-180')}
        />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            id="collections-menu"
            className="absolute left-1/2 top-full z-50 w-[min(560px,92vw)] -translate-x-1/2 pt-5"
            initial={reduce ? false : { opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? undefined : { opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') move(e, 1);
              else if (e.key === 'ArrowUp') move(e, -1);
              else if (e.key === 'Home') {
                e.preventDefault();
                links()[0]?.focus();
              } else if (e.key === 'End') {
                e.preventDefault();
                links().at(-1)?.focus();
              }
            }}
          >
            <div className="relative overflow-hidden rounded-2xl border border-white/15 bg-[#1d1a16]/80 p-3 text-ivory shadow-[0_30px_70px_-20px_rgba(20,16,12,0.55)] backdrop-blur-2xl backdrop-saturate-150">
              <span
                aria-hidden
                className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[#B69A70]/20 blur-3xl"
              />
              <p className="relative px-4 pb-2 pt-3 text-[10px] uppercase tracking-[0.28em] text-[#B69A70]">
                Shop by collection
              </p>
              <ul className="relative grid grid-cols-2 gap-x-1">
                {items.map((c) => {
                  const current = pathname === `/collections/${c.slug}`;
                  return (
                    <li key={c.id}>
                      <Link
                        data-menu-link
                        to={`/collections/${c.slug}`}
                        aria-current={current ? 'page' : undefined}
                        className={cn(
                          'group/i flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] transition-colors duration-300 hover:bg-white/10 hover:text-white focus-visible:bg-white/10 focus-visible:outline-none',
                          current ? 'bg-white/[0.07] text-white' : 'text-ivory/90',
                        )}
                      >
                        {withImages ? (
                          <img src={c.image!.url} alt="" loading="lazy" className="h-11 w-9 shrink-0 object-cover" />
                        ) : (
                          <span
                            aria-hidden
                            className={cn(
                              'h-px bg-[#B69A70]/70 transition-all duration-300 group-hover/i:w-5 group-hover/i:bg-[#D9BE8E]',
                              current ? 'w-5 bg-[#D9BE8E]' : 'w-3',
                            )}
                          />
                        )}
                        <span>{c.name}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
              <div className="relative mt-2 border-t border-white/10 pt-2">
                <Link
                  data-menu-link
                  to="/shop"
                  className="group/v flex items-center justify-between rounded-lg px-3 py-3 text-[11px] uppercase tracking-[0.2em] text-[#D9BE8E] transition-colors duration-300 hover:bg-white/10 hover:text-white focus-visible:bg-white/10 focus-visible:outline-none"
                >
                  View all pieces{' '}
                  <ArrowRight size={14} className="transition-transform duration-300 group-hover/v:translate-x-1" />
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Header() {
  const { openCart, openMenu, closeMenu, menuOpen, openSearch, closeSearch, searchOpen } = useUi();
  const units = useCart((s) => s.lines.reduce((n, l) => n + l.quantity, 0));
  const { data: session } = useSession();
  const staff = useIsStaff();
  const { data: categories } = useCategories();
  const [scrolled, setScrolled] = useState(false);
  const [collectionsOpen, setCollectionsOpen] = useState(false);

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);

  const link = ({ isActive }: { isActive: boolean }) =>
    cn('link-underline text-[12px] uppercase tracking-[0.18em]', isActive && 'text-bronze');

  return (
    <>
      <AnnouncementBar />
      <header
        className={cn(
          'sticky top-0 z-40 bg-paper/[0.97] transition-shadow duration-500',
          scrolled && 'shadow-[0_1px_0_#D8D0C5]',
        )}
      >
        <div className="page-container flex h-[68px] items-center justify-between sm:h-[84px]">
          <div className="flex flex-1 items-center">
            <button className="-ml-2 p-2 lg:hidden" aria-label="Open menu" onClick={openMenu}>
              <Menu size={22} strokeWidth={1.4} />
            </button>
            <nav aria-label="Primary" className="hidden items-center gap-9 lg:flex">
              <NavLink to="/shop" end className={link}>
                Shop
              </NavLink>
              <CollectionsMenu
                items={categories ?? []}
                linkClass="link-underline text-[12px] uppercase tracking-[0.18em]"
              />
              <NavLink to="/new-arrivals" className={link}>
                New Arrivals
              </NavLink>
              <NavLink to="/about" className={link}>
                About
              </NavLink>
            </nav>
          </div>
          <Link to="/" aria-label="MAPLE home" className="shrink-0">
            <Wordmark />
          </Link>
          <div className="flex flex-1 items-center justify-end gap-1 sm:gap-3">
            <button className="p-2 hover:text-bronze" aria-label="Search" onClick={openSearch}>
              <Search size={20} strokeWidth={1.4} />
            </button>
            {staff ? (
              <Link
                to="/admin"
                className="inline-flex items-center gap-2 px-2 py-2 text-[11px] uppercase tracking-[0.18em] hover:text-bronze"
                aria-label="Open admin dashboard"
              >
                <LayoutDashboard size={18} strokeWidth={1.4} />
                <span className="hidden sm:inline">Admin</span>
              </Link>
            ) : (
              <Link
                to={session ? '/account' : '/login'}
                className="hidden p-2 hover:text-bronze sm:block"
                aria-label={session ? 'Your account' : 'Sign in'}
              >
                <User size={20} strokeWidth={1.4} />
              </Link>
            )}
            {!staff && (
              <button
                className="relative p-2 hover:text-bronze"
                aria-label={`Open bag, ${units} item${units === 1 ? '' : 's'}`}
                onClick={openCart}
              >
                <ShoppingBag size={20} strokeWidth={1.4} />
                <AnimatePresence>
                  {units > 0 && (
                    <motion.span
                      key={units}
                      initial={{ scale: 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.6, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center bg-bronze px-1 text-[10px] text-paper"
                    >
                      {units}
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>
            )}
          </div>
        </div>
      </header>

      <Drawer open={menuOpen} onClose={closeMenu} title="Menu" side="left">
        <nav aria-label="Mobile" className="flex-1 overflow-y-auto px-6 py-4">
          <ul>
            <li>
              <Link
                to="/shop"
                onClick={closeMenu}
                className="block border-b border-taupe/70 py-4 font-display text-[28px]"
              >
                Shop
              </Link>
            </li>
            <li className="border-b border-taupe/70">
              <button
                type="button"
                aria-expanded={collectionsOpen}
                aria-controls="m-collections"
                onClick={() => setCollectionsOpen((o) => !o)}
                className="flex w-full items-center justify-between py-4 text-left font-display text-[28px]"
              >
                Collections{' '}
                <ChevronDown
                  size={20}
                  strokeWidth={1.4}
                  className={cn('transition-transform duration-300', collectionsOpen && 'rotate-180')}
                />
              </button>
              <div id="m-collections" hidden={!collectionsOpen}>
                <ul className="pb-4 pl-1">
                  {(categories ?? []).map((c) => (
                    <li key={c.id}>
                      <Link
                        to={`/collections/${c.slug}`}
                        onClick={closeMenu}
                        className="block py-2.5 text-[15px] text-stone hover:text-charcoal"
                      >
                        {c.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </li>
            <li>
              <Link
                to="/new-arrivals"
                onClick={closeMenu}
                className="block border-b border-taupe/70 py-4 font-display text-[28px]"
              >
                New Arrivals
              </Link>
            </li>
            <li>
              <Link
                to="/about"
                onClick={closeMenu}
                className="block border-b border-taupe/70 py-4 font-display text-[28px]"
              >
                About
              </Link>
            </li>
          </ul>
          <ul className="mt-6 space-y-1 text-[13px] uppercase tracking-[0.16em] text-stone">
            {[
              { to: '/contact', label: 'Contact' },
              { to: '/order-tracking', label: 'Track an order' },
              {
                to: staff ? '/admin' : session ? '/account' : '/login',
                label: staff ? 'Admin dashboard' : session ? 'Your account' : 'Sign in',
              },
            ].map((l) => (
              <li key={l.to}>
                <Link to={l.to} onClick={closeMenu} className="block py-3 hover:text-charcoal">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </Drawer>
      <Drawer open={searchOpen} onClose={closeSearch} title="Search" side="right">
        <SearchBar onDone={closeSearch} />
      </Drawer>
    </>
  );
}
