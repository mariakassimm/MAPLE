import { useEffect, useRef } from 'react';
import type { RedirectForm } from '@/types/api';

/** Hands the shopper to the payment provider with the signed fields the server prepared. Only https targets are posted. */
export function AutoPostForm({ form }: { form: RedirectForm }) {
  const ref = useRef<HTMLFormElement>(null);
  const safe = (() => {
    try {
      return new URL(form.action).protocol === 'https:';
    } catch {
      return false;
    }
  })();
  useEffect(() => {
    if (safe) ref.current?.submit();
  }, [safe]);
  if (!safe)
    return (
      <p role="alert" className="field-error">
        We couldn't open the payment page. Please try again.
      </p>
    );
  return (
    <form ref={ref} method="POST" action={form.action}>
      {Object.entries(form.fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <noscript>
        <button className="btn-primary">Continue to payment</button>
      </noscript>
      <p role="status" className="text-center text-[14px] text-stone">
        Taking you to the secure payment page…
      </p>
    </form>
  );
}
