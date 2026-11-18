import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  adjustStock,
  adminCategories,
  adminInventory,
  createCategory,
  inventoryMovements,
  updateCategory,
  type AdminCategory,
} from '@/admin/api';
import { ImageUploader } from '@/admin/components/ImageUploader';
import { Badge, Card, Empty, PageHeader, Pager, Table, Td } from '@/admin/components/ui';
import { can } from '@/admin/permissions';
import { ErrorState, Skeleton } from '@/components/ui/States';
import { useSession } from '@/hooks/queries';
import { formatDateTime, optionLabel, statusLabel } from '@/lib/format';
import type { Image } from '@/types/api';

function CategoryForm({ cat, onDone }: { cat?: AdminCategory; onDone: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(cat?.name ?? '');
  const [description, setDescription] = useState(cat?.description ?? '');
  const [order, setOrder] = useState(String(cat?.displayOrder ?? 0));
  const [images, setImages] = useState<Image[]>(cat?.image ? [cat.image] : []);
  const [status, setStatus] = useState(cat?.status ?? 'active');
  const [error, setError] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: async () => {
      const displayOrder = Number(order);
      if (!Number.isInteger(displayOrder) || displayOrder < 0) throw new Error('Display order must be a whole number.');
      const image = images[0];
      return cat
        ? updateCategory(cat.id, {
            name: name.trim(),
            description: description.trim(),
            image: image ?? null,
            displayOrder,
            status,
          })
        : createCategory({
            name: name.trim(),
            ...(description.trim() ? { description: description.trim() } : {}),
            ...(image ? { image } : {}),
            displayOrder,
          });
    },
    onSuccess: () => {
      toast.success('Category saved.');
      qc.invalidateQueries({ queryKey: ['admin-categories'] });
      qc.invalidateQueries({ queryKey: ['categories'] });
      onDone();
    },
    onError: (e) => setError((e as Error).message),
  });
  return (
    <form
      className="space-y-5 border border-taupe p-5"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        m.mutate();
      }}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="c-name" className="field-label">
            Name
          </label>
          <input id="c-name" className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </div>
        <div>
          <label htmlFor="c-order" className="field-label">
            Display order
          </label>
          <input
            id="c-order"
            className="field"
            inputMode="numeric"
            value={order}
            onChange={(e) => setOrder(e.target.value)}
          />
        </div>
      </div>
      <div>
        <label htmlFor="c-desc" className="field-label">
          Description
        </label>
        <textarea
          id="c-desc"
          className="field"
          maxLength={600}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div>
        <p className="field-label">Image</p>
        <ImageUploader images={images} onChange={(n) => setImages(n.slice(-1))} folder="categories" max={1} />
      </div>
      {cat && (
        <div>
          <label htmlFor="c-status" className="field-label">
            Status
          </label>
          <select
            id="c-status"
            className="field"
            value={status}
            onChange={(e) => setStatus(e.target.value as 'active' | 'archived')}
          >
            <option value="active">Active</option>
            <option value="archived">Archived (hidden from the store)</option>
          </select>
        </div>
      )}
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <button className="btn-primary" disabled={m.isPending}>
          Save category
        </button>
        <button type="button" className="btn-ghost" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function CategoriesPage() {
  const { data: session } = useSession();
  const canWrite = can(session?.user.role, 'categories:write');
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['admin-categories'], queryFn: adminCategories });
  const [editing, setEditing] = useState<AdminCategory | 'new' | null>(null);
  if (isError) return <ErrorState onRetry={() => refetch()} />;
  return (
    <>
      <PageHeader
        title="Categories"
        actions={
          canWrite &&
          !editing && (
            <button className="btn-primary !min-h-[44px]" onClick={() => setEditing('new')}>
              New category
            </button>
          )
        }
      />
      {editing && (
        <div className="mb-6">
          <CategoryForm
            key={editing === 'new' ? 'new' : editing.id}
            cat={editing === 'new' ? undefined : editing}
            onDone={() => setEditing(null)}
          />
        </div>
      )}
      {isLoading || !data ? (
        <Skeleton className="h-64" />
      ) : data.length === 0 ? (
        <Empty>No categories yet. Create one before adding products.</Empty>
      ) : (
        <Table head={['Name', 'Slug', 'Products', 'Order', 'Status', '']}>
          {data.map((c) => (
            <tr key={c.id}>
              <Td>{c.name}</Td>
              <Td className="text-stone">{c.slug}</Td>
              <Td>{c.productCount ?? 0}</Td>
              <Td>{c.displayOrder}</Td>
              <Td>
                <Badge value={c.status === 'active' ? 'approved' : 'cancelled'} label={statusLabel(c.status)} />
              </Td>
              <Td>
                {canWrite && (
                  <button className="text-[12px] uppercase tracking-[0.14em]" onClick={() => setEditing(c)}>
                    Edit
                  </button>
                )}
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}

export function InventoryPage() {
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();
  const { data: session } = useSession();
  const canWrite = can(session?.user.role, 'inventory:write');
  const page = Math.max(1, Number(params.get('page')) || 1);
  const lowStock = params.get('lowStock') === 'true';
  const q = { page, limit: 25, lowStock: lowStock ? 'true' : undefined, q: params.get('q') ?? undefined };
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-inventory', q],
    queryFn: () => adminInventory(q),
    placeholderData: (p) => p,
  });
  const { data: moves } = useQuery({
    queryKey: ['admin-movements'],
    queryFn: () => inventoryMovements({ page: 1, limit: 10 }),
  });
  const [adj, setAdj] = useState<{ productId: string; variantId: string; label: string } | null>(null);
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const m = useMutation({
    mutationFn: () => {
      const d = Number(delta);
      if (!Number.isInteger(d) || d === 0) throw new Error('Enter a whole number other than zero, e.g. 10 or -2.');
      return adjustStock({ productId: adj!.productId, variantId: adj!.variantId, delta: d, reason: reason.trim() });
    },
    onSuccess: () => {
      toast.success('Stock adjusted.');
      setAdj(null);
      setDelta('');
      setReason('');
      qc.invalidateQueries({ queryKey: ['admin-inventory'] });
      qc.invalidateQueries({ queryKey: ['admin-movements'] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <>
      <PageHeader
        title="Inventory"
        sub="Available = ready to sell. Reserved = held for open orders."
        actions={
          <button
            className="btn-secondary !min-h-[42px] !px-5"
            onClick={() => {
              const n = new URLSearchParams(params);
              lowStock ? n.delete('lowStock') : n.set('lowStock', 'true');
              n.delete('page');
              setParams(n);
            }}
          >
            {lowStock ? 'Show all' : 'Low stock only'}
          </button>
        }
      />
      <form
        role="search"
        className="mb-6 max-w-sm"
        onSubmit={(e) => {
          e.preventDefault();
          const n = new URLSearchParams(params);
          const v = String(new FormData(e.currentTarget).get('q') ?? '').trim();
          v ? n.set('q', v) : n.delete('q');
          n.delete('page');
          setParams(n);
        }}
      >
        <input
          name="q"
          className="field"
          aria-label="Search inventory"
          placeholder="Search product or SKU"
          defaultValue={params.get('q') ?? ''}
        />
      </form>
      {adj && canWrite && (
        <form
          className="mb-6 grid gap-4 border border-taupe p-5 sm:grid-cols-[1fr_1fr_2fr_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            m.mutate();
          }}
        >
          <p className="self-center text-[14px] sm:col-span-4">
            <strong className="font-medium">{adj.label}</strong>
          </p>
          <div>
            <label htmlFor="delta" className="field-label">
              Change (+/−)
            </label>
            <input
              id="delta"
              className="field"
              inputMode="numeric"
              value={delta}
              onChange={(e) => setDelta(e.target.value)}
              placeholder="+10 or -2"
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="why" className="field-label">
              Reason
            </label>
            <input
              id="why"
              className="field"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Stock count, damaged, restock…"
              maxLength={200}
            />
          </div>
          <div className="flex items-end gap-3">
            <button className="btn-primary !min-h-[48px]" disabled={m.isPending || reason.trim().length < 3}>
              Apply
            </button>
            <button type="button" className="btn-ghost !min-h-[48px]" onClick={() => setAdj(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isLoading || !data ? (
        <Skeleton className="h-80" />
      ) : data.items.length === 0 ? (
        <Empty>Nothing to show.</Empty>
      ) : (
        <>
          <Table head={['Product', 'SKU', 'Options', 'Available', 'Reserved', '']}>
            {data.items.map((r) => (
              <tr key={r.variantId}>
                <Td>{r.productName}</Td>
                <Td>{r.sku}</Td>
                <Td className="text-stone">{optionLabel(r.options) || '–'}</Td>
                <Td>
                  <span className={r.isLow ? 'font-medium text-[#8a2f26]' : ''}>{r.available}</span>
                  {r.isLow && <span className="ml-2 text-[11px] uppercase tracking-[0.12em] text-[#8a2f26]">Low</span>}
                </Td>
                <Td>{r.reserved}</Td>
                <Td>
                  {canWrite && (
                    <button
                      className="text-[12px] uppercase tracking-[0.14em]"
                      onClick={() =>
                        setAdj({ productId: r.productId, variantId: r.variantId, label: `${r.productName} · ${r.sku}` })
                      }
                    >
                      Adjust
                    </button>
                  )}
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
      <Card title="Recent stock movements" className="mt-8">
        {!moves || moves.items.length === 0 ? (
          <Empty>No movements yet.</Empty>
        ) : (
          <Table head={['When', 'SKU', 'Type', 'Stock', 'Reserved', 'Reason']}>
            {moves.items.map((x) => (
              <tr key={x.id}>
                <Td className="whitespace-nowrap text-stone">{formatDateTime(x.createdAt)}</Td>
                <Td>{x.sku}</Td>
                <Td>{statusLabel(x.type)}</Td>
                <Td>{x.stockDelta > 0 ? `+${x.stockDelta}` : x.stockDelta}</Td>
                <Td>{x.reservedDelta > 0 ? `+${x.reservedDelta}` : x.reservedDelta}</Td>
                <Td className="text-stone">{x.reason ?? ''}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
