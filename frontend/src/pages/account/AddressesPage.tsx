import { useConfirm } from '@/components/ui/ConfirmDialog';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { FormField } from '@/components/ui/FormField';
import { EmptyState, Skeleton } from '@/components/ui/States';
import { normalizePhone, PK_MOBILE } from '@/lib/format';
import { createAddress, deleteAddress, fetchAddresses, updateAddress } from '@/services/shop';
import { PROVINCES, type Address } from '@/types/api';

const schema = z.object({
  label: z.string().trim().min(1, 'Give it a name, e.g. Home.').max(30),
  recipientName: z.string().trim().min(2, 'Enter the recipient name.').max(80),
  phone: z
    .string()
    .trim()
    .refine((v) => PK_MOBILE.test(normalizePhone(v)), 'Enter a Pakistani mobile number.'),
  province: z.enum(PROVINCES, { errorMap: () => ({ message: 'Select a province.' }) }),
  city: z.string().trim().min(2, 'Enter the city.').max(60),
  area: z.string().trim().min(2, 'Enter the area.').max(100),
  line1: z.string().trim().min(5, 'Enter the full address.').max(200),
  postalCode: z
    .string()
    .trim()
    .regex(/^\d{5}$/, 'Postal code must be 5 digits.')
    .or(z.literal('')),
  isDefault: z.boolean(),
});
type Values = z.infer<typeof schema>;

function AddressForm({ address, onDone }: { address?: Address; onDone: () => void }) {
  const qc = useQueryClient();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: address
      ? {
          label: address.label,
          recipientName: address.recipientName,
          phone: address.phone,
          province: address.province,
          city: address.city,
          area: address.area,
          line1: address.line1,
          postalCode: address.postalCode ?? '',
          isDefault: address.isDefault,
        }
      : { label: 'Home', isDefault: false, postalCode: '' },
  });
  return (
    <form
      noValidate
      className="space-y-5 border border-taupe p-6"
      onSubmit={handleSubmit(async (v) => {
        const body = { ...v, phone: normalizePhone(v.phone), postalCode: v.postalCode || undefined };
        try {
          await (address ? updateAddress(address.id, body) : createAddress(body));
          await qc.invalidateQueries({ queryKey: ['addresses'] });
          toast.success('Address saved.');
          onDone();
        } catch (e) {
          setError('root', { message: (e as Error).message });
        }
      })}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Label" error={errors.label?.message} {...register('label')} />
        <FormField label="Recipient" error={errors.recipientName?.message} {...register('recipientName')} />
      </div>
      <FormField label="Mobile number" type="tel" error={errors.phone?.message} {...register('phone')} />
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="a-prov" className="field-label">
            Province
          </label>
          <select id="a-prov" className="field" defaultValue={address?.province ?? ''} {...register('province')}>
            <option value="" disabled>
              Select
            </option>
            {PROVINCES.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
          {errors.province && (
            <p role="alert" className="field-error">
              {errors.province.message}
            </p>
          )}
        </div>
        <FormField label="City" error={errors.city?.message} {...register('city')} />
      </div>
      <FormField label="Area" error={errors.area?.message} {...register('area')} />
      <FormField label="Full address" error={errors.line1?.message} {...register('line1')} />
      <FormField
        label="Postal code (optional)"
        inputMode="numeric"
        maxLength={5}
        error={errors.postalCode?.message}
        {...register('postalCode')}
      />
      <label className="flex items-center gap-3 text-[14px]">
        <input type="checkbox" className="h-4 w-4 accent-charcoal" {...register('isDefault')} /> Use as my default
        address
      </label>
      {errors.root && (
        <p role="alert" className="field-error">
          {errors.root.message}
        </p>
      )}
      <div className="flex gap-3">
        <button className="btn-primary" disabled={isSubmitting}>
          Save address
        </button>
        <button type="button" className="btn-ghost" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function AddressesPage() {
  const confirm = useConfirm();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['addresses'], queryFn: fetchAddresses });
  const [editing, setEditing] = useState<Address | 'new' | null>(null);
  const del = useMutation({
    mutationFn: deleteAddress,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['addresses'] });
      toast.success('Address removed.');
    },
    onError: (e) => toast.error((e as Error).message),
  });
  if (isLoading || !data) return <Skeleton className="h-48" />;
  return (
    <div className="max-w-3xl space-y-6">
      {editing && <AddressForm address={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />}
      {data.length === 0 && !editing && (
        <EmptyState title="No saved addresses" body="Save an address to check out faster." />
      )}
      <ul className="grid gap-4 sm:grid-cols-2">
        {data.map((a) => (
          <li key={a.id} className="border border-taupe p-6 text-[14px]">
            <p className="font-display text-2xl">
              {a.label}
              {a.isDefault && (
                <span className="ml-3 align-middle text-[10px] uppercase tracking-eyebrow text-bronze">Default</span>
              )}
            </p>
            <address className="mt-3 not-italic leading-relaxed text-stone">
              {a.recipientName}
              <br />
              {a.line1}, {a.area}
              <br />
              {a.city}, {a.province}
              <br />
              {a.phone}
            </address>
            <div className="mt-4 flex gap-5 text-[12px] uppercase tracking-[0.16em]">
              <button onClick={() => setEditing(a)} className="hover:text-bronze">
                Edit
              </button>
              <button
                onClick={async () => {
                  if (await confirm({ title: 'Remove this address?', confirmLabel: 'Remove', destructive: true }))
                    del.mutate(a.id);
                }}
                className="text-stone hover:text-[#8a2f26]"
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>
      {!editing && (
        <button className="btn-secondary" onClick={() => setEditing('new')}>
          Add an address
        </button>
      )}
    </div>
  );
}
