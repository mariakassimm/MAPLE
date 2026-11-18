import { cn } from '@/lib/cn';

/**
 * Quiet tonal artwork shown wherever a real photograph has not been uploaded yet. It is a fine line drawing of a
 * generic product type, never a specific product, so nothing here can be mistaken for real inventory or real
 * photography. Upload images in the admin (products, categories, Content → Homepage) and this disappears.
 */
export type PlaceholderKind =
  'bag' | 'wallet' | 'jewellery' | 'watch' | 'eyewear' | 'scarf' | 'gift' | 'editorial' | 'plain';

const TONES = [
  ['#EAE4D9', '#D8D0C5', '#C4B7A5'],
  ['#E3DCCF', '#D2C8B9', '#BFB19D'],
  ['#EDE8DF', '#DDD5C8', '#CBBFAD'],
] as const;

/** Picks a drawing from a category name or slug; anything unrecognised gets the neutral editorial frame. */
export function kindFor(text?: string | null): PlaceholderKind {
  const t = (text ?? '').toLowerCase();
  if (/wallet|card|purse|leather good/.test(t)) return 'wallet';
  if (/bag|tote|clutch|crossbody|backpack|messenger|satchel/.test(t)) return 'bag';
  if (/jewel|necklace|ring|earring|bracelet/.test(t)) return 'jewellery';
  if (/watch/.test(t)) return 'watch';
  if (/eye|sunglass|glasses|spectacle/.test(t)) return 'eyewear';
  if (/scarf|accessor|shawl|stole/.test(t)) return 'scarf';
  if (/gift/.test(t)) return 'gift';
  return 'editorial';
}

const S = {
  fill: 'none',
  stroke: '#77634D',
  strokeWidth: 1.2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  opacity: 0.6,
} as const;

const ART: Record<PlaceholderKind, React.ReactNode> = {
  bag: (
    <g {...S}>
      <path d="M118 238h164l22 142q2 14-12 14H108q-14 0-12-14z" />
      <path d="M162 238c0-72 76-72 76 0" />
      <path d="M104 282h192" />
      <circle cx="200" cy="282" r="6" />
    </g>
  ),
  wallet: (
    <g {...S}>
      <rect x="104" y="206" width="192" height="128" rx="6" />
      <path d="M104 244h192" />
      <path d="M262 244v30q0 8-8 8h-34q-8 0-8-8v-30" />
      <circle cx="248" cy="262" r="5" />
    </g>
  ),
  jewellery: (
    <g {...S}>
      <path d="M120 176c10 96 50 128 80 128s70-32 80-128" />
      <path d="M200 304v18" />
      <circle cx="200" cy="336" r="14" />
      <circle cx="200" cy="336" r="6" />
    </g>
  ),
  watch: (
    <g {...S}>
      <path d="M168 150l8 46h48l8-46" />
      <path d="M176 304l-8 46h64l-8-46" />
      <circle cx="200" cy="250" r="58" />
      <circle cx="200" cy="250" r="50" />
      <path d="M200 250v-30M200 250l20 12" />
      <path d="M200 200v6M200 294v6M150 250h6M244 250h6" />
    </g>
  ),
  eyewear: (
    <g {...S}>
      <circle cx="148" cy="262" r="42" />
      <circle cx="252" cy="262" r="42" />
      <path d="M190 258q10-10 20 0" />
      <path d="M106 252l-26-14M294 252l26-14" />
    </g>
  ),
  scarf: (
    <g {...S}>
      <path d="M112 186c40-26 136-26 176 0" />
      <path d="M118 192c-14 58 10 100-2 160" />
      <path d="M162 204c-12 64 14 110 2 168" />
      <path d="M282 192c14 58-10 100 2 160" />
      <path d="M238 204c12 64-14 110-2 168" />
      <path d="M108 352h60M232 372h60" />
    </g>
  ),
  gift: (
    <g {...S}>
      <rect x="112" y="244" width="176" height="124" rx="3" />
      <rect x="100" y="212" width="200" height="32" rx="3" />
      <path d="M200 212v156" />
      <path d="M200 212c-20-40-62-34-52-12 8 14 40 12 52 12zM200 212c20-40 62-34 52-12-8 14-40 12-52 12z" />
    </g>
  ),
  plain: null,
  editorial: (
    <g {...S}>
      <rect x="132" y="168" width="136" height="196" />
      <path d="M132 168l136 196M268 168L132 364" opacity="0.35" />
    </g>
  ),
};

export function Placeholder({
  className,
  seed = 0,
  kind = 'editorial',
  mark = true,
}: {
  className?: string;
  seed?: number;
  kind?: PlaceholderKind;
  mark?: boolean;
}) {
  const [a, b, c] = TONES[Math.abs(seed) % TONES.length]!;
  const id = `ph-${Math.abs(seed) % TONES.length}-${kind}`;
  return (
    <div aria-hidden className={cn('relative overflow-hidden', className)} style={{ background: a }}>
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 400 500"
        preserveAspectRatio="xMidYMid slice"
        focusable="false"
      >
        <defs>
          <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={a} />
            <stop offset="1" stopColor={b} />
          </linearGradient>
          <radialGradient id={`${id}-r`} cx="0.3" cy="0.25" r="0.8">
            <stop offset="0" stopColor="#F8F7F3" stopOpacity="0.6" />
            <stop offset="1" stopColor="#F8F7F3" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="400" height="500" fill={`url(#${id}-g)`} />
        <rect width="400" height="500" fill={`url(#${id}-r)`} />
        <ellipse cx="200" cy="448" rx="150" ry="16" fill={c} opacity="0.35" />
        {ART[kind]}
        {mark && (
          <text
            x="200"
            y="440"
            textAnchor="middle"
            fontFamily="'Cormorant Garamond', Georgia, serif"
            fontSize="15"
            letterSpacing="8"
            fill="#77634D"
            opacity="0.5"
          >
            MAPLE
          </text>
        )}
      </svg>
    </div>
  );
}
