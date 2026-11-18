import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSeo } from '@/lib/seo';
import { unsubscribeNewsletter } from '@/services/shop';

export default function UnsubscribePage() {
  useSeo({ title: 'Unsubscribe', noindex: true });
  const [params] = useSearchParams();
  const email = params.get('email');
  const token = params.get('token');
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'failed'>('idle');
  async function go() {
    if (!email || !token) return;
    setState('busy');
    try {
      await unsubscribeNewsletter(email, token);
      setState('done');
    } catch {
      setState('failed');
    }
  }
  return (
    <div className="page-container max-w-md py-20 text-center sm:py-28">
      <h1 className="text-5xl">Unsubscribe</h1>
      {!email || !token ? (
        <p role="alert" className="mt-6 text-[15px] text-stone">
          This unsubscribe link is incomplete. Please use the link in the latest email.
        </p>
      ) : state === 'done' ? (
        <p role="status" className="mt-6 text-[15px] text-stone">
          You have been unsubscribed. We're sorry to see you go.{' '}
          <Link to="/" className="link-underline">
            Back to MAPLE
          </Link>
        </p>
      ) : (
        <>
          <p className="mt-6 text-[15px] text-stone">
            Stop emails to <strong className="font-medium text-charcoal">{email}</strong>?
          </p>
          <button onClick={go} disabled={state === 'busy'} className="btn-primary mt-8">
            {state === 'busy' ? 'Working' : 'Confirm unsubscribe'}
          </button>
          {state === 'failed' && (
            <p role="alert" className="field-error">
              That link isn't valid or has expired.
            </p>
          )}
        </>
      )}
    </div>
  );
}
