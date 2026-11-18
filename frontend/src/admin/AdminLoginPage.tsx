import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { isStaff } from '@/admin/permissions';
import { FormField } from '@/components/ui/FormField';
import { useSession } from '@/hooks/queries';
import { setCsrfToken } from '@/lib/api';
import { useSeo } from '@/lib/seo';
import { landingAfterLogin } from '@/pages/auth/AuthShell';
import { login } from '@/services/api';

const schema = z.object({
  email: z.string().trim().email('Enter your work email address.'),
  password: z.string().min(1, 'Enter your password.'),
});
type Values = z.infer<typeof schema>;

/** Staff sign-in: its own page, no storefront chrome, no registration. The server only opens staff accounts here. */
export default function AdminLoginPage() {
  useSeo({ title: 'Staff sign-in', noindex: true });
  const nav = useNavigate();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const { data: current } = useSession();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });
  const expired = params.get('expired') === '1';

  if (current && isStaff(current.user.role))
    return <Navigate to={landingAfterLogin(current.user.role, params.get('next'))} replace />;

  const onSubmit = handleSubmit(async (values) => {
    try {
      const session = await login({ ...values, portal: 'admin' });
      setCsrfToken(session.csrfToken);
      qc.clear();
      qc.setQueryData(['session'], session);
      nav(landingAfterLogin(session.user.role, params.get('next')), { replace: true });
    } catch (e) {
      setError('root', { message: (e as Error).message });
    }
  });

  return (
    <div className="grid min-h-screen bg-[#171715] text-ivory lg:grid-cols-[1.1fr_1fr]">
      <aside
        className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-[#2A1E17] via-[#211D19] to-[#171715] p-14 lg:flex"
        aria-hidden
      >
        <div className="pointer-events-none absolute -left-24 top-1/3 h-96 w-96 rounded-full bg-[#B69A70]/10 blur-[120px]" />
        <p className="font-display text-3xl tracking-[0.34em]">MAPLE</p>
        <div className="relative max-w-md">
          <p className="text-[11px] uppercase tracking-[0.28em] text-[#B69A70]">Staff area</p>
          <h2 className="mt-4 font-display text-6xl leading-[1.05]">Run the house, quietly.</h2>
          <p className="mt-6 text-[15px] leading-relaxed text-sand">
            Orders, catalogue, customers and deliveries, in one place. Access is limited to MAPLE staff and every action
            is recorded.
          </p>
        </div>
        <p className="text-[12px] text-stone">© {new Date().getFullYear()} MAPLE</p>
      </aside>

      <main className="flex items-center justify-center px-5 py-14 sm:px-10">
        <div className="w-full max-w-sm">
          <p className="font-display text-2xl tracking-[0.34em] lg:hidden">MAPLE</p>
          <p className="mt-8 flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-[#B69A70] lg:mt-0">
            <ShieldCheck size={14} strokeWidth={1.5} /> Staff sign-in
          </p>
          <h1 className="mt-3 font-display text-5xl">Admin</h1>
          <p className="mt-3 text-[14px] text-sand">Sign in with your staff account to open the dashboard.</p>
          {expired && (
            <p
              role="status"
              className="mt-6 border border-[#B69A70]/40 bg-[#B69A70]/10 px-4 py-3 text-[13px] text-[#D9BE8E]"
            >
              Your session has ended. Please sign in again.
            </p>
          )}
          <form onSubmit={onSubmit} noValidate className="on-dark mt-8 space-y-6">
            <FormField
              label="Email"
              type="email"
              autoComplete="username"
              error={errors.email?.message}
              {...register('email')}
            />
            <FormField
              label="Password"
              type="password"
              autoComplete="current-password"
              error={errors.password?.message}
              {...register('password')}
            />
            {errors.root && (
              <p role="alert" className="field-error">
                {errors.root.message}
              </p>
            )}
            <button disabled={isSubmitting} className="btn w-full bg-ivory text-charcoal hover:bg-sand">
              {isSubmitting ? 'Signing in' : 'Sign in'}
            </button>
          </form>
          <div className="mt-8 flex justify-between text-[13px] text-sand">
            <Link to="/forgot-password" className="underline-offset-4 hover:text-ivory hover:underline">
              Forgot password?
            </Link>
            <Link to="/" className="underline-offset-4 hover:text-ivory hover:underline">
              Back to the store
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
