import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { AuthShell } from '@/pages/auth/AuthShell';
import { FormField } from '@/components/ui/FormField';
import { resetPassword } from '@/services/api';

const schema = z
  .object({
    password: z
      .string()
      .min(10, 'At least 10 characters.')
      .max(72, 'At most 72 characters.')
      .regex(/[A-Za-z]/, 'Include a letter.')
      .regex(/\d/, 'Include a number.'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match.' });

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [done, setDone] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  const onSubmit = handleSubmit(async ({ password }) => {
    try {
      await resetPassword({ token, password });
      setDone(true);
    } catch (e) {
      setError('root', { message: (e as Error).message });
    }
  });

  if (!token)
    return (
      <AuthShell title="Link not valid">
        <p className="text-center text-[15px] text-stone">
          This reset link is incomplete.{' '}
          <Link to="/forgot-password" className="link-underline">
            Request a new one
          </Link>
          .
        </p>
      </AuthShell>
    );
  return (
    <AuthShell title="Choose a new password">
      {done ? (
        <p role="status" className="text-center text-[15px] text-stone">
          Your password has been updated.{' '}
          <Link to="/login" className="link-underline">
            Sign in
          </Link>
        </p>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-6">
          <FormField
            label="New password"
            type="password"
            autoComplete="new-password"
            hint="At least 10 characters, with a letter and a number."
            error={errors.password?.message}
            {...register('password')}
          />
          <FormField
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            error={errors.confirm?.message}
            {...register('confirm')}
          />
          {errors.root && (
            <p role="alert" className="field-error">
              {errors.root.message}
            </p>
          )}
          <button disabled={isSubmitting} className="btn-primary w-full">
            {isSubmitting ? 'Saving' : 'Update password'}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
