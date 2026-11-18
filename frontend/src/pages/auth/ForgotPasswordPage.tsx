import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { AuthShell } from '@/pages/auth/AuthShell';
import { FormField } from '@/components/ui/FormField';
import { forgotPassword } from '@/services/api';

const schema = z.object({ email: z.string().trim().email('Enter a valid email address.') });

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  const onSubmit = handleSubmit(async ({ email }) => {
    try {
      await forgotPassword(email);
      setSent(true);
    } catch (e) {
      setError('root', { message: (e as Error).message });
    }
  });
  return (
    <AuthShell title="Reset password" subtitle="We'll email you a link to choose a new one.">
      {sent ? (
        <p role="status" className="text-center text-[15px] leading-relaxed text-stone">
          If an account exists for that email, a reset link is on its way. It expires shortly, so please use it soon.
        </p>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-6">
          <FormField
            label="Email"
            type="email"
            autoComplete="email"
            error={errors.email?.message}
            {...register('email')}
          />
          {errors.root && (
            <p role="alert" className="field-error">
              {errors.root.message}
            </p>
          )}
          <button disabled={isSubmitting} className="btn-primary w-full">
            {isSubmitting ? 'Sending' : 'Send reset link'}
          </button>
        </form>
      )}
      <p className="mt-8 text-center text-[13px]">
        <Link to="/login" className="link-underline">
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}
