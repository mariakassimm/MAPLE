import { Link } from 'react-router-dom';
import { ErrorState, Skeleton } from '@/components/ui/States';
import { usePage } from '@/hooks/queries';
import { useSeo } from '@/lib/seo';

/**
 * Editable pages are plain text. A blank line starts a new block; "## Heading" makes a section heading; lines that all start
 * with "- " make a bulleted list. Everything is rendered as text, so no HTML or script can ever be injected.
 */
function Blocks({ body }: { body: string }) {
  return (
    <>
      {body.split(/\n{2,}/).map((raw, i) => {
        const block = raw.trim();
        if (!block) return null;
        if (block.startsWith('## ')) {
          const [head, ...rest] = block.split('\n');
          return (
            <section key={i} className="!mt-12">
              <h2 className="text-[28px] leading-tight text-charcoal sm:text-3xl">{head!.slice(3)}</h2>
              {rest.length > 0 && <p className="mt-4 whitespace-pre-line">{rest.join('\n')}</p>}
            </section>
          );
        }
        const lines = block.split('\n');
        if (lines.every((l) => l.startsWith('- '))) {
          return (
            <ul key={i} className="space-y-2.5 pl-1">
              {lines.map((l, k) => (
                <li key={k} className="flex gap-3">
                  <span aria-hidden className="mt-[0.8em] h-px w-3 shrink-0 bg-bronze" />
                  <span>{l.slice(2)}</span>
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="whitespace-pre-line">
            {block}
          </p>
        );
      })}
    </>
  );
}

export default function ContentPage({ slug }: { slug: string }) {
  const { data: page, isLoading, isError, error, refetch } = usePage(slug);
  useSeo({ title: page?.seoTitle ?? page?.title, description: page?.seoDescription ?? undefined });
  if (isLoading)
    return (
      <div className="page-container max-w-3xl py-20">
        <Skeleton className="h-14 w-2/3" />
        <Skeleton className="mt-8 h-64" />
      </div>
    );
  if (isError || !page) {
    if ((error as { status?: number } | null)?.status === 404)
      return (
        <div className="page-container">
          <div className="mx-auto max-w-md py-24 text-center">
            <h1 className="text-4xl">Coming soon</h1>
            <p className="mt-3 text-[15px] text-stone">This page hasn't been published yet.</p>
            <Link to="/" className="btn-secondary mt-8">
              Back to home
            </Link>
          </div>
        </div>
      );
    return <ErrorState onRetry={() => refetch()} />;
  }
  const updated = page.updatedAt ? new Date(page.updatedAt) : null;
  return (
    <article className="page-container max-w-3xl py-14 sm:py-24">
      <p className="eyebrow">MAPLE</p>
      <h1 className="mt-4 text-5xl sm:text-7xl">{page.title}</h1>
      {updated && !Number.isNaN(updated.getTime()) && (
        <p className="mt-5 text-[12px] uppercase tracking-[0.18em] text-stone">
          Last updated {updated.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      )}
      <span aria-hidden className="mt-8 block h-px w-16 bg-bronze" />
      <div className="mt-10 space-y-6 text-[16px] leading-[1.9] text-stone">
        <Blocks body={page.body} />
      </div>
    </article>
  );
}
