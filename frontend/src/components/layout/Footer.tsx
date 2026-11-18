import { ArrowUp, Facebook, Instagram, Mail, MapPin, Phone } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Wordmark } from '@/components/layout/Header';
import { NewsletterForm } from '@/components/home/NewsletterForm';
import { useSite } from '@/hooks/queries';

const cols = [
  {
    title: 'Shop',
    links: [
      { to: '/shop', label: 'All pieces' },
      { to: '/new-arrivals', label: 'New arrivals' },
      { to: '/order-tracking', label: 'Track an order' },
    ],
  },
  {
    title: 'Care',
    links: [
      { to: '/pages/shipping-policy', label: 'Shipping' },
      { to: '/pages/return-policy', label: 'Returns' },
      { to: '/returns', label: 'Request a return' },
      { to: '/contact', label: 'Contact' },
    ],
  },
  {
    title: 'MAPLE',
    links: [
      { to: '/about', label: 'Our story' },
      { to: '/pages/privacy-policy', label: 'Privacy' },
      { to: '/pages/terms', label: 'Terms' },
    ],
  },
];

const PAYMENTS = ['Cash on delivery', 'JazzCash', 'Easypaisa'];
const iconLink =
  'grid h-11 w-11 place-items-center rounded-full border border-ivory/15 text-ivory/80 transition-colors duration-300 hover:border-[#B69A70] hover:text-[#D9BE8E] focus-visible:border-[#B69A70]';

export function Footer() {
  const { data: site } = useSite();
  const social = site?.social ?? {};
  const contact = site?.contact ?? {};
  const toTop = () =>
    window.scrollTo({
      top: 0,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  return (
    <footer className="on-dark relative mt-24 overflow-hidden bg-gradient-to-b from-[#1F1D1A] to-[#171715] text-ivory">
      <div aria-hidden className="h-px bg-gradient-to-r from-transparent via-[#B69A70]/70 to-transparent" />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-[#B69A70]/[0.07] blur-[110px]"
      />

      {/* Invitation */}
      <div className="page-container relative grid gap-8 py-12 sm:py-16 lg:grid-cols-[1fr_minmax(0,28rem)] lg:items-center lg:gap-16">
        <div>
          <p className="text-[11px] uppercase tracking-eyebrow text-[#B69A70]">The MAPLE list</p>
          <h2 className="mt-3 font-display text-[34px] leading-[1.1] sm:text-5xl">
            New pieces, <span className="italic text-[#D9BE8E]">rarely</span> and thoughtfully.
          </h2>
        </div>
        <NewsletterForm tone="dark" />
      </div>

      <div className="border-t border-ivory/10">
        <div className="page-container grid grid-cols-2 gap-x-6 gap-y-10 py-12 sm:py-14 md:grid-cols-3 lg:grid-cols-[1.5fr_repeat(3,1fr)] lg:gap-x-10">
          {/* Brand */}
          <div className="col-span-2 md:col-span-3 lg:col-span-1">
            <Wordmark className="text-ivory" />
            <p className="mt-5 max-w-sm text-[14px] leading-relaxed text-sand">
              {site?.footerStatement || 'The Art of Everyday Luxury.'}
            </p>
            {(contact.email || contact.phone || contact.address) && (
              <address className="mt-6 space-y-3 text-[13.5px] not-italic text-sand">
                {contact.email && (
                  <p className="flex items-start gap-3">
                    <Mail size={16} strokeWidth={1.4} className="mt-0.5 shrink-0 text-[#B69A70]" aria-hidden />
                    <a href={`mailto:${contact.email}`} className="break-all hover:text-ivory">
                      {contact.email}
                    </a>
                  </p>
                )}
                {contact.phone && (
                  <p className="flex items-start gap-3">
                    <Phone size={16} strokeWidth={1.4} className="mt-0.5 shrink-0 text-[#B69A70]" aria-hidden />
                    <a href={`tel:${contact.phone.replace(/\s/g, '')}`} className="hover:text-ivory">
                      {contact.phone}
                    </a>
                  </p>
                )}
                {contact.address && (
                  <p className="flex items-start gap-3">
                    <MapPin size={16} strokeWidth={1.4} className="mt-0.5 shrink-0 text-[#B69A70]" aria-hidden />
                    <span>{contact.address}</span>
                  </p>
                )}
              </address>
            )}
            {(social.instagram || social.facebook) && (
              <div className="mt-6 flex gap-3">
                {social.instagram && (
                  <a
                    href={social.instagram}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Instagram"
                    className={iconLink}
                  >
                    <Instagram size={18} strokeWidth={1.4} />
                  </a>
                )}
                {social.facebook && (
                  <a
                    href={social.facebook}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Facebook"
                    className={iconLink}
                  >
                    <Facebook size={18} strokeWidth={1.4} />
                  </a>
                )}
              </div>
            )}
          </div>

          {cols.map((c) => (
            <nav
              key={c.title}
              aria-label={c.title}
              className={c.title === 'MAPLE' ? 'col-span-2 md:col-span-1' : undefined}
            >
              <h2 className="font-sans text-[11px] uppercase tracking-eyebrow text-[#B69A70]">{c.title}</h2>
              <ul className="mt-4 space-y-1 sm:mt-5">
                {c.links.map((l) => (
                  <li key={l.to}>
                    <Link
                      to={l.to}
                      className="group inline-flex min-h-[40px] items-center text-[14.5px] text-ivory/90 transition-colors duration-300 hover:text-[#D9BE8E]"
                    >
                      <span className="relative after:absolute after:-bottom-0.5 after:left-0 after:h-px after:w-full after:origin-left after:scale-x-0 after:bg-[#B69A70] after:transition-transform after:duration-500 group-hover:after:scale-x-100">
                        {l.label}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </div>

      <div className="border-t border-ivory/10">
        <div className="page-container flex flex-col gap-5 py-6 text-[12px] text-sand md:flex-row md:items-center md:justify-between">
          <p className="order-2 md:order-1">© {new Date().getFullYear()} MAPLE. All rights reserved.</p>
          <ul className="order-1 flex flex-wrap items-center gap-2 md:order-2" aria-label="Payment methods">
            {PAYMENTS.map((p) => (
              <li
                key={p}
                className="rounded-full border border-ivory/15 px-3 py-1.5 text-[11px] tracking-wide text-ivory/80"
              >
                {p}
              </li>
            ))}
            <li className="px-1 text-[11px]">Delivered across Pakistan</li>
          </ul>
          <button
            type="button"
            onClick={toTop}
            aria-label="Back to top"
            className="order-3 inline-flex min-h-[44px] items-center gap-2 self-start text-[11px] uppercase tracking-[0.18em] text-ivory/80 transition-colors hover:text-[#D9BE8E] md:self-auto"
          >
            Back to top <ArrowUp size={14} strokeWidth={1.5} aria-hidden />
          </button>
        </div>
      </div>
    </footer>
  );
}
