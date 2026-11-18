import { Link } from 'react-router-dom';
import { Placeholder } from '@/components/ui/Placeholder';
import { Reveal } from '@/components/ui/Reveal';
import { useSeo } from '@/lib/seo';

export default function NotFoundPage() {
  useSeo({ title: 'Page not found', noindex: true });
  return (
    <div className="page-container grid items-center gap-10 py-16 md:grid-cols-2 md:py-28">
      <Reveal className="md:order-2">
        <Placeholder kind="plain" seed={2} className="aspect-[4/3] w-full" />
      </Reveal>
      <Reveal delay={0.08}>
        <p className="eyebrow">404</p>
        <h1 className="mt-4 text-5xl sm:text-7xl">This page has moved on.</h1>
        <p className="mt-5 max-w-md text-[16px] leading-relaxed text-stone">
          The page you are looking for does not exist or is no longer available.
        </p>
        <div className="mt-9 flex flex-wrap gap-3">
          <Link to="/shop" className="btn-primary">
            Explore the collection
          </Link>
          <Link to="/" className="btn-secondary">
            Back to home
          </Link>
        </div>
      </Reveal>
    </div>
  );
}
