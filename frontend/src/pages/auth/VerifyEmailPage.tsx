import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AuthShell } from '@/pages/auth/AuthShell';
import { Spinner } from '@/components/ui/States';
import { verifyEmail } from '@/services/api';

export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [state, setState] = useState<'working' | 'ok' | 'failed'>(token ? 'working' : 'failed');
  const ran = useRef(false); // StrictMode runs effects twice; the token is single-use
  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true;
    verifyEmail(token).then(
      () => setState('ok'),
      () => setState('failed'),
    );
  }, [token]);
  return (
    <AuthShell title="Verify email">
      {state === 'working' && <Spinner label="Verifying" />}
      {state === 'ok' && (
        <p role="status" className="text-center text-[15px] text-stone">
          Your email is verified.{' '}
          <Link to="/account" className="link-underline">
            Go to your account
          </Link>
        </p>
      )}
      {state === 'failed' && (
        <p role="alert" className="text-center text-[15px] text-stone">
          This verification link is invalid or has expired. Sign in and request a new one from your account.
        </p>
      )}
    </AuthShell>
  );
}
