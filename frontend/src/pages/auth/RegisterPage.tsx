import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { AuthShell, landingAfterLogin } from '@/pages/auth/AuthShell';
import { FormField } from '@/components/ui/FormField';
import { setCsrfToken } from '@/lib/api';
import { register as registerUser } from '@/services/api';

// Mirrors the server rules; the server remains the authority.
const schema = z.object({
  name: z.string().trim().min(2, 'Please enter your name.').max(80),
  email: z.string().trim().email('Enter a valid email address.'),
  phone: z
    .string()
    .trim()
    .regex(/^(?:\+92|92|0)?3[0-4]\d{8}$/, 'Enter a Pakistani mobile number, e.g. 0300 1234567.')
    .or(z.literal('')),
  password: z
    .string()
    .min(10, 'At least 10 characters.')
    .max(72, 'At most 72 characters.')
    .regex(/[A-Za-z]/, 'Include a letter.')
    .regex(/\d/, 'Include a number.'),
});
type Values = z.infer<typeof schema>;

export default function RegisterPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async ({ phone, ...rest }) => {
    try {
      const session = await registerUser({ ...rest, ...(phone ? { phone: phone.replace(/\s/g, '') } : {}) });
      setCsrfToken(session.csrfToken);
      qc.setQueryData(['session'], session);
      nav(landingAfterLogin('customer', params.get('next')), { replace: true });
    } catch (e) {
      setError('root', { message: (e as Error).message });
    }
  });

  return (
    <AuthShell title="Create account" subtitle="Track orders and check out faster.">
      <form onSubmit={onSubmit} noValidate className="space-y-6">
        <FormField label="Full name" autoComplete="name" error={errors.name?.message} {...register('name')} />
        <FormField
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <FormField
          label="Mobile (optional)"
          type="tel"
          autoComplete="tel"
          error={errors.phone?.message}
          {...register('phone')}
        />
        <FormField
          label="Password"
          type="password"
          autoComplete="new-password"
          hint="At least 10 characters, with a letter and a number."
          error={errors.password?.message}
          {...register('password')}
        />
        {errors.root && (
          <p role="alert" className="field-error">
            {errors.root.message}
          </p>
        )}
        <button disabled={isSubmitting} className="btn-primary w-full">
          {isSubmitting ? 'Creating account' : 'Create account'}
        </button>
        <p className="text-center text-[13px]">
          Already have an account?{' '}
          <Link to="/login" className="link-underline">
            Sign in
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
