import { Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Reveal } from '@/components/ui/Reveal';
import { usePage, useSite } from '@/hooks/queries';
import { useSeo } from '@/lib/seo';

/** Contact details come only from Admin → Settings; nothing is invented. Optional page text comes from Content → Pages (slug: contact). */
export default function ContactPage() {
  const { data: site } = useSite();
  const { data: page } = usePage('contact');
  useSeo({ title: page?.seoTitle ?? 'Contact', description: page?.seoDescription ?? 'Get in touch with MAPLE.' });
  const c = site?.contact ?? {};
  const rows = [
    c.email && { icon: Mail, label: 'Email', value: c.email, href: `mailto:${c.email}` },
    c.phone && { icon: Phone, label: 'Phone', value: c.phone, href: `tel:${c.phone.replace(/\s/g, '')}` },
    c.whatsapp && {
      icon: MessageCircle,
      label: 'WhatsApp',
      value: c.whatsapp,
      href: `https://wa.me/${c.whatsapp.replace(/\D/g, '')}`,
    },
    c.address && { icon: MapPin, label: 'Address', value: c.address, href: null },
  ].filter(Boolean) as { icon: typeof Mail; label: string; value: string; href: string | null }[];
  return (
    <div className="page-container max-w-4xl py-14 sm:py-24">
      <Reveal>
        <p className="eyebrow">We are here to help</p>
        <h1 className="mt-3 text-5xl sm:text-7xl">{page?.title ?? 'Contact'}</h1>
      </Reveal>
      {page?.body && (
        <Reveal delay={0.05}>
          <div className="mt-8 max-w-2xl space-y-5 text-[16px] leading-[1.9] text-stone">
            {page.body.split(/\n{2,}/).map((p, i) => (
              <p key={i} className="whitespace-pre-line">
                {p}
              </p>
            ))}
          </div>
        </Reveal>
      )}
      {rows.length > 0 ? (
        <ul className="mt-12 grid gap-px border border-taupe bg-taupe sm:grid-cols-2">
          {rows.map(({ icon: Icon, label, value, href }) => (
            <li key={label} className="bg-paper p-8">
              <Icon size={20} strokeWidth={1.4} className="text-bronze" />
              <p className="eyebrow mt-4 !text-stone">{label}</p>
              {href ? (
                <a
                  href={href}
                  className="mt-2 block text-[17px] hover:text-bronze"
                  {...(href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                >
                  {value}
                </a>
              ) : (
                <p className="mt-2 text-[17px]">{value}</p>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-12 text-[15px] text-stone">
          Contact details will appear here once they are added in the admin settings.
        </p>
      )}
      <p className="mt-10 text-[14px] text-stone">
        Already ordered?{' '}
        <Link to="/order-tracking" className="link-underline text-charcoal">
          Track your order
        </Link>{' '}
        or{' '}
        <Link to="/returns" className="link-underline text-charcoal">
          request a return
        </Link>
        .
      </p>
    </div>
  );
}
