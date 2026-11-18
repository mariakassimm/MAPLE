import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSeo } from '@/lib/seo';
import { confirmNewsletter } from '@/services/shop';

export default function ConfirmNewsletterPage() {
  useSeo({ title: 'Confirm subscription', noindex: true });
  const [params] = useSearchParams();
  const email = params.get('email');
  const token = params.get('token');
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'failed'>('idle');
  const [message, setMessage] = useState('');
  async function go() {
    if (!email || !token) return;
    setState('busy');
    try {
      await confirmNewsletter(email, token);
      setState('done');
    } catch (e) {
      setMessage((e as Error).message);
      setState('failed');
    }
  }
  return (
    <div className="page-container max-w-md py-20 text-center sm:py-28">
      <h1 className="text-5xl">Subscription</h1>
      {!email || !token ? (
        <p role="alert" className="mt-6 text-[15px] text-stone">
          This confirmation link is incomplete. Please use the link in the latest email.
        </p>
      ) : state === 'done' ? (
        <p role="status" className="mt-6 text-[15px] text-stone">
          You are subscribed. Welcome to MAPLE.{' '}
          <Link to="/" className="link-underline">
            Back to MAPLE
          </Link>
        </p>
      ) : (
        <>
          <p className="mt-6 text-[15px] text-stone">
            Confirm that <strong className="font-medium text-charcoal">{email}</strong> should receive MAPLE news?
          </p>
          <button onClick={go} disabled={state === 'busy'} className="btn-primary mt-8">
            {state === 'busy' ? 'Working' : 'Confirm subscription'}
          </button>
          {state === 'failed' && (
            <p role="alert" className="field-error">
              {message || 'That link is not valid.'}
            </p>
          )}
        </>
      )}
    </div>
  );
}
