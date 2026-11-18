import { Suspense, lazy } from 'react';
import { Navigate } from 'react-router-dom';
import { adminHomeFor } from '@/admin/nav';
import { can } from '@/admin/permissions';
import { Spinner } from '@/components/ui/States';
import { useSession } from '@/hooks/queries';

const Dashboard = lazy(() => import('@/admin/pages/DashboardPage'));

/** /admin: the dashboard for roles that have reports, otherwise the first section the role may open. */
export default function AdminHome() {
  const { data: session } = useSession();
  const role = session?.user.role ?? '';
  if (!can(role, 'reports:read')) return <Navigate to={adminHomeFor(role)} replace />;
  return (
    <Suspense
      fallback={
        <div className="py-24">
          <Spinner />
        </div>
      }
    >
      <Dashboard />
    </Suspense>
  );
}
