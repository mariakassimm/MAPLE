import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, ChevronDown, Menu, Search } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { adminDashboard } from '@/admin/api';
import { GROUPS, adminHomeFor, permissionForPath } from '@/admin/nav';
import { can, isStaff } from '@/admin/permissions';
import { Drawer } from '@/components/ui/Drawer';
import { Spinner } from '@/components/ui/States';
import { useSession, useSite } from '@/hooks/queries';
import { setCsrfToken } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useSeo } from '@/lib/seo';
import { logout } from '@/services/api';

function NavList({ role, onNavigate }: { role: string; onNavigate?: () => void }) {
  return (
    <nav aria-label="Admin" className="space-y-6">
      {GROUPS.map((g) => ({ ...g, items: g.items.filter((n) => can(role, n.need)) }))
        .filter((g) => g.items.length > 0)
        .map((g) => (
          <div key={g.title}>
            <p className="mb-2 px-3 text-[10px] uppercase tracking-[0.22em] text-stone">{g.title}</p>
            <div className="space-y-0.5">
              {g.items.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.to === '/admin'}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      'group flex items-center gap-3 border-l-2 px-3 py-2.5 text-[14px] transition-all duration-300',
                      isActive
                        ? 'border-bronze bg-ivory font-medium text-charcoal'
                        : 'border-transparent text-charcoal/80 hover:bg-ivory/70 hover:text-charcoal',
                    )
                  }
                >
                  <n.icon size={16} strokeWidth={1.5} className="text-bronze" />
                  {n.label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
    </nav>
  );
}

/** Pop-over that closes on outside click and Escape. */
function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return { open, setOpen, ref };
}

const Pop = ({
  open,
  children,
  align = 'right',
}: {
  open: boolean;
  children: React.ReactNode;
  align?: 'right' | 'left';
}) => {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={reduce ? false : { opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? undefined : { opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
          className={cn(
            'absolute top-full z-50 mt-2 w-72 border border-taupe bg-paper shadow-[0_24px_50px_-30px_rgba(40,39,34,0.45)]',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

/** Jump straight to an order by number, or search orders by name/phone/number. */
function AdminSearch() {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  return (
    <form
      role="search"
      className="relative hidden w-full max-w-sm md:block"
      onSubmit={(e) => {
        e.preventDefault();
        const t = q.trim();
        if (t) {
          nav(`/admin/orders?q=${encodeURIComponent(t)}`);
          setQ('');
        }
      }}
    >
      <label htmlFor="admin-search" className="sr-only">
        Search orders
      </label>
      <Search
        size={15}
        strokeWidth={1.5}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone"
      />
      <input
        id="admin-search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search orders by number, name or phone"
        className="field !py-2 !pl-9 text-[13px]"
        maxLength={100}
      />
    </form>
  );
}

/** Counts come from the real dashboard figures; roles without reports access simply get no bell. */
function Notifications() {
  const { open, setOpen, ref } = usePopover();
  const { data } = useQuery({
    queryKey: ['admin-attention'],
    queryFn: () => adminDashboard(),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
  const items = data
    ? [
        {
          n: data.orders.pending,
          label: 'orders waiting for confirmation',
          to: '/admin/orders?status=pending_confirmation',
        },
        {
          n: data.attention.shipmentsNeedingReview,
          label: 'shipments need a check',
          to: '/admin/shipments?needsReview=true',
        },
        { n: data.attention.openReturns, label: 'open return requests', to: '/admin/returns' },
        { n: data.attention.pendingReviews, label: 'reviews awaiting moderation', to: '/admin/reviews' },
        { n: data.lowStock.count, label: 'variants low on stock', to: '/admin/inventory?lowStock=true' },
      ].filter((a) => a.n > 0)
    : [];
  const total = items.reduce((n, i) => n + i.n, 0);
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={`Notifications${total ? `, ${total} need attention` : ''}`}
        className="relative p-2 hover:text-bronze"
      >
        <Bell size={19} strokeWidth={1.4} />
        {total > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-[17px] min-w-[17px] items-center justify-center bg-bronze px-1 text-[10px] text-paper">
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>
      <Pop open={open}>
        <p className="border-b border-taupe px-4 py-3 font-display text-xl">Needs attention</p>
        {items.length === 0 ? (
          <p className="px-4 py-6 text-[13px] text-stone">Nothing needs your attention right now.</p>
        ) : (
          <ul>
            {items.map((i) => (
              <li key={i.label}>
                <Link
                  to={i.to}
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-between px-4 py-3 text-[13px] hover:bg-ivory"
                >
                  <span>
                    <strong className="font-medium">{i.n}</strong> {i.label}
                  </span>
                  <span aria-hidden>→</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Pop>
    </div>
  );
}

function ProfileMenu({ name, role, onSignOut }: { name: string; role: string; onSignOut: () => void }) {
  const { open, setOpen, ref } = usePopover();
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label="Account menu"
        className="flex items-center gap-2 p-1 hover:text-bronze"
      >
        <span className="flex h-8 w-8 items-center justify-center bg-charcoal text-[11px] tracking-wider text-paper">
          {initials}
        </span>
        <ChevronDown
          size={14}
          strokeWidth={1.6}
          className={cn('hidden transition-transform sm:block', open && 'rotate-180')}
        />
      </button>
      <Pop open={open}>
        <div className="border-b border-taupe px-4 py-3">
          <p className="text-[14px] font-medium">{name}</p>
          <p className="text-[12px] capitalize text-stone">{role.replace(/_/g, ' ')}</p>
        </div>
        <a href="/" target="_blank" rel="noopener noreferrer" className="block px-4 py-3 text-[13px] hover:bg-ivory">
          View store (new tab)
        </a>
        <Link to="/admin/profile" onClick={() => setOpen(false)} className="block px-4 py-3 text-[13px] hover:bg-ivory">
          My profile &amp; password
        </Link>
        <button
          onClick={onSignOut}
          className="block w-full border-t border-taupe px-4 py-3 text-left text-[13px] hover:bg-ivory"
        >
          Sign out
        </button>
      </Pop>
    </div>
  );
}

export default function AdminLayout() {
  useSeo({ title: 'Admin', noindex: true });
  const { data: session, isLoading } = useSession();
  const qc = useQueryClient();
  const loc = useLocation();
  const { data: site } = useSite();
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  if (isLoading)
    return (
      <div className="py-40">
        <Spinner />
      </div>
    );
  if (!session) return <Navigate to={`/admin/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  // A customer who lands here is sent to their own area; nothing of the admin interface is rendered for them.
  if (!isStaff(session.user.role)) return <Navigate to="/account" replace />;
  const role = session.user.role;
  const needed = permissionForPath(loc.pathname);
  async function signOut() {
    try {
      await logout();
    } catch {
      /* ignore */
    }
    setCsrfToken(null);
    qc.clear();
    window.location.assign('/admin/login');
  }

  return (
    <div className="min-h-screen bg-[#fbfaf7] lg:grid lg:grid-cols-[256px_1fr]">
      <aside className="hidden border-r border-taupe bg-paper lg:block">
        <div className="sticky top-0 flex max-h-screen flex-col">
          <div className="border-b border-taupe px-6 py-6">
            <p className="font-display text-2xl tracking-[0.3em]">MAPLE</p>
            <p className="mt-1 text-[10px] uppercase tracking-[0.24em] text-stone">Admin</p>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-6">
            <NavList role={role} />
          </div>
        </div>
      </aside>
      <div className="min-w-0">
        {site?.demoMode && (
          <p role="status" className="bg-charcoal px-4 py-2 text-center text-[12px] tracking-wide text-paper">
            Demo mode is on: payments and couriers are simulated. Do not use this for real customers.
          </p>
        )}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-taupe bg-paper/95 px-4 py-3 backdrop-blur sm:px-8">
          <button className="-ml-2 p-2 lg:hidden" aria-label="Open menu" onClick={() => setOpen(true)}>
            <Menu size={22} strokeWidth={1.4} />
          </button>
          <p className="font-display text-xl tracking-[0.28em] lg:hidden">MAPLE</p>
          <div className="flex flex-1 justify-center md:justify-start lg:justify-center">
            {can(role, 'orders:read') && <AdminSearch />}
          </div>
          <div className="flex items-center gap-1 sm:gap-3">
            {can(role, 'reports:read') && <Notifications />}
            <ProfileMenu name={session.user.name} role={role} onSignOut={signOut} />
          </div>
        </header>
        <motion.main
          key={loc.pathname}
          className="p-4 sm:p-8"
          {...(reduce
            ? {}
            : {
                initial: { opacity: 0, y: 8 },
                animate: { opacity: 1, y: 0 },
                transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
              })}
        >
          {needed && !can(role, needed) ? (
            <div className="mx-auto max-w-md py-24 text-center">
              <h1 className="font-display text-4xl">No access</h1>
              <p className="mt-3 text-stone">Your role does not include this section.</p>
              <Link to={adminHomeFor(role)} className="btn-secondary mt-8">
                Back to your dashboard
              </Link>
            </div>
          ) : (
            <Outlet />
          )}
        </motion.main>
      </div>
      <Drawer open={open} onClose={() => setOpen(false)} title="MAPLE Admin" side="left">
        <div className="flex-1 overflow-y-auto px-3 py-6">
          <NavList role={role} onNavigate={() => setOpen(false)} />
        </div>
      </Drawer>
    </div>
  );
}
