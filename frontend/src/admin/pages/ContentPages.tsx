import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  adminCategories,
  adminPages,
  adminSubscribers,
  createPage,
  getContentAdmin,
  patchContent,
  updatePage,
  type AdminPage,
} from '@/admin/api';
import { VideoUploader } from '@/admin/components/VideoUploader';
import { ImageUploader } from '@/admin/components/ImageUploader';
import { Badge, Card, Empty, PageHeader, Pager, Table, Td } from '@/admin/components/ui';
import { Skeleton } from '@/components/ui/States';
import { formatDateTime } from '@/lib/format';
import type { HomeContent, Image, SiteContent } from '@/types/api';

const Field = ({
  id,
  label,
  value,
  onChange,
  max,
  area,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  max?: number;
  area?: boolean;
}) => (
  <div>
    <label htmlFor={id} className="field-label">
      {label}
    </label>
    {area ? (
      <textarea
        id={id}
        className="field min-h-[110px]"
        maxLength={max}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    ) : (
      <input id={id} className="field" maxLength={max} value={value} onChange={(e) => onChange(e.target.value)} />
    )}
  </div>
);

type HomeAdmin = Omit<HomeContent, 'newArrivals' | 'bestsellers' | 'testimonials' | 'collections'> & {
  collections: { categorySlug?: string; title?: string; url?: string }[];
  testimonialsEnabled: boolean;
};

function SiteEditor() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['admin-content', 'site'],
    queryFn: () =>
      getContentAdmin<Omit<SiteContent, 'announcement'> & { announcement: { text: string; isActive: boolean } }>(
        'site',
      ),
  });
  const [s, setS] = useState<typeof data>();
  useEffect(() => {
    if (data) setS(data);
  }, [data]);
  const m = useMutation({
    mutationFn: () => patchContent('site', s),
    onSuccess: () => {
      toast.success('Site details saved.');
      qc.invalidateQueries({ queryKey: ['site'] });
      qc.invalidateQueries({ queryKey: ['admin-content', 'site'] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  if (!s) return <Skeleton className="h-64" />;
  const set = <K extends keyof NonNullable<typeof s>>(k: K, v: NonNullable<typeof s>[K]) => setS({ ...s, [k]: v });
  const c = s.contact ?? {};
  const so = s.social ?? {};
  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate();
      }}
    >
      <Card title="Announcement bar">
        <div className="space-y-4">
          <Field
            id="an"
            label="Text (max 120)"
            max={120}
            value={s.announcement.text}
            onChange={(v) => set('announcement', { ...s.announcement, text: v })}
          />
          <label className="flex items-center gap-2 text-[14px]">
            <input
              type="checkbox"
              className="accent-charcoal"
              checked={s.announcement.isActive}
              onChange={(e) => set('announcement', { ...s.announcement, isActive: e.target.checked })}
            />{' '}
            Show on the store
          </label>
        </div>
      </Card>
      <Card title="Contact">
        <div className="grid gap-4 sm:grid-cols-2">
          {(['email', 'phone', 'whatsapp', 'address'] as const).map((k) => (
            <Field
              key={k}
              id={`c-${k}`}
              label={k[0]!.toUpperCase() + k.slice(1)}
              value={c[k] ?? ''}
              onChange={(v) => set('contact', { ...c, [k]: v })}
            />
          ))}
        </div>
      </Card>
      <Card title="Social links (https only)">
        <div className="grid gap-4 sm:grid-cols-2">
          {(['instagram', 'facebook', 'tiktok', 'youtube', 'pinterest'] as const).map((k) => (
            <Field
              key={k}
              id={`s-${k}`}
              label={k[0]!.toUpperCase() + k.slice(1)}
              value={so[k] ?? ''}
              onChange={(v) => set('social', { ...so, [k]: v })}
            />
          ))}
        </div>
      </Card>
      <Card title="Footer">
        <Field
          id="fs"
          label="Statement (max 200)"
          max={200}
          value={s.footerStatement ?? ''}
          onChange={(v) => set('footerStatement', v)}
        />
      </Card>
      <button className="btn-primary" disabled={m.isPending}>
        Save site details
      </button>
    </form>
  );
}

function HomeEditor() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['admin-content', 'home'], queryFn: () => getContentAdmin<HomeAdmin>('home') });
  const { data: cats } = useQuery({ queryKey: ['admin-categories'], queryFn: adminCategories });
  const [h, setH] = useState<HomeAdmin>();
  useEffect(() => {
    if (data) setH(data);
  }, [data]);
  const m = useMutation({
    mutationFn: () => {
      const { hero, brandStory, editorial, newsletter, collections, testimonialsEnabled } = h!;
      // Collections are saved as category picks; each one takes its name, text and image from the category.
      return patchContent('home', {
        hero,
        brandStory,
        editorial,
        newsletter,
        testimonialsEnabled,
        collections: collections.filter((c) => c.categorySlug).map((c) => ({ categorySlug: c.categorySlug })),
      });
    },
    onSuccess: () => {
      toast.success('Homepage saved.');
      qc.invalidateQueries({ queryKey: ['home'] });
      qc.invalidateQueries({ queryKey: ['admin-content', 'home'] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  if (!h) return <Skeleton className="h-64" />;
  const img = (v: Image | null, set: (i: Image | null) => void, label: string) => (
    <div>
      <p className="field-label">{label}</p>
      <ImageUploader images={v ? [v] : []} onChange={(n) => set(n[n.length - 1] ?? null)} folder="content" max={1} />
    </div>
  );
  const picks = h.collections.map((c) => c.categorySlug ?? '');
  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate();
      }}
    >
      <Card title="Hero">
        <div className="space-y-4">
          <Field
            id="h-l"
            label="Label"
            max={60}
            value={h.hero.label}
            onChange={(v) => setH({ ...h, hero: { ...h.hero, label: v } })}
          />
          <Field
            id="h-h"
            label="Headline"
            max={120}
            value={h.hero.headline}
            onChange={(v) => setH({ ...h, hero: { ...h.hero, headline: v } })}
          />
          <Field
            id="h-s"
            label="Subheadline"
            max={300}
            area
            value={h.hero.subheadline}
            onChange={(v) => setH({ ...h, hero: { ...h.hero, subheadline: v } })}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="h-cl"
              label="Button text"
              max={40}
              value={h.hero.ctaLabel}
              onChange={(v) => setH({ ...h, hero: { ...h.hero, ctaLabel: v } })}
            />
            <Field
              id="h-cu"
              label="Button link (e.g. /shop)"
              max={200}
              value={h.hero.ctaUrl}
              onChange={(v) => setH({ ...h, hero: { ...h.hero, ctaUrl: v } })}
            />
          </div>
          {img(h.hero.image, (i) => setH({ ...h, hero: { ...h.hero, image: i } }), 'Desktop image')}
          {img(
            h.hero.imageMobile,
            (i) => setH({ ...h, hero: { ...h.hero, imageMobile: i } }),
            'Mobile image (optional)',
          )}
          <div className="space-y-4 border-t border-taupe pt-5">
            <div>
              <p className="field-label">Hero video (optional)</p>
              <p className="mb-3 text-[13px] text-stone">
                Upload a short video (8 to 15 seconds works best). It plays silently on a loop behind the headline.
                Leave it empty to use the image.
              </p>
            </div>
            <VideoUploader
              url={h.hero.videoUrl}
              onChange={(u, poster) =>
                setH({
                  ...h,
                  hero: {
                    ...h.hero,
                    videoUrl: u,
                    videoPoster: u ? (h.hero.videoPoster ?? poster ?? null) : h.hero.videoPoster,
                  },
                })
              }
            />
            <Field
              id="h-v"
              label="Or paste a video link (https)"
              max={500}
              value={h.hero.videoUrl ?? ''}
              onChange={(v) => setH({ ...h, hero: { ...h.hero, videoUrl: v.trim() === '' ? null : v.trim() } })}
            />
            {img(
              h.hero.videoPoster,
              (i) => setH({ ...h, hero: { ...h.hero, videoPoster: i } }),
              'Video poster image (shown while the video loads and for visitors who prefer reduced motion)',
            )}
          </div>
        </div>
      </Card>
      <Card
        title="Featured collections"
        actions={
          picks.length < 6 && (
            <button
              type="button"
              className="text-[12px] uppercase tracking-[0.14em]"
              onClick={() => setH({ ...h, collections: [...h.collections, { categorySlug: '' }] })}
            >
              Add
            </button>
          )
        }
      >
        <p className="mb-3 text-[13px] text-stone">
          Choose categories to feature. With none chosen, the first categories are shown automatically.
        </p>
        <ul className="space-y-3">
          {h.collections.map((c, i) => (
            <li key={i} className="flex gap-3">
              <select
                aria-label={`Collection ${i + 1}`}
                className="field"
                value={c.categorySlug ?? ''}
                onChange={(e) =>
                  setH({
                    ...h,
                    collections: h.collections.map((x, k) => (k === i ? { categorySlug: e.target.value } : x)),
                  })
                }
              >
                <option value="">Choose a category</option>
                {cats
                  ?.filter((x) => x.status === 'active')
                  .map((x) => (
                    <option key={x.id} value={x.slug}>
                      {x.name}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                className="text-[12px] uppercase tracking-[0.14em] text-[#8a2f26]"
                onClick={() => setH({ ...h, collections: h.collections.filter((_, k) => k !== i) })}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Brand story">
        <div className="space-y-4">
          <Field
            id="b-h"
            label="Headline"
            max={120}
            value={h.brandStory.headline}
            onChange={(v) => setH({ ...h, brandStory: { ...h.brandStory, headline: v } })}
          />
          <Field
            id="b-b"
            label="Text"
            max={1500}
            area
            value={h.brandStory.body}
            onChange={(v) => setH({ ...h, brandStory: { ...h.brandStory, body: v } })}
          />
          {img(h.brandStory.image, (i) => setH({ ...h, brandStory: { ...h.brandStory, image: i } }), 'Image')}
        </div>
      </Card>
      <Card title="Editorial">
        <div className="space-y-4">
          <Field
            id="e-h"
            label="Headline"
            max={120}
            value={h.editorial.headline}
            onChange={(v) => setH({ ...h, editorial: { ...h.editorial, headline: v } })}
          />
          <Field
            id="e-b"
            label="Text"
            max={1500}
            area
            value={h.editorial.body}
            onChange={(v) => setH({ ...h, editorial: { ...h.editorial, body: v } })}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="e-ll"
              label="Link text"
              max={40}
              value={h.editorial.linkLabel}
              onChange={(v) => setH({ ...h, editorial: { ...h.editorial, linkLabel: v } })}
            />
            <Field
              id="e-lu"
              label="Link (e.g. /shop)"
              max={200}
              value={h.editorial.linkUrl}
              onChange={(v) => setH({ ...h, editorial: { ...h.editorial, linkUrl: v } })}
            />
          </div>
          {img(h.editorial.image, (i) => setH({ ...h, editorial: { ...h.editorial, image: i } }), 'Image')}
        </div>
      </Card>
      <Card title="Newsletter">
        <div className="space-y-4">
          <Field
            id="n-h"
            label="Headline"
            max={120}
            value={h.newsletter.headline}
            onChange={(v) => setH({ ...h, newsletter: { ...h.newsletter, headline: v } })}
          />
          <Field
            id="n-s"
            label="Subheadline"
            max={200}
            value={h.newsletter.subheadline}
            onChange={(v) => setH({ ...h, newsletter: { ...h.newsletter, subheadline: v } })}
          />
        </div>
      </Card>
      <Card title="Customer words">
        <label className="flex items-center gap-2 text-[14px]">
          <input
            type="checkbox"
            className="accent-charcoal"
            checked={h.testimonialsEnabled}
            onChange={(e) => setH({ ...h, testimonialsEnabled: e.target.checked })}
          />{' '}
          Show approved, featured reviews on the homepage (the section stays hidden until there are some)
        </label>
      </Card>
      <button className="btn-primary" disabled={m.isPending}>
        Save homepage
      </button>
    </form>
  );
}

function PagesEditor() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['admin-pages'], queryFn: adminPages });
  const [edit, setEdit] = useState<(Partial<AdminPage> & { isNew?: boolean }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: () => {
      const p = edit!;
      const body = {
        title: p.title?.trim(),
        body: p.body ?? '',
        published: !!p.published,
        ...(p.seoTitle ? { seoTitle: p.seoTitle } : {}),
        ...(p.seoDescription ? { seoDescription: p.seoDescription } : {}),
      };
      return p.isNew ? createPage({ slug: p.slug?.trim().toLowerCase(), ...body }) : updatePage(p.id!, body);
    },
    onSuccess: () => {
      toast.success('Page saved.');
      setEdit(null);
      qc.invalidateQueries({ queryKey: ['admin-pages'] });
      qc.invalidateQueries({ queryKey: ['page'] });
    },
    onError: (e) => setError((e as Error).message),
  });
  return (
    <div className="space-y-6">
      {!edit && (
        <button
          className="btn-secondary"
          onClick={() => {
            setError(null);
            setEdit({ isNew: true, title: '', slug: '', body: '', published: false });
          }}
        >
          New page
        </button>
      )}
      {edit && (
        <form
          className="space-y-4 border border-taupe p-5"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            m.mutate();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="pg-t"
              label="Title"
              max={120}
              value={edit.title ?? ''}
              onChange={(v) => setEdit({ ...edit, title: v })}
            />
            {edit.isNew ? (
              <Field
                id="pg-s"
                label="Address (e.g. shipping-policy)"
                max={80}
                value={edit.slug ?? ''}
                onChange={(v) => setEdit({ ...edit, slug: v })}
              />
            ) : (
              <p className="self-end pb-3 text-[14px] text-stone">/pages/{edit.slug}</p>
            )}
          </div>
          <Field
            id="pg-b"
            label="Text (plain text. Blank line = new paragraph. Start a line with ## for a heading, or with - for a bullet list)"
            area
            max={30000}
            value={edit.body ?? ''}
            onChange={(v) => setEdit({ ...edit, body: v })}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="pg-st"
              label="Search title"
              max={70}
              value={edit.seoTitle ?? ''}
              onChange={(v) => setEdit({ ...edit, seoTitle: v })}
            />
            <Field
              id="pg-sd"
              label="Search description"
              max={160}
              value={edit.seoDescription ?? ''}
              onChange={(v) => setEdit({ ...edit, seoDescription: v })}
            />
          </div>
          <label className="flex items-center gap-2 text-[14px]">
            <input
              type="checkbox"
              className="accent-charcoal"
              checked={!!edit.published}
              onChange={(e) => setEdit({ ...edit, published: e.target.checked })}
            />{' '}
            Published
          </label>
          {error && (
            <p role="alert" className="field-error">
              {error}
            </p>
          )}
          <div className="flex gap-3">
            <button className="btn-primary" disabled={m.isPending}>
              Save page
            </button>
            <button type="button" className="btn-ghost" onClick={() => setEdit(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {isLoading || !data ? (
        <Skeleton className="h-40" />
      ) : data.length === 0 ? (
        <Empty>No pages yet. Suggested: about, contact, shipping-policy, return-policy, privacy-policy, terms.</Empty>
      ) : (
        <Table head={['Title', 'Address', 'Status', '']}>
          {data.map((p) => (
            <tr key={p.id}>
              <Td>{p.title}</Td>
              <Td className="text-stone">/pages/{p.slug}</Td>
              <Td>
                <Badge value={p.published ? 'approved' : 'pending'} label={p.published ? 'Published' : 'Draft'} />
              </Td>
              <Td>
                <button
                  className="text-[12px] uppercase tracking-[0.14em]"
                  onClick={() => {
                    setError(null);
                    setEdit(p);
                  }}
                >
                  Edit
                </button>
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

export function ContentPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'home';
  return (
    <>
      <PageHeader
        title="Content"
        sub="Everything here is plain, validated content. Nothing is invented on your behalf."
      />
      <div role="tablist" aria-label="Content sections" className="mb-8 flex gap-8 border-b border-taupe">
        {[
          ['home', 'Homepage'],
          ['site', 'Site details'],
          ['pages', 'Pages'],
        ].map(([k, l]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setParams({ tab: k! })}
            className={`-mb-px border-b py-3 text-[12px] uppercase tracking-[0.18em] ${tab === k ? 'border-charcoal' : 'border-transparent text-stone'}`}
          >
            {l}
          </button>
        ))}
      </div>
      {tab === 'home' ? <HomeEditor /> : tab === 'site' ? <SiteEditor /> : <PagesEditor />}
    </>
  );
}

export function NewsletterAdminPage() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const { data, isLoading } = useQuery({
    queryKey: ['admin-subscribers', page],
    queryFn: () => adminSubscribers({ page, limit: 50 }),
  });
  return (
    <>
      <PageHeader
        title="Newsletter"
        sub={
          data
            ? `${data.subscribedTotal} confirmed subscribers${data.pendingTotal ? `, ${data.pendingTotal} waiting to confirm` : ''}. Only people who clicked the confirmation link receive newsletters.`
            : undefined
        }
      />
      {isLoading || !data ? (
        <Skeleton className="h-64" />
      ) : data.items.length === 0 ? (
        <Empty>No subscribers yet.</Empty>
      ) : (
        <>
          <Table head={['Email', 'Status', 'Consent given', 'Unsubscribed']}>
            {data.items.map((s) => (
              <tr key={s.email}>
                <Td>{s.email}</Td>
                <Td>
                  <Badge
                    value={s.status === 'subscribed' ? 'approved' : s.status === 'pending' ? 'requested' : 'cancelled'}
                    label={s.status}
                  />
                </Td>
                <Td className="text-stone">{s.consentAt ? formatDateTime(s.consentAt) : '–'}</Td>
                <Td className="text-stone">{s.unsubscribedAt ? formatDateTime(s.unsubscribedAt) : '–'}</Td>
              </tr>
            ))}
          </Table>
          <Pager
            page={data.pagination.page}
            totalPages={data.pagination.totalPages}
            onPage={(p) => setParams({ page: String(p) })}
          />
        </>
      )}
    </>
  );
}
