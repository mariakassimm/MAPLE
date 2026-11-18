import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { adminCategories, adminProducts, productAction } from '@/admin/api';
import { Badge, Empty, PageHeader, Pager, Table, Td } from '@/admin/components/ui';
import { can } from '@/admin/permissions';
import { ErrorState, Skeleton } from '@/components/ui/States';
import { Img } from '@/components/ui/Img';
import { useSession } from '@/hooks/queries';
import { formatPKR } from '@/lib/format';

export default function ProductsPage() {
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();
  const { data: session } = useSession();
  const canWrite = can(session?.user.role, 'products:write');
  const page = Math.max(1, Number(params.get('page')) || 1);
  const q = {
    page,
    limit: 20,
    status: params.get('status') ?? undefined,
    categoryId: params.get('categoryId') ?? undefined,
    q: params.get('q') ?? undefined,
  };
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-products', q],
    queryFn: () => adminProducts(q),
    placeholderData: (p) => p,
  });
  const { data: cats } = useQuery({ queryKey: ['admin-categories'], queryFn: adminCategories });
  const act = useMutation({
    mutationFn: (v: { id: string; a: 'publish' | 'unpublish' | 'archive' }) => productAction(v.id, v.a),
    onSuccess: () => {
      toast.success('Product updated.');
      qc.invalidateQueries({ queryKey: ['admin-products'] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(params);
    v ? n.set(k, v) : n.delete(k);
    n.delete('page');
    setParams(n);
  };
  const catName = (id: string) => cats?.find((c) => c.id === id)?.name ?? '–';

  return (
    <>
      <PageHeader
        title="Products"
        actions={
          canWrite && (
            <Link to="/admin/products/new" className="btn-primary !min-h-[44px]">
              New product
            </Link>
          )
        }
      />
      <form
        className="mb-6 grid gap-3 sm:grid-cols-3"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          set('q', String(new FormData(e.currentTarget).get('q') ?? '').trim());
        }}
      >
        <input
          name="q"
          className="field"
          defaultValue={params.get('q') ?? ''}
          placeholder="Search products"
          aria-label="Search products"
        />
        <select
          className="field"
          aria-label="Status"
          value={params.get('status') ?? ''}
          onChange={(e) => set('status', e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
        <select
          className="field"
          aria-label="Category"
          value={params.get('categoryId') ?? ''}
          onChange={(e) => set('categoryId', e.target.value)}
        >
          <option value="">All categories</option>
          {cats?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </form>
      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isLoading || !data ? (
        <Skeleton className="h-96" />
      ) : data.items.length === 0 ? (
        <Empty>No products yet.</Empty>
      ) : (
        <>
          <Table head={['', 'Product', 'Category', 'Price', 'Stock', 'Status', '']}>
            {data.items.map((p) => (
              <tr key={p.id}>
                <Td className="w-16">
                  <div className="h-14 w-12 bg-ivory">
                    <Img image={p.image} width={120} sizes="48px" className="h-full w-full" />
                  </div>
                </Td>
                <Td>
                  <Link to={`/admin/products/${p.id}`} className="underline underline-offset-4">
                    {p.name}
                  </Link>
                  <br />
                  <span className="text-[12px] text-stone">
                    {p.variantCount} variant{p.variantCount === 1 ? '' : 's'}
                  </span>
                </Td>
                <Td>{catName(p.categoryId)}</Td>
                <Td className="whitespace-nowrap">
                  {p.priceMin === p.priceMax
                    ? formatPKR(p.priceMin)
                    : `${formatPKR(p.priceMin)} – ${formatPKR(p.priceMax)}`}
                </Td>
                <Td>{p.totalAvailable}</Td>
                <Td>
                  <Badge value={p.status} />
                </Td>
                <Td className="whitespace-nowrap text-[12px] uppercase tracking-[0.12em]">
                  {canWrite &&
                    (p.status === 'published' ? (
                      <button onClick={() => act.mutate({ id: p.id, a: 'unpublish' })}>Unpublish</button>
                    ) : p.status !== 'archived' ? (
                      <button onClick={() => act.mutate({ id: p.id, a: 'publish' })}>Publish</button>
                    ) : null)}
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
