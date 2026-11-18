import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Reveal } from '@/components/ui/Reveal';
import { useSeo } from '@/lib/seo';

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  useSeo({ title, noindex: true });
  return (
    <div className="page-container py-14 sm:py-24">
      <Reveal className="mx-auto max-w-md">
        <p className="text-center">
          <Link to="/" className="font-display text-xl tracking-[0.34em] text-bronze">
            MAPLE
          </Link>
        </p>
        <h1 className="mt-6 text-center text-5xl">{title}</h1>
        {subtitle && <p className="mt-4 text-center text-[15px] text-stone">{subtitle}</p>}
        <div className="mt-10 border border-taupe bg-paper p-6 sm:p-9">{children}</div>
      </Reveal>
    </div>
  );
}

/** Only same-site paths are honoured after sign-in, so a crafted ?next= can never redirect off-site. */
export const safeNext = (value: string | null): string =>
  value && /^\/(?!\/)[^\s]*$/.test(value) ? value : '/account';

const inAdmin = (p: string) => p === '/admin' || p.startsWith('/admin/');

/**
 * Where to go after signing in. Staff always end up in the admin area and customers always in the storefront, so a
 * stale ?next= can never drop an administrator into a shopper page or a customer into the admin area.
 */
export function landingAfterLogin(role: string, next: string | null): string {
  const target = next && /^\/(?!\/)[^\s]*$/.test(next) ? next : null;
  if (role !== 'customer') return target && inAdmin(target) && target !== '/admin/login' ? target : '/admin';
  return target && !inAdmin(target) ? target : '/account';
}
