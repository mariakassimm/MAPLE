import { useId, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { subscribeNewsletter } from '@/services/api';

const emailSchema = z.string().trim().email('Please enter a valid email address.');

export function NewsletterForm({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const id = useId();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) return setError(parsed.error.issues[0]!.message);
    setError(null);
    setBusy(true);
    try {
      await subscribeNewsletter(parsed.data);
      setDone(parsed.data);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (done)
    return (
      <div role="status" className="mx-auto max-w-md">
        <p className="font-display text-2xl">Almost there.</p>
        <p className="mt-2 text-[15px] opacity-80">
          We have sent a confirmation link to <strong className="font-medium">{done}</strong>. Click it to complete your
          subscription. If you do not see it, check your spam folder.
        </p>
      </div>
    );
  return (
    <form onSubmit={submit} noValidate className="mx-auto flex max-w-md flex-col gap-3 sm:flex-row">
      <div className="flex-1">
        <label htmlFor={id} className="sr-only">
          Email address
        </label>
        <input
          id={id}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Your email address"
          className={
            tone === 'dark' ? 'field border-ivory/30 bg-transparent text-ivory placeholder:text-sand' : 'field'
          }
          aria-invalid={!!error}
        />
        {error && (
          <p role="alert" className="field-error text-left">
            {error}
          </p>
        )}
      </div>
      <button disabled={busy} className={tone === 'dark' ? 'btn bg-ivory text-charcoal hover:bg-sand' : 'btn-primary'}>
        {busy ? 'Sending' : 'Subscribe'}
      </button>
    </form>
  );
}
