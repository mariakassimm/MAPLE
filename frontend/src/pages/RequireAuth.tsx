import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { isStaff } from '@/admin/permissions';
import { Spinner } from '@/components/ui/States';
import { useSession } from '@/hooks/queries';

/** Customer area guard: guests go to sign-in, and staff go to their own dashboard (they have no shopper account). */
export function RequireAuth() {
  const { data: session, isLoading } = useSession();
  const loc = useLocation();
  if (isLoading)
    return (
      <div className="py-32">
        <Spinner />
      </div>
    );
  if (!session) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (isStaff(session.user.role)) return <Navigate to="/admin" replace />;
  return <Outlet />;
}
