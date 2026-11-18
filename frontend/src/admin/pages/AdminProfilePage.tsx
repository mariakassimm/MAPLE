import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Card, PageHeader } from '@/admin/components/ui';
import { FormField } from '@/components/ui/FormField';
import { useSession } from '@/hooks/queries';
import { changePassword, updateProfile } from '@/services/shop';

const nameSchema = z.object({ name: z.string().trim().min(2, 'Please enter your name.').max(80) });
const pwSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password.'),
  newPassword: z
    .string()
    .min(10, 'At least 10 characters.')
    .max(72, 'At most 72 characters.')
    .regex(/[A-Za-z]/, 'Include a letter.')
    .regex(/\d/, 'Include a number.'),
});

/** A staff member's own name and password. Role and status can only be changed by a super admin on the Staff page. */
export default function AdminProfilePage() {
  const { data: session } = useSession();
  const qc = useQueryClient();
  const user = session!.user;
  const n = useForm<z.infer<typeof nameSchema>>({
    resolver: zodResolver(nameSchema),
    defaultValues: { name: user.name },
  });
  const w = useForm<z.infer<typeof pwSchema>>({ resolver: zodResolver(pwSchema) });
  return (
    <>
      <PageHeader title="My profile" sub={`${user.email} · ${user.role.replace(/_/g, ' ')}`} />
      <div className="grid max-w-4xl gap-6 md:grid-cols-2">
        <Card title="Name">
          <form
            noValidate
            className="space-y-5"
            onSubmit={n.handleSubmit(async (v) => {
              try {
                const u = await updateProfile({ name: v.name });
                qc.setQueryData(['session'], (s: { user: typeof u; csrfToken: string } | null) =>
                  s ? { ...s, user: u } : s,
                );
                toast.success('Saved.');
              } catch (e) {
                n.setError('root', { message: (e as Error).message });
              }
            })}
          >
            <FormField label="Full name" error={n.formState.errors.name?.message} {...n.register('name')} />
            {n.formState.errors.root && (
              <p role="alert" className="field-error">
                {n.formState.errors.root.message}
              </p>
            )}
            <button disabled={n.formState.isSubmitting} className="btn-primary">
              Save
            </button>
          </form>
        </Card>
        <Card title="Password">
          <form
            noValidate
            className="space-y-5"
            onSubmit={w.handleSubmit(async (v) => {
              try {
                await changePassword(v);
                w.reset();
                toast.success('Password changed. Your other devices were signed out.');
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
        </Card>
      </div>
    </>
  );
}
