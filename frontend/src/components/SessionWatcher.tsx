import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { setCsrfToken, setUnauthorizedHandler } from '@/lib/api';

/**
 * If the server says the session is gone (expired, signed out elsewhere, account suspended) while the person thinks they
 * are signed in, clear local state and send them to the right sign-in page, remembering where they were.
 */
export function SessionWatcher() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const loc = useLocation();
  const where = useRef(loc);
  where.current = loc;
  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (!qc.getQueryData(['session'])) return; // a guest getting a 401 is normal, not an expiry
      setCsrfToken(null);
      qc.setQueryData(['session'], null);
      const { pathname, search } = where.current;
      const next = encodeURIComponent(pathname + search);
      if (pathname.startsWith('/admin')) nav(`/admin/login?expired=1&next=${next}`, { replace: true });
      else if (pathname.startsWith('/account')) {
        toast('Your session has ended. Please sign in again.');
        nav(`/login?next=${next}`, { replace: true });
      } else toast('Your session has ended. Please sign in again.');
    });
    return () => setUnauthorizedHandler(null);
  }, [qc, nav]);
  return null;
}
