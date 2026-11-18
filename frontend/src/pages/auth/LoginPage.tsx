import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { AuthShell, landingAfterLogin } from '@/pages/auth/AuthShell';
import { useSession } from '@/hooks/queries';
import { FormField } from '@/components/ui/FormField';
import { setCsrfToken } from '@/lib/api';
import { login } from '@/services/api';

const schema = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
});
type Values = z.infer<typeof schema>;

export default function LoginPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });
  const { data: current } = useSession();

  const onSubmit = handleSubmit(async (values) => {
    try {
      const session = await login(values);
      setCsrfToken(session.csrfToken);
      qc.setQueryData(['session'], session);
      nav(landingAfterLogin(session.user.role, params.get('next')), { replace: true });
    } catch (e) {
      setError('root', { message: (e as Error).message });
    }
  });

  // Already signed in: go to the right home instead of showing the form again.
  if (current) return <Navigate to={landingAfterLogin(current.user.role, params.get('next'))} replace />;

  return (
    <AuthShell title="Sign in" subtitle="Welcome back.">
      <form onSubmit={onSubmit} noValidate className="space-y-6">
        <FormField
          label="Email"
          type="email"
          autoComplete="email"
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
        <button disabled={isSubmitting} className="btn-primary w-full">
          {isSubmitting ? 'Signing in' : 'Sign in'}
        </button>
        <div className="flex justify-between text-[13px]">
          <Link to="/forgot-password" className="link-underline">
            Forgot password?
          </Link>
          <Link
            to={`/register${params.get('next') ? `?next=${encodeURIComponent(params.get('next') ?? '')}` : ''}`}
            className="link-underline"
          >
            Create an account
          </Link>
        </div>
      </form>
    </AuthShell>
  );
}
