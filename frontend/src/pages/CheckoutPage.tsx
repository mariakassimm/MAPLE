import { isStaff } from '@/admin/permissions';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { CartSummary } from '@/components/cart/CartLines';
import { AutoPostForm } from '@/components/ui/AutoPostForm';
import { FormField } from '@/components/ui/FormField';
import { Img } from '@/components/ui/Img';
import { EmptyState, Skeleton } from '@/components/ui/States';
import { useSession } from '@/hooks/queries';
import { ApiError } from '@/lib/api';
import { formatPKR, methodLabel, normalizePhone, optionLabel, PK_MOBILE } from '@/lib/format';
import { useSeo } from '@/lib/seo';
import { fetchAddresses, fetchCities, fetchQuote, initiatePayment, placeOrder } from '@/services/shop';
import { useCart } from '@/store/cart';
import { PROVINCES, type PaymentMethodId, type RedirectForm } from '@/types/api';

const schema = z.object({
  name: z.string().trim().min(2, 'Please enter your full name.').max(80),
  phone: z
    .string()
    .trim()
    .refine((v) => PK_MOBILE.test(normalizePhone(v)), 'Enter a Pakistani mobile number, e.g. 0300 1234567.'),
  email: z
    .string()
    .trim()
    .min(1, 'Enter your email so we can send your order updates.')
    .email('Enter a valid email address.'),
  province: z.enum(PROVINCES, { errorMap: () => ({ message: 'Select your province.' }) }),
  city: z.string().trim().min(2, 'Enter your city.').max(60),
  area: z.string().trim().min(2, 'Enter your area or neighbourhood.').max(100),
  line1: z.string().trim().min(5, 'Enter the full delivery address.').max(200),
  postalCode: z
    .string()
    .trim()
    .regex(/^\d{5}$/, 'Postal code must be 5 digits.')
    .or(z.literal('')),
  notes: z.string().trim().max(300),
  paymentMethod: z.enum(['cod', 'jazzcash', 'easypaisa'], {
    errorMap: () => ({ message: 'Choose a payment method.' }),
  }),
});
type Values = z.infer<typeof schema>;

const newKey = () =>
  (crypto.randomUUID?.() ?? `${Date.now()}${Math.random().toString(36).slice(2)}`)
    .replace(/[^A-Za-z0-9_-]/g, '')
    .padEnd(16, '0')
    .slice(0, 64);

export default function CheckoutPage() {
  useSeo({ title: 'Checkout', noindex: true });
  const nav = useNavigate();
  const qc = useQueryClient();
  const lines = useCart((s) => s.lines);
  const couponCode = useCart((s) => s.couponCode);
  const clear = useCart((s) => s.clear);
  const { data: session } = useSession();
  const staff = !!session && isStaff(session.user.role);
  const [redirect, setRedirect] = useState<RedirectForm | null>(null);
  // One key per checkout attempt: a double click or a retry after a dropped connection returns the same order.
  const keyRef = useRef<string>(newKey());

  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', phone: '', email: '', city: '', area: '', line1: '', postalCode: '', notes: '' },
  });
  const province = useWatch({ control, name: 'province' });
  const city = useWatch({ control, name: 'city' });
  const method = useWatch({ control, name: 'paymentMethod' });

  const { data: cities } = useQuery({ queryKey: ['cities'], queryFn: fetchCities, staleTime: 10 * 60_000 });
  const { data: addresses } = useQuery({ queryKey: ['addresses'], queryFn: fetchAddresses, enabled: !!session });

  useEffect(() => {
    // prefill once from the account, never overwriting what the shopper typed
    if (!session) return;
    setValue('name', session.user.name, { shouldDirty: false });
    setValue('email', session.user.email);
    if (session.user.phone) setValue('phone', session.user.phone);
  }, [session, setValue]);
  const fillAddress = (id: string) => {
    const a = addresses?.find((x) => x.id === id);
    if (!a) return;
    setValue('province', a.province);
    setValue('city', a.city);
    setValue('area', a.area);
    setValue('line1', a.line1);
    setValue('postalCode', a.postalCode ?? '');
    setValue('phone', a.phone);
    setValue('name', a.recipientName);
  };

  const validCity = (city ?? '').trim().length >= 2 && !!province;
  const {
    data: quote,
    isLoading: quoting,
    isError: quoteError,
    refetch,
  } = useQuery({
    queryKey: ['quote', lines, couponCode, province, validCity ? city.trim() : null],
    queryFn: () => fetchQuote({ items: lines, couponCode, ...(validCity ? { province, city: city.trim() } : {}) }),
    enabled: lines.length > 0,
    staleTime: 10_000,
  });

  // If the chosen method stops being available (e.g. the city changed), drop it so it cannot be submitted.
  useEffect(() => {
    if (method && quote && !quote.paymentMethods.find((m) => m.id === method)?.available)
      setValue('paymentMethod', undefined as unknown as PaymentMethodId);
  }, [quote, method, setValue]);

  if (staff) return <Navigate to="/admin" replace />;
  if (lines.length === 0 && !redirect)
    return (
      <div className="page-container">
        <EmptyState title="Your bag is empty" action={{ to: '/shop', label: 'Explore the collection' }} />
      </div>
    );
  if (redirect)
    return (
      <div className="page-container py-32">
        <AutoPostForm form={redirect} />
      </div>
    );

  const cart = quote?.cart;
  const blocked = !!cart && !cart.canCheckout;
  const notServiceable = quote?.serviceability && !quote.serviceability.serviceable;

  const onSubmit = handleSubmit(async (v) => {
    if (!cart) return;
    const phone = normalizePhone(v.phone);
    let placed: string | null = null;
    try {
      const order = await placeOrder(
        {
          items: lines,
          ...(couponCode ? { couponCode } : {}),
          paymentMethod: v.paymentMethod,
          customer: { name: v.name, phone, email: v.email },
          shippingAddress: {
            province: v.province,
            city: v.city,
            area: v.area,
            line1: v.line1,
            ...(v.postalCode ? { postalCode: v.postalCode } : {}),
            ...(v.notes ? { notes: v.notes } : {}),
          },
          expectedTotal: cart.total,
        },
        keyRef.current,
      );
      // The order exists and stock is reserved: the bag is done, whatever happens at the provider.
      placed = order.orderNumber;
      clear();
      try {
        sessionStorage.setItem('maple-last-order', JSON.stringify({ orderNumber: order.orderNumber, phone }));
      } catch {
        /* private mode */
      }
      qc.invalidateQueries({ queryKey: ['account-orders'] });
      if (v.paymentMethod === 'cod') return nav(`/checkout/result?order=${order.orderNumber}`, { replace: true });
      const { redirect: form } = await initiatePayment(v.paymentMethod, order.orderNumber, phone);
      setRedirect(form);
    } catch (e) {
      const err = e as ApiError;
      if (err.code === 'PRICE_CHANGED') {
        toast.message('Prices have been updated. Please review your total.');
        keyRef.current = newKey();
        await refetch();
        return;
      }
      if (err.code === 'ITEMS_UNAVAILABLE' || err.code === 'INSUFFICIENT_STOCK') {
        toast.error(err.message);
        keyRef.current = newKey();
        await refetch();
        return;
      }
      if (err.code === 'VALIDATION_ERROR') {
        setError('root', { message: 'Please check the highlighted details.' });
        return;
      }
      // Payment start failed after the order was placed: the order is safe, and the result page lets them retry.
      if (placed) {
        toast.error(err.message);
        return nav(`/checkout/result?order=${placed}`, { replace: true });
      }
      setError('root', { message: err.message });
    }
  });

  return (
    <div className="page-container py-10 sm:py-16">
      <h1 className="text-5xl sm:text-6xl">Checkout</h1>
      {!session && (
        <p className="mt-4 text-[14px] text-stone">
          Checking out as a guest.{' '}
          <Link to="/login?next=/checkout" className="link-underline">
            Sign in
          </Link>{' '}
          for faster checkout.
        </p>
      )}
      <form onSubmit={onSubmit} noValidate className="mt-10 grid gap-12 lg:grid-cols-[1fr_420px]">
        <div className="space-y-12">
          <fieldset className="space-y-5">
            <legend className="mb-2 font-display text-3xl">Contact</legend>
            <FormField label="Full name" autoComplete="name" error={errors.name?.message} {...register('name')} />
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                label="Mobile number"
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                hint="For delivery updates."
                error={errors.phone?.message}
                {...register('phone')}
              />
              <FormField
                label="Email"
                type="email"
                autoComplete="email"
                inputMode="email"
                hint="Your order confirmation and delivery updates go here."
                error={errors.email?.message}
                {...register('email')}
              />
            </div>
          </fieldset>

          <fieldset className="space-y-5">
            <legend className="mb-2 font-display text-3xl">Delivery</legend>
            {addresses && addresses.length > 0 && (
              <div>
                <label htmlFor="saved" className="field-label">
                  Saved address
                </label>
                <select id="saved" className="field" defaultValue="" onChange={(e) => fillAddress(e.target.value)}>
                  <option value="">Choose a saved address</option>
                  {addresses.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}: {a.line1}, {a.city}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="province" className="field-label">
                  Province
                </label>
                <select
                  id="province"
                  className="field"
                  aria-invalid={!!errors.province}
                  defaultValue=""
                  {...register('province')}
                >
                  <option value="" disabled>
                    Select province
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
              <div>
                <FormField
                  label="City"
                  autoComplete="address-level2"
                  list="city-list"
                  error={errors.city?.message}
                  {...register('city')}
                />
                <datalist id="city-list">
                  {cities
                    ?.filter((c) => !province || c.province === province)
                    .map((c) => (
                      <option key={`${c.city}-${c.province}`} value={c.city} />
                    ))}
                </datalist>
              </div>
            </div>
            {notServiceable && (
              <p role="alert" className="text-[14px] text-[#8a2f26]">
                We don't deliver to this city yet. Please check the spelling or try a nearby city.
              </p>
            )}
            <FormField label="Area / neighbourhood" error={errors.area?.message} {...register('area')} />
            <FormField
              label="Full address"
              autoComplete="street-address"
              error={errors.line1?.message}
              {...register('line1')}
            />
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                label="Postal code (optional)"
                inputMode="numeric"
                maxLength={5}
                error={errors.postalCode?.message}
                {...register('postalCode')}
              />
              <FormField label="Delivery notes (optional)" error={errors.notes?.message} {...register('notes')} />
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-4 font-display text-3xl">Payment</legend>
            <div className="space-y-3" role="radiogroup" aria-label="Payment method">
              {(quote?.paymentMethods ?? []).map((m) => (
                <label
                  key={m.id}
                  className={`flex cursor-pointer items-start gap-4 border p-5 transition-colors ${m.available ? (method === m.id ? 'border-charcoal bg-ivory' : 'border-taupe hover:border-charcoal') : 'cursor-not-allowed border-taupe opacity-60'}`}
                >
                  <input
                    type="radio"
                    value={m.id}
                    disabled={!m.available}
                    className="mt-1 accent-charcoal"
                    {...register('paymentMethod')}
                  />
                  <span>
                    <span className="block text-[15px]">
                      {methodLabel(m.id)}
                      {m.demo && m.available && (
                        <span className="ml-2 border border-bronze px-1.5 py-0.5 align-middle text-[10px] uppercase tracking-[0.14em] text-bronze">
                          Demo
                        </span>
                      )}
                    </span>
                    <span className="mt-1 block text-[13px] text-stone">
                      {!m.available
                        ? m.reason
                        : m.id === 'cod'
                          ? 'Pay in cash when your order arrives.'
                          : m.demo
                            ? 'Simulated for this portfolio demo: you will see a sandbox payment page and no real money moves. Your order is confirmed once you approve it.'
                            : 'You will be taken to a secure page to pay. Your order is confirmed once the payment is verified.'}
                    </span>
                  </span>
                </label>
              ))}
              {quoting && !quote && <Skeleton className="h-20" />}
            </div>
            {errors.paymentMethod && (
              <p role="alert" className="field-error">
                {errors.paymentMethod.message}
              </p>
            )}
          </fieldset>
        </div>

        <aside className="h-fit space-y-6 bg-ivory p-6 sm:p-8 lg:sticky lg:top-28" aria-label="Order summary">
          <h2 className="font-display text-3xl">Order summary</h2>
          {quoteError && (
            <p role="alert" className="text-[14px] text-[#8a2f26]">
              We couldn't confirm your total.{' '}
              <button type="button" className="underline" onClick={() => refetch()}>
                Try again
              </button>
            </p>
          )}
          {!cart ? (
            <Skeleton className="h-40" />
          ) : (
            <>
              <ul className="divide-y divide-taupe/70">
                {cart.lines.map((l) => (
                  <li key={l.variantId} className="flex gap-3 py-3">
                    <div className="h-20 w-16 shrink-0 bg-paper">
                      <Img image={l.image} width={160} sizes="64px" className="h-full w-full" />
                    </div>
                    <div className="flex-1 text-[14px]">
                      <p className="font-display text-lg leading-tight">{l.name ?? 'Unavailable item'}</p>
                      {l.options.length > 0 && <p className="text-stone">{optionLabel(l.options)}</p>}
                      <p className="text-stone">Qty {l.quantity}</p>
                      {l.status !== 'ok' && (
                        <p role="alert" className="text-[#8a2f26]">
                          {l.status === 'unavailable' ? 'No longer available' : `Only ${l.availableQuantity} left`}
                        </p>
                      )}
                    </div>
                    <p className="text-[14px]">{formatPKR(l.lineTotal)}</p>
                  </li>
                ))}
              </ul>
              <CartSummary cart={cart} />
              {blocked && (
                <p role="alert" className="text-[13px] text-[#8a2f26]">
                  Some items need attention.{' '}
                  <Link to="/bag" className="underline">
                    Review your bag
                  </Link>
                </p>
              )}
            </>
          )}
          {errors.root && (
            <p role="alert" className="field-error">
              {errors.root.message}
            </p>
          )}
          <button disabled={isSubmitting || !cart || blocked || !!notServiceable} className="btn-primary w-full">
            {isSubmitting
              ? 'Placing order'
              : method === 'cod'
                ? 'Place order'
                : method
                  ? 'Continue to payment'
                  : 'Place order'}
          </button>
          <p className="text-center text-[12px] text-stone">Your total is confirmed by us when the order is placed.</p>
        </aside>
      </form>
    </div>
  );
}
