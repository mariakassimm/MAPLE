import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { adminAudit } from '@/admin/api';
import { Empty, PageHeader, Pager, Table, Td } from '@/admin/components/ui';
import { ErrorState, Skeleton } from '@/components/ui/States';
import { formatDateTime } from '@/lib/format';

export default function AuditPage() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const q = { page, limit: 50, action: params.get('action') ?? undefined };
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-audit', q],
    queryFn: () => adminAudit(q),
    placeholderData: (p) => p,
  });
  return (
    <>
      <PageHeader title="Audit log" sub="Sensitive staff actions, newest first. Entries cannot be edited or deleted." />
      <form
        role="search"
        className="mb-6 max-w-sm"
        onSubmit={(e) => {
          e.preventDefault();
          const v = String(new FormData(e.currentTarget).get('action') ?? '').trim();
          setParams(v ? { action: v } : {});
        }}
      >
        <input
          name="action"
          className="field"
          aria-label="Filter by action"
          placeholder="Action starts with… e.g. order."
          defaultValue={params.get('action') ?? ''}
        />
      </form>
      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isLoading || !data ? (
        <Skeleton className="h-96" />
      ) : data.items.length === 0 ? (
        <Empty>No entries.</Empty>
      ) : (
        <>
          <Table head={['When', 'Action', 'Target', 'Role', 'Details']}>
            {data.items.map((a) => (
              <tr key={a.id}>
                <Td className="whitespace-nowrap text-stone">{formatDateTime(a.at)}</Td>
                <Td className="font-medium">{a.action}</Td>
                <Td className="text-stone">
                  {a.resourceType}
                  {a.resourceId ? ` · ${a.resourceId.slice(-8)}` : ''}
                </Td>
                <Td>{a.actorRole?.replace('_', ' ') ?? '–'}</Td>
                <Td className="max-w-xs truncate text-[12px] text-stone">
                  <span title={a.metadata ? JSON.stringify(a.metadata) : ''}>
                    {a.metadata ? JSON.stringify(a.metadata) : ''}
                  </span>
                </Td>
              </tr>
            ))}
          </Table>
          <Pager
            page={data.pagination.page}
            totalPages={data.pagination.totalPages}
            onPage={(p) => {
              const n = new URLSearchParams(params);
              n.set('page', String(p));
              setParams(n);
            }}
          />
        </>
      )}
    </>
  );
}
