import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  addVariant,
  adminCategories,
  adminProduct,
  createProduct,
  productAction,
  updateProduct,
  updateVariant,
  type AdminVariant,
} from '@/admin/api';
import { ImageUploader } from '@/admin/components/ImageUploader';
import { Badge, Card, PageHeader, Table, Td } from '@/admin/components/ui';
import { can } from '@/admin/permissions';
import { Skeleton } from '@/components/ui/States';
import { useSession } from '@/hooks/queries';
import { formatPKR, rupeesToPaisa } from '@/lib/format';
import type { Image } from '@/types/api';

interface VariantDraft {
  key: string;
  id?: string;
  sku: string;
  options: string;
  price: string;
  salePrice: string;
  stock: string;
  threshold: string;
  isActive: boolean;
}
const blankVariant = (): VariantDraft => ({
  key: crypto.randomUUID?.() ?? String(Math.random()),
  sku: '',
  options: '',
  price: '',
  salePrice: '',
  stock: '0',
  threshold: '3',
  isActive: true,
});

// "color: Ivory, size: M" -> [{ name: 'color', value: 'Ivory' }, ...]; an empty string means a single-variant product.
function parseOptions(text: string): { name: string; value: string }[] | string {
  if (!text.trim()) return [];
  const out: { name: string; value: string }[] = [];
  for (const part of text.split(',')) {
    const [name, ...rest] = part.split(':');
    const value = rest.join(':').trim();
    if (!name?.trim() || !value) return `Write options like “color: Ivory, size: M” (problem near “${part.trim()}”).`;
    out.push({ name: name.trim().toLowerCase(), value });
  }
  return out;
}
const optionsText = (o: { name: string; value: string }[]) => o.map((x) => `${x.name}: ${x.value}`).join(', ');

function VariantRow({
  v,
  onChange,
  onRemove,
  isNew,
}: {
  v: VariantDraft;
  onChange: (v: VariantDraft) => void;
  onRemove?: () => void;
  isNew: boolean;
}) {
  const f = (k: keyof VariantDraft, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label className="field-label" htmlFor={`${v.key}-${k}`}>
        {label}
      </label>
      <input
        id={`${v.key}-${k}`}
        className="field"
        value={String(v[k])}
        onChange={(e) => onChange({ ...v, [k]: e.target.value })}
        {...props}
      />
    </div>
  );
  return (
    <li className="space-y-4 border border-taupe p-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {f('sku', 'SKU', { placeholder: 'MPL-TOTE-IVR', maxLength: 40 })}
        {f('options', 'Options', { placeholder: 'color: Ivory, size: M' })}
        {f('price', 'Price (Rs)', { inputMode: 'decimal' })}
        {f('salePrice', 'Sale price (Rs, optional)', { inputMode: 'decimal' })}
      </div>
      <div className="flex flex-wrap items-end gap-4">
        {isNew ? (
          f('stock', 'Opening stock', { inputMode: 'numeric' })
        ) : (
          <p className="text-[13px] text-stone">
            Stock is changed from the Inventory page so every change is recorded.
          </p>
        )}
        {f('threshold', 'Low-stock alert at', { inputMode: 'numeric' })}
        {!isNew && (
          <label className="flex items-center gap-2 pb-3 text-[14px]">
            <input
              type="checkbox"
              className="accent-charcoal"
              checked={v.isActive}
              onChange={(e) => onChange({ ...v, isActive: e.target.checked })}
            />{' '}
            Active
          </label>
        )}
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="pb-3 text-[12px] uppercase tracking-[0.14em] text-[#8a2f26]"
          >
            Remove
          </button>
        )}
      </div>
    </li>
  );
}

function toPayload(v: VariantDraft, isNew: boolean): { error: string } | { body: Record<string, unknown> } {
  const options = parseOptions(v.options);
  if (typeof options === 'string') return { error: options };
  const price = rupeesToPaisa(v.price);
  if (!price) return { error: `Enter a price for ${v.sku || 'each variant'}.` };
  const sale = v.salePrice.trim() ? rupeesToPaisa(v.salePrice) : null;
  if (v.salePrice.trim() && !sale) return { error: `Sale price for ${v.sku} is not a valid amount.` };
  if (sale != null && sale >= price) return { error: `Sale price for ${v.sku} must be lower than the regular price.` };
  if (!v.sku.trim()) return { error: 'Every variant needs a SKU.' };
  const threshold = Number(v.threshold);
  if (!Number.isInteger(threshold) || threshold < 0) return { error: 'Low-stock alert must be a whole number.' };
  const body: Record<string, unknown> = {
    sku: v.sku.trim(),
    options,
    price,
    salePrice: sale,
    lowStockThreshold: threshold,
  };
  if (isNew) {
    const stock = Number(v.stock);
    if (!Number.isInteger(stock) || stock < 0) return { error: 'Opening stock must be a whole number.' };
    body.initialStock = stock;
    if (sale == null) delete body.salePrice;
  } else body.isActive = v.isActive;
  return { body };
}

export default function ProductEditPage() {
  const confirm = useConfirm();
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: session } = useSession();
  const canWrite = can(session?.user.role, 'products:write');
  const { data: cats } = useQuery({ queryKey: ['admin-categories'], queryFn: adminCategories });
  const { data: product, isLoading } = useQuery({
    queryKey: ['admin-product', id],
    queryFn: () => adminProduct(id!),
    enabled: !isNew,
  });

  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [shortDescription, setShort] = useState('');
  const [description, setDescription] = useState('');
  const [images, setImages] = useState<Image[]>([]);
  const [attrs, setAttrs] = useState<{ label: string; value: string }[]>([]);
  const [featured, setFeatured] = useState(false);
  const [bestseller, setBestseller] = useState(false);
  const [allowBackorder, setBackorder] = useState(false);
  const [seoTitle, setSeoTitle] = useState('');
  const [seoDescription, setSeoDescription] = useState('');
  const [variants, setVariants] = useState<VariantDraft[]>([blankVariant()]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!product) return;
    setName(product.name);
    setCategoryId(product.categoryId);
    setShort(product.shortDescription ?? '');
    setDescription(product.description);
    setImages(product.images);
    setAttrs(product.attributes);
    setFeatured(product.featured);
    setBestseller(product.bestseller);
    setBackorder(product.allowBackorder);
    setSeoTitle(product.seo.title ?? '');
    setSeoDescription(product.seo.description ?? '');
    setVariants(
      product.variants.map((v: AdminVariant) => ({
        key: v.id,
        id: v.id,
        sku: v.sku,
        options: optionsText(v.options),
        price: String(v.price / 100),
        salePrice: v.salePrice ? String(v.salePrice / 100) : '',
        stock: String(v.available),
        threshold: String(v.lowStockThreshold),
        isActive: v.isActive,
      })),
    );
  }, [product]);

  const act = useMutation({
    mutationFn: (a: 'publish' | 'unpublish' | 'archive') => productAction(id!, a),
    onSuccess: () => {
      toast.success('Product updated.');
      qc.invalidateQueries({ queryKey: ['admin-product', id] });
      qc.invalidateQueries({ queryKey: ['admin-products'] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (name.trim().length < 2) return setError('Enter a product name.');
    if (!categoryId) return setError('Choose a category.');
    if (images.some((i) => i.alt.trim().length < 2)) return setError('Describe every image (at least 2 characters).');
    const base = {
      name: name.trim(),
      categoryId,
      shortDescription: shortDescription.trim(),
      description: description.trim(),
      images,
      attributes: attrs.filter((a) => a.label.trim() && a.value.trim()),
      featured,
      bestseller,
      allowBackorder,
      seoTitle: seoTitle.trim(),
      seoDescription: seoDescription.trim(),
    };
    const payloads: { v: VariantDraft; body: Record<string, unknown> }[] = [];
    for (const v of variants) {
      const p = toPayload(v, isNew || !v.id);
      if ('error' in p) return setError(p.error);
      payloads.push({ v, body: p.body });
    }
    if (new Set(payloads.map((p) => String(p.body.sku).toUpperCase())).size !== payloads.length)
      return setError('SKUs must be unique.');
    setSaving(true);
    try {
      if (isNew) {
        const created = await createProduct({ ...base, variants: payloads.map((p) => p.body) });
        toast.success('Product created as a draft.');
        qc.invalidateQueries({ queryKey: ['admin-products'] });
        nav(`/admin/products/${created.id}`, { replace: true });
      } else {
        await updateProduct(id!, base);
        for (const { v, body } of payloads) await (v.id ? updateVariant(id!, v.id, body) : addVariant(id!, body));
        toast.success('Product saved.');
        qc.invalidateQueries({ queryKey: ['admin-product', id] });
        qc.invalidateQueries({ queryKey: ['admin-products'] });
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!isNew && (isLoading || !product)) return <Skeleton className="h-96" />;
  const dis = !canWrite;
  return (
    <form onSubmit={save} className="max-w-5xl space-y-6">
      <Link to="/admin/products" className="text-[12px] uppercase tracking-[0.16em] text-stone hover:text-charcoal">
        ← Products
      </Link>
      <PageHeader
        title={isNew ? 'New product' : product!.name}
        sub={isNew ? 'Saved as a draft. Publish when it is ready.' : undefined}
        actions={
          !isNew &&
          product && (
            <div className="flex flex-wrap items-center gap-3">
              <Badge value={product.status} />
              {canWrite &&
                (product.status === 'published' ? (
                  <button
                    type="button"
                    className="btn-secondary !min-h-[42px] !px-5"
                    onClick={() => act.mutate('unpublish')}
                  >
                    Unpublish
                  </button>
                ) : product.status === 'draft' ? (
                  <button
                    type="button"
                    className="btn-primary !min-h-[42px] !px-5"
                    onClick={() => act.mutate('publish')}
                  >
                    Publish
                  </button>
                ) : null)}
              {canWrite && product.status !== 'archived' && (
                <button
                  type="button"
                  className="text-[12px] uppercase tracking-[0.14em] text-[#8a2f26]"
                  onClick={async () => {
                    if (
                      await confirm({
                        title: 'Archive this product?',
                        description: 'It disappears from the store.',
                        confirmLabel: 'Archive',
                        destructive: true,
                      })
                    )
                      act.mutate('archive');
                  }}
                >
                  Archive
                </button>
              )}
            </div>
          )
        }
      />
      <fieldset disabled={dis} className="space-y-6">
        <Card title="Details">
          <div className="space-y-5">
            <div>
              <label htmlFor="p-name" className="field-label">
                Name
              </label>
              <input
                id="p-name"
                className="field"
                value={name}
                maxLength={140}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="p-cat" className="field-label">
                Category
              </label>
              <select id="p-cat" className="field" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">Choose a category</option>
                {cats
                  ?.filter((c) => c.status === 'active' || c.id === categoryId)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label htmlFor="p-short" className="field-label">
                Short description
              </label>
              <input
                id="p-short"
                className="field"
                value={shortDescription}
                maxLength={300}
                onChange={(e) => setShort(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="p-desc" className="field-label">
                Description
              </label>
              <textarea
                id="p-desc"
                className="field min-h-[160px]"
                value={description}
                maxLength={5000}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-6 text-[14px]">
              {(
                [
                  ['Featured', featured, setFeatured],
                  ['Bestseller (only if it truly is)', bestseller, setBestseller],
                  ['Allow backorders', allowBackorder, setBackorder],
                ] as const
              ).map(([l, v, s]) => (
                <label key={l} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="accent-charcoal"
                    checked={v}
                    onChange={(e) => s(e.target.checked)}
                  />
                  {l}
                </label>
              ))}
            </div>
          </div>
        </Card>
        <Card title="Images">
          <ImageUploader images={images} onChange={setImages} folder="products" />
        </Card>
        <Card
          title="Specifications"
          actions={
            <button
              type="button"
              className="text-[12px] uppercase tracking-[0.14em]"
              onClick={() => setAttrs([...attrs, { label: '', value: '' }])}
            >
              Add row
            </button>
          }
        >
          {attrs.length === 0 ? (
            <p className="text-[14px] text-stone">Material, dimensions, care…</p>
          ) : (
            <ul className="space-y-3">
              {attrs.map((a, i) => (
                <li key={i} className="grid gap-3 sm:grid-cols-[1fr_2fr_auto]">
                  <input
                    aria-label="Label"
                    className="field"
                    placeholder="Material"
                    value={a.label}
                    onChange={(e) => setAttrs(attrs.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))}
                  />
                  <input
                    aria-label="Value"
                    className="field"
                    placeholder="Full-grain leather"
                    value={a.value}
                    onChange={(e) => setAttrs(attrs.map((x, k) => (k === i ? { ...x, value: e.target.value } : x)))}
                  />
                  <button
                    type="button"
                    className="text-[12px] uppercase tracking-[0.14em] text-[#8a2f26]"
                    onClick={() => setAttrs(attrs.filter((_, k) => k !== i))}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card
          title="Variants"
          actions={
            <button
              type="button"
              className="text-[12px] uppercase tracking-[0.14em]"
              onClick={() => setVariants([...variants, blankVariant()])}
            >
              Add variant
            </button>
          }
        >
          <ul className="space-y-4">
            {variants.map((v, i) => (
              <VariantRow
                key={v.key}
                v={v}
                isNew={isNew || !v.id}
                onChange={(n) => setVariants(variants.map((x, k) => (k === i ? n : x)))}
                onRemove={
                  !v.id && variants.length > 1 ? () => setVariants(variants.filter((_, k) => k !== i)) : undefined
                }
              />
            ))}
          </ul>
          {!isNew && product && (
            <div className="mt-6">
              <Table head={['SKU', 'Price', 'Available', 'Reserved']}>
                {product.variants.map((v) => (
                  <tr key={v.id}>
                    <Td>{v.sku}</Td>
                    <Td>
                      {formatPKR(v.salePrice ?? v.price)}
                      {v.salePrice ? <s className="ml-2 text-stone">{formatPKR(v.price)}</s> : null}
                    </Td>
                    <Td>{v.available}</Td>
                    <Td>{v.reserved}</Td>
                  </tr>
                ))}
              </Table>
            </div>
          )}
        </Card>
        <Card title="Search appearance">
          <div className="space-y-5">
            <div>
              <label htmlFor="seo-t" className="field-label">
                Title (max 70)
              </label>
              <input
                id="seo-t"
                className="field"
                maxLength={70}
                value={seoTitle}
                onChange={(e) => setSeoTitle(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="seo-d" className="field-label">
                Description (max 160)
              </label>
              <textarea
                id="seo-d"
                className="field"
                maxLength={160}
                value={seoDescription}
                onChange={(e) => setSeoDescription(e.target.value)}
              />
            </div>
          </div>
        </Card>
      </fieldset>
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      {canWrite && (
        <div className="sticky bottom-0 -mx-4 border-t border-taupe bg-paper/95 p-4 backdrop-blur sm:-mx-8 sm:px-8">
          <button className="btn-primary" disabled={saving}>
            {saving ? 'Saving' : isNew ? 'Create product' : 'Save changes'}
          </button>
        </div>
      )}
    </form>
  );
}
