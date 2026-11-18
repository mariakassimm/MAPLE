import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { FormField } from '@/components/ui/FormField';
import { normalizePhone, PK_MOBILE } from '@/lib/format';

const schema = z.object({
  orderNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^MPL-[A-Z0-9]{8}$/, 'Order numbers look like MPL-AB12CD34.'),
  phone: z
    .string()
    .trim()
    .refine((v) => PK_MOBILE.test(normalizePhone(v)), 'Enter the mobile number used for the order.'),
});
type Values = z.infer<typeof schema>;

export function OrderLookupForm({
  onSubmit,
  label,
  initialOrder,
}: {
  onSubmit: (orderNumber: string, phone: string) => Promise<void>;
  label: string;
  initialOrder?: string;
}) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { orderNumber: initialOrder ?? '' } });
  return (
    <form
      noValidate
      className="space-y-6"
      onSubmit={handleSubmit(async (v) => {
        try {
          await onSubmit(v.orderNumber, normalizePhone(v.phone));
        } catch (e) {
          setError('root', { message: (e as Error).message });
        }
      })}
    >
      <FormField
        label="Order number"
        autoCapitalize="characters"
        error={errors.orderNumber?.message}
        {...register('orderNumber')}
      />
      <FormField
        label="Mobile number"
        type="tel"
        autoComplete="tel"
        error={errors.phone?.message}
        {...register('phone')}
      />
      {errors.root && (
        <p role="alert" className="field-error">
          {errors.root.message}
        </p>
      )}
      <button disabled={isSubmitting} className="btn-primary w-full">
        {isSubmitting ? 'Looking up' : label}
      </button>
    </form>
  );
}
