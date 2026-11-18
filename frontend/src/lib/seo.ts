import { useEffect } from 'react';
import type { ProductDetail } from '@/types/api';

const SITE = import.meta.env.VITE_SITE_URL ?? '';
const BASE_TITLE = 'MAPLE';

function setMeta(name: string, content: string, attr: 'name' | 'property' = 'name') {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.content = content;
}

export function useSeo(opts: {
  title?: string;
  description?: string;
  image?: string;
  jsonLd?: object | object[];
  noindex?: boolean;
}) {
  const { title, description, image, jsonLd, noindex } = opts;
  const ld = jsonLd ? JSON.stringify(jsonLd) : null;
  useEffect(() => {
    const full = title ? `${title} | ${BASE_TITLE}` : `${BASE_TITLE} | The Art of Everyday Luxury`;
    document.title = full;
    setMeta('og:title', full, 'property');
    setMeta('robots', noindex ? 'noindex, nofollow' : 'index, follow');
    if (description) {
      setMeta('description', description);
      setMeta('og:description', description, 'property');
    }
    if (image) setMeta('og:image', image, 'property');
    setMeta('og:url', `${SITE}${window.location.pathname}`, 'property');
    // Canonical is the path without query strings, so filtered/sorted shop URLs do not compete with each other.
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = `${SITE}${window.location.pathname}`;
    let script: HTMLScriptElement | null = null;
    if (ld) {
      script = document.createElement('script');
      script.type = 'application/ld+json';
      script.text = ld;
      document.head.appendChild(script);
    }
    return () => {
      script?.remove();
    };
  }, [title, description, image, ld, noindex]);
}

export function productJsonLd(p: ProductDetail) {
  const prices = p.variants.map((v) => v.price / 100);
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name,
    description: p.shortDescription ?? p.description.slice(0, 300),
    image: p.images.map((i) => i.url),
    sku: p.variants[0]?.sku,
    offers: prices.length
      ? {
          '@type': 'AggregateOffer',
          priceCurrency: 'PKR',
          lowPrice: Math.min(...prices),
          highPrice: Math.max(...prices),
          availability: p.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        }
      : undefined,
    // A rating is only emitted when real approved reviews exist.
    aggregateRating: p.rating
      ? { '@type': 'AggregateRating', ratingValue: p.rating.average, reviewCount: p.rating.count }
      : undefined,
  };
}

export const breadcrumbJsonLd = (items: { name: string; path: string }[]) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map((it, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name: it.name,
    item: `${SITE}${it.path}`,
  })),
});
