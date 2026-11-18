import { useQueryClient } from '@tanstack/react-query';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useSession } from '@/hooks/queries';
import { setCsrfToken } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useSeo } from '@/lib/seo';
import { logout } from '@/services/api';

const tabs = [
  { to: '/account', label: 'Profile', end: true },
  { to: '/account/orders', label: 'Orders' },
  { to: '/account/addresses', label: 'Addresses' },
  { to: '/account/returns', label: 'Returns' },
];

export default function AccountLayout() {
  useSeo({ title: 'Your account', noindex: true });
  const { data: session } = useSession();
  const qc = useQueryClient();
  const nav = useNavigate();
  async function signOut() {
    try {
      await logout();
    } catch {
      /* the cookie may already be gone; clear local state regardless */
    }
    setCsrfToken(null);
    qc.clear();
    nav('/', { replace: true });
    toast.success('You have been signed out.');
  }
  return (
    <div className="page-container py-12 sm:py-20">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Your account</p>
          <h1 className="mt-2 text-4xl sm:text-5xl">Hello, {session?.user.name.split(' ')[0]}</h1>
        </div>
        <div className="flex items-center gap-6">
          {session && session.user.role !== 'customer' && (
            <Link to="/admin" className="btn-ghost !min-h-0 !px-0">
              Open admin
            </Link>
          )}
          <button onClick={signOut} className="btn-ghost !min-h-0 !px-0">
            Sign out
          </button>
        </div>
      </div>
      <nav aria-label="Account" className="mt-10 flex gap-8 overflow-x-auto border-b border-taupe">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              cn(
                '-mb-px whitespace-nowrap border-b py-3 text-[12px] uppercase tracking-[0.18em]',
                isActive ? 'border-charcoal text-charcoal' : 'border-transparent text-stone hover:text-charcoal',
              )
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-10">
        <Outlet />
      </div>
    </div>
  );
}
