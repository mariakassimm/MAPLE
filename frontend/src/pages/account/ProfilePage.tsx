import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { FormField } from '@/components/ui/FormField';
import { useSession } from '@/hooks/queries';
import { api } from '@/lib/api';
import { normalizePhone, PK_MOBILE } from '@/lib/format';
import { changePassword, updateProfile } from '@/services/shop';

const profileSchema = z.object({
  name: z.string().trim().min(2, 'Please enter your name.').max(80),
  phone: z
    .string()
    .trim()
    .refine((v) => v === '' || PK_MOBILE.test(normalizePhone(v)), 'Enter a Pakistani mobile number.'),
});
const pwSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password.'),
  newPassword: z
    .string()
    .min(10, 'At least 10 characters.')
    .max(72, 'At most 72 characters.')
    .regex(/[A-Za-z]/, 'Include a letter.')
    .regex(/\d/, 'Include a number.'),
});

export default function ProfilePage() {
  const { data: session } = useSession();
  const qc = useQueryClient();
  const user = session!.user;
  const p = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: user.name, phone: user.phone ?? '' },
  });
  const w = useForm<z.infer<typeof pwSchema>>({ resolver: zodResolver(pwSchema) });

  return (
    <div className="grid max-w-4xl gap-16 md:grid-cols-2">
      <section>
        <h2 className="font-display text-3xl">Details</h2>
        <p className="mt-2 text-[14px] text-stone">
          {user.email}{' '}
          {user.emailVerified ? (
            '· verified'
          ) : (
            <>
              · not verified.{' '}
              <button
                className="underline underline-offset-4"
                onClick={async () => {
                  try {
                    await api.post('/auth/resend-verification');
                    toast.success('Verification email sent.');
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
              >
                Resend email
              </button>
            </>
          )}
        </p>
        <form
          noValidate
          className="mt-6 space-y-5"
          onSubmit={p.handleSubmit(async (v) => {
            try {
              const u = await updateProfile({ name: v.name, phone: v.phone ? normalizePhone(v.phone) : null });
              qc.setQueryData(['session'], (s: { user: typeof u; csrfToken: string } | null) =>
                s ? { ...s, user: u } : s,
              );
              toast.success('Details updated.');
            } catch (e) {
              p.setError('root', { message: (e as Error).message });
            }
          })}
        >
          <FormField label="Full name" error={p.formState.errors.name?.message} {...p.register('name')} />
          <FormField
            label="Mobile number"
            type="tel"
            error={p.formState.errors.phone?.message}
            {...p.register('phone')}
          />
          {p.formState.errors.root && (
            <p role="alert" className="field-error">
              {p.formState.errors.root.message}
            </p>
          )}
          <button disabled={p.formState.isSubmitting} className="btn-primary">
            Save changes
          </button>
        </form>
      </section>
      <section>
        <h2 className="font-display text-3xl">Password</h2>
        <form
          noValidate
          className="mt-6 space-y-5"
          onSubmit={w.handleSubmit(async (v) => {
            try {
              await changePassword(v);
              w.reset();
              toast.success('Password changed.');
            } catch (e) {
              w.setError('root', { message: (e as Error).message });
            }
          })}
        >
          <FormField
            label="Current password"
            type="password"
            autoComplete="current-password"
            error={w.formState.errors.currentPassword?.message}
            {...w.register('currentPassword')}
          />
          <FormField
            label="New password"
            type="password"
            autoComplete="new-password"
            hint="At least 10 characters, with a letter and a number."
            error={w.formState.errors.newPassword?.message}
            {...w.register('newPassword')}
          />
          {w.formState.errors.root && (
            <p role="alert" className="field-error">
              {w.formState.errors.root.message}
            </p>
          )}
          <button disabled={w.formState.isSubmitting} className="btn-secondary">
            Change password
          </button>
        </form>
      </section>
    </div>
  );
}
