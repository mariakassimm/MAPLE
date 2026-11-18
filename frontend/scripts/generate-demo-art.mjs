// Generates the DEMO artwork used by `npm run seed-demo` (backend) and the About page.
// These are illustrations, not photographs. Replace them with real MAPLE photography in the admin
// (products, categories, Content → Homepage) and in public/brand/. Run:  node scripts/generate-demo-art.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const COLORS = { black: '#2b2a27', tan: '#b58a5a', cognac: '#8a5a38', olive: '#6c6a49', ivory: '#e9e1d2', burgundy: '#6d2f36', navy: '#2f3a52', sand: '#c4b7a5', blush: '#d9b9ad', sage: '#9aa58b' };
const METALS = { gold: ['#d9bf8a', '#a98445'], silver: ['#e4e4e1', '#a7a8a6'], rose: ['#e4bfae', '#b58470'] };
const BGS = [['#efe9de', '#d9d0c1'], ['#ece4d6', '#cfc3b0'], ['#f1ece3', '#ddd4c6'], ['#e8e0d2', '#c9bca8'], ['#f0e9dd', '#d6cab8']];

const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hex = (a) => `#${a.map((n) => clamp(n).toString(16).padStart(2, '0')).join('')}`;
const mix = (h, t, amt) => hex(rgb(h).map((c, i) => c + (rgb(t)[i] - c) * amt));
const light = (h, a = 0.25) => mix(h, '#ffffff', a);
const dark = (h, a = 0.3) => mix(h, '#000000', a);

let uid = 0;
const id = (p) => `${p}${uid++}`;
const grad = (gid, a, b, x2 = 0, y2 = 1) => `<linearGradient id="${gid}" x1="0" y1="0" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;

function frame(inner, { w = 800, h = 1000, bg = BGS[0], defs = '' } = {}) {
  const g = id('bg');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><defs>${grad(g, bg[0], bg[1], 0.4, 1)}<radialGradient id="${g}l" cx="0.3" cy="0.2" r="0.9"><stop offset="0" stop-color="#fff" stop-opacity="0.65"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient><filter id="${g}s" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="14"/></filter>${defs}</defs><rect width="${w}" height="${h}" fill="url(#${g})"/><rect width="${w}" height="${h}" fill="url(#${g}l)"/>${inner(g)}</svg>`;
}
const shadow = (g, cx, cy, rx, ry) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#3a3226" opacity="0.28" filter="url(#${g}s)"/>`;
const stitch = (d, c) => `<path d="${d}" fill="none" stroke="${light(c, 0.35)}" stroke-width="2" stroke-dasharray="7 7" opacity="0.7"/>`;
const hw = (cx, cy, r = 11, m = 'gold') => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${METALS[m][0]}" stroke="${METALS[m][1]}" stroke-width="2"/><circle cx="${cx - r / 3}" cy="${cy - r / 3}" r="${r / 4}" fill="#fff" opacity="0.7"/>`;

/* ---------- handbags ---------- */
function bag(v, col, g) {
  const c = COLORS[col], d = dark(c, 0.35), l = light(c, 0.28), gd = id('bg');
  const defs = grad(gd, l, c, 0.6, 1);
  let body = '';
  if (v % 4 === 0) body = `<path d="M300 405 C300 215 500 215 500 405" fill="none" stroke="${d}" stroke-width="16" stroke-linecap="round"/><path d="M250 400h300l32 372q2 28-26 28H244q-28 0-26-28z" fill="url(#${gd})" stroke="${d}" stroke-width="3"/><path d="M250 400h300l8 90H242z" fill="#000" opacity="0.06"/>${stitch('M262 424h276', c)}${hw(400, 468, 13)}`;
  if (v % 4 === 1) body = `<path d="M330 440C330 330 470 330 470 440" fill="none" stroke="${d}" stroke-width="14" stroke-linecap="round"/><rect x="220" y="440" width="360" height="290" rx="30" fill="url(#${gd})" stroke="${d}" stroke-width="3"/><path d="M220 470q180 130 360 0v-8q-180 120-360 0z" fill="${d}" opacity="0.5"/><path d="M222 466q178 128 356 0" fill="none" stroke="${d}" stroke-width="3"/>${hw(400, 560, 14)}${stitch('M244 700h312', c)}`;
  if (v % 4 === 2) body = `<path d="M262 468C216 210 584 210 538 468" fill="none" stroke="${d}" stroke-width="13" stroke-linecap="round"/><rect x="240" y="468" width="320" height="240" rx="24" fill="url(#${gd})" stroke="${d}" stroke-width="3"/><path d="M240 520h320" stroke="${d}" stroke-width="3" opacity="0.6"/><rect x="368" y="498" width="64" height="44" rx="6" fill="${METALS.gold[0]}" stroke="${METALS.gold[1]}" stroke-width="2"/>${stitch('M258 686h284', c)}`;
  if (v % 4 === 3) body = `<path d="M290 430 Q262 700 312 770 Q400 812 488 770 Q538 700 510 430z" fill="url(#${gd})" stroke="${d}" stroke-width="3"/><ellipse cx="400" cy="430" rx="110" ry="26" fill="${d}"/><ellipse cx="400" cy="428" rx="104" ry="21" fill="${mix(c, '#000', 0.55)}"/><path d="M300 438q100 44 200 0" fill="none" stroke="${METALS.gold[1]}" stroke-width="4"/>${hw(400, 490, 12)}<path d="M400 490v100" stroke="${d}" stroke-width="6"/>`;
  return `${shadow(g, 400, 812, 190, 22)}<defs>${defs}</defs>${body}<path d="M262 450L300 780" stroke="#fff" stroke-width="30" opacity="0.07" stroke-linecap="round"/>`;
}

/* ---------- wallets ---------- */
function wallet(v, col, g) {
  const c = COLORS[col], d = dark(c, 0.35), gd = id('wg');
  const defs = `<defs>${grad(gd, light(c, 0.25), c, 0.6, 1)}</defs>`;
  const k = v % 4;
  if (k === 0) return `${shadow(g, 400, 690, 230, 20)}${defs}<rect x="230" y="420" width="340" height="250" rx="14" fill="url(#${gd})" stroke="${d}" stroke-width="3"/><path d="M400 420v250" stroke="${d}" stroke-width="3"/><rect x="262" y="452" width="120" height="30" rx="4" fill="#000" opacity="0.1"/>${stitch('M244 436h312v220H244z', c)}${hw(552, 470, 8)}`;
  if (k === 1) return `${shadow(g, 400, 640, 180, 18)}${defs}<rect x="300" y="470" width="200" height="130" rx="10" fill="${COLORS.ivory}" stroke="${d}" stroke-width="2" transform="rotate(-6 400 535)"/><rect x="300" y="470" width="200" height="130" rx="10" fill="${COLORS.sand}" stroke="${d}" stroke-width="2" transform="rotate(4 400 535)"/><path d="M290 510h220l8 130q0 10-10 10H292q-10 0-10-10z" fill="url(#${gd})" stroke="${d}" stroke-width="3"/><path d="M290 510h220" stroke="${d}" stroke-width="3"/>${stitch('M300 530h200', c)}`;
  if (k === 2) return `${shadow(g, 400, 690, 240, 20)}${defs}<rect x="210" y="450" width="380" height="220" rx="40" fill="url(#${gd})" stroke="${d}" stroke-width="3"/><path d="M230 474h340" stroke="${METALS.silver[1]}" stroke-width="5" stroke-dasharray="3 5"/><rect x="430" y="462" width="34" height="26" rx="6" fill="${METALS.gold[0]}" stroke="${METALS.gold[1]}" stroke-width="2"/><path d="M247 470V480" stroke="${d}" stroke-width="8"/>`;
  return `${shadow(g, 400, 680, 200, 20)}${defs}<rect x="262" y="440" width="276" height="230" rx="10" fill="url(#${gd})" stroke="${d}" stroke-width="3"/><path d="M262 520q138 44 276 0" fill="${d}" opacity="0.4"/><path d="M262 520q138 44 276 0" fill="none" stroke="${d}" stroke-width="3"/>${hw(400, 556, 11)}${stitch('M276 650h248', c)}`;
}

/* ---------- jewellery ---------- */
function jewel(v, metal, g) {
  const [m1, m2] = METALS[metal];
  const gem = ['#9b2d3c', '#2d6a8f', '#3f8f6b', '#e9e1d2'][v % 4];
  const k = v % 4;
  const mg = id('mg');
  const defs = `<defs>${grad(mg, m1, m2, 1, 1)}</defs>`;
  const stroke = `stroke="url(#${mg})"`;
  if (k === 0) return `${shadow(g, 400, 780, 150, 14)}${defs}<path d="M210 250C220 560 330 640 400 640s180-80 190-390" fill="none" ${stroke} stroke-width="5" stroke-linecap="round"/><path d="M400 640l-38 46 38 60 38-60z" fill="url(#${mg})" stroke="${m2}" stroke-width="2"/><path d="M400 650l-22 34 22 34 22-34z" fill="${gem}" opacity="0.9"/><path d="M386 676l14-14" stroke="#fff" stroke-width="3" opacity="0.6"/>`;
  if (k === 1) return `${shadow(g, 400, 760, 200, 14)}${defs}${[290, 510].map((x) => `<circle cx="${x}" cy="560" r="86" fill="none" ${stroke} stroke-width="16"/><circle cx="${x}" cy="560" r="86" fill="none" stroke="#fff" stroke-width="3" opacity="0.4" stroke-dasharray="40 300"/>`).join('')}<path d="M290 474v-60M510 474v-60" stroke="${m2}" stroke-width="5"/>`;
  if (k === 2) return `${shadow(g, 400, 760, 170, 16)}${defs}<ellipse cx="400" cy="640" rx="130" ry="130" fill="none" ${stroke} stroke-width="34"/><ellipse cx="400" cy="640" rx="130" ry="130" fill="none" stroke="#fff" stroke-width="4" opacity="0.35" stroke-dasharray="90 700"/><path d="M340 520l60-52 60 52-60 52z" fill="url(#${mg})" stroke="${m2}" stroke-width="3"/><path d="M366 520l34-30 34 30-34 30z" fill="${gem}"/><path d="M384 508l14-12" stroke="#fff" stroke-width="3" opacity="0.7"/>`;
  return `${shadow(g, 400, 760, 220, 14)}${defs}<ellipse cx="400" cy="590" rx="190" ry="170" fill="none" ${stroke} stroke-width="14"/><ellipse cx="400" cy="590" rx="190" ry="170" fill="none" stroke="#fff" stroke-width="3" opacity="0.35" stroke-dasharray="120 900"/>${Array.from({ length: 7 }, (_, i) => `<circle cx="${400 + 190 * Math.cos(Math.PI * (0.18 + i * 0.11))}" cy="${590 + 170 * Math.sin(Math.PI * (0.18 + i * 0.11))}" r="9" fill="${gem}" stroke="${m2}" stroke-width="2"/>`).join('')}`;
}

/* ---------- watches ---------- */
function watch(v, metal, g) {
  const [m1, m2] = METALS[metal];
  const dial = ['#f3eee4', '#2b2a27', '#e4d9c6', '#33405a'][v % 4];
  const ink = ['#2b2a27', '#e9e1d2', '#6d5a3f', '#e9e1d2'][v % 4];
  const strap = ['black', 'tan', 'cognac', 'navy'][(v + 1) % 4];
  const sc = COLORS[strap];
  const mg = id('wm');
  const sq = v % 4 === 3;
  const ticks = Array.from({ length: 12 }, (_, i) => { const a = (i * Math.PI) / 6; const r1 = 98, r2 = i % 3 === 0 ? 80 : 90; return `<path d="M${400 + r1 * Math.sin(a)} ${510 - r1 * Math.cos(a)}L${400 + r2 * Math.sin(a)} ${510 - r2 * Math.cos(a)}" stroke="${ink}" stroke-width="${i % 3 === 0 ? 4 : 2}"/>`; }).join('');
  const hands = `<path d="M400 510V440" stroke="${ink}" stroke-width="6" stroke-linecap="round"/><path d="M400 510L452 534" stroke="${ink}" stroke-width="4" stroke-linecap="round"/><circle cx="400" cy="510" r="7" fill="${m1}"/>`;
  const extra = v % 4 === 2 ? `<circle cx="360" cy="520" r="22" fill="none" stroke="${ink}" stroke-width="1.5" opacity="0.6"/><circle cx="440" cy="520" r="22" fill="none" stroke="${ink}" stroke-width="1.5" opacity="0.6"/>` : '';
  const caseShape = sq ? `<rect x="282" y="392" width="236" height="236" rx="34" fill="url(#${mg})" stroke="${m2}" stroke-width="3"/><rect x="298" y="408" width="204" height="204" rx="24" fill="${dial}"/>` : `<circle cx="400" cy="510" r="128" fill="url(#${mg})" stroke="${m2}" stroke-width="3"/><circle cx="400" cy="510" r="112" fill="${dial}"/>`;
  return `${shadow(g, 400, 900, 130, 16)}<defs>${grad(mg, m1, m2, 1, 1)}</defs><path d="M332 130h136l12 262H320z" fill="${sc}" stroke="${dark(sc, 0.3)}" stroke-width="3"/><path d="M320 628h160l-12 262H332z" fill="${sc}" stroke="${dark(sc, 0.3)}" stroke-width="3"/>${stitch('M344 150v220M456 150v220M344 650v220M456 650v220', sc)}<rect x="478" y="496" width="22" height="30" rx="5" fill="${m1}" stroke="${m2}" stroke-width="2"/>${caseShape}${ticks}${extra}${hands}<path d="M300 440q80-70 200-30" fill="none" stroke="#fff" stroke-width="10" opacity="0.14" stroke-linecap="round"/>`;
}

/* ---------- eyewear ---------- */
function eyewear(v, col, g) {
  const f = COLORS[col];
  const tint = ['#5b4a33', '#2a3b47', '#3d2f2f', '#4a4a3a'][v % 4];
  const k = v % 4;
  const lens = (shape) => `${shape.replace('/>', ` fill="${tint}" fill-opacity="0.55" stroke="${f}" stroke-width="14"/>`)}`;
  const flare = (x, y) => `<path d="M${x} ${y}l40-34" stroke="#fff" stroke-width="7" opacity="0.4" stroke-linecap="round"/>`;
  let shapes = '';
  if (k === 0) shapes = `${lens('<circle cx="282" cy="520" r="96"/>')}${lens('<circle cx="518" cy="520" r="96"/>')}`;
  if (k === 1) shapes = `${lens('<path d="M186 470q96-30 190 0q4 120-88 150q-80-10-102-150z"/>')}${lens('<path d="M424 470q96-30 190 0q-22 140-102 150q-92-30-88-150z"/>')}`;
  if (k === 2) shapes = `${lens('<path d="M180 500q10-50 100-50q110 0 100 90q-10 80-100 80q-84 0-100-120z"/>')}${lens('<path d="M420 540q-10-90 100-90q90 0 100 50q-16 120-100 120q-90 0-100-80z"/>')}`;
  if (k === 3) shapes = `${lens('<rect x="186" y="446" width="196" height="160" rx="34"/>')}${lens('<rect x="418" y="446" width="196" height="160" rx="34"/>')}`;
  return `${shadow(g, 400, 700, 270, 16)}${shapes}<path d="M380 506q20-20 40 0" fill="none" stroke="${f}" stroke-width="12" stroke-linecap="round"/><path d="M186 500L120 470M614 500L680 470" stroke="${f}" stroke-width="12" stroke-linecap="round"/>${flare(240, 490)}${flare(476, 490)}${hw(186, 500, 6)}${hw(614, 500, 6)}`;
}

/* ---------- accessories ---------- */
function accessory(v, col, g) {
  const c = COLORS[col], d = dark(c, 0.3), l = light(c, 0.3), k = v % 4;
  const ag = id('ac');
  const defs = `<defs>${grad(ag, l, c, 1, 1)}</defs>`;
  if (k === 0) return `${shadow(g, 400, 780, 230, 16)}${defs}<path d="M200 260q200-60 400 0l30 480q-230 40-460 0z" fill="url(#${ag})" stroke="${d}" stroke-width="3"/>${Array.from({ length: 5 }, (_, r) => Array.from({ length: 5 }, (_, q) => `<circle cx="${250 + q * 74 + (r % 2) * 20}" cy="${330 + r * 80}" r="10" fill="${light(c, 0.7)}" opacity="0.5"/>`).join('')).join('')}<path d="M200 260q200-60 400 0" fill="none" stroke="#fff" stroke-width="5" opacity="0.35"/>`;
  if (k === 1) return `${shadow(g, 400, 760, 230, 18)}${defs}<ellipse cx="400" cy="540" rx="210" ry="210" fill="none" stroke="url(#${ag})" stroke-width="44"/><ellipse cx="400" cy="540" rx="210" ry="210" fill="none" stroke="${d}" stroke-width="3"/><ellipse cx="400" cy="540" rx="210" ry="210" fill="none" stroke="${light(c, 0.4)}" stroke-width="2" stroke-dasharray="8 8"/><rect x="360" y="296" width="82" height="62" rx="10" fill="none" stroke="${METALS.gold[1]}" stroke-width="9"/><path d="M401 308v38" stroke="${METALS.gold[1]}" stroke-width="7"/>`;
  if (k === 2) return `${shadow(g, 400, 700, 240, 20)}${defs}<ellipse cx="400" cy="560" rx="250" ry="120" fill="url(#${ag})" stroke="${d}" stroke-width="3"/><ellipse cx="400" cy="520" rx="226" ry="96" fill="${light(c, 0.1)}" opacity="0.7"/><path d="M400 440q-6-26 6-44" stroke="${d}" stroke-width="10" stroke-linecap="round"/>`;
  return `${shadow(g, 400, 640, 140, 14)}${defs}<path d="M250 470q150-60 300 0v60q-150 50-300 0z" fill="url(#${ag})" stroke="${d}" stroke-width="3"/><path d="M262 490q138-40 276 0" stroke="#fff" stroke-width="5" opacity="0.4" fill="none"/>${hw(400, 500, 14)}<path d="M360 560q40 40 80 0" fill="none" stroke="${d}" stroke-width="4" opacity="0.6"/>`;
}

/* ---------- gifts ---------- */
function gift(v, col, g) {
  const c = COLORS[col], d = dark(c, 0.3), rib = ['#d9bf8a', '#e9e1d2', '#c4b7a5', '#b58a5a'][v % 4], rd = dark(rib, 0.25), k = v % 3;
  const bow = (x, y) => `<path d="M${x} ${y}c-40-70-120-60-100-18 12 24 70 22 100 18zM${x} ${y}c40-70 120-60 100-18-12 24-70 22-100 18z" fill="${rib}" stroke="${rd}" stroke-width="3"/><circle cx="${x}" cy="${y}" r="16" fill="${rd}"/>`;
  if (k === 0) return `${shadow(g, 400, 780, 250, 18)}<rect x="230" y="470" width="340" height="300" rx="6" fill="${c}" stroke="${d}" stroke-width="3"/><rect x="214" y="420" width="372" height="64" rx="6" fill="${light(c, 0.1)}" stroke="${d}" stroke-width="3"/><rect x="376" y="420" width="48" height="350" fill="${rib}" opacity="0.95"/>${bow(400, 410)}`;
  if (k === 1) return `${shadow(g, 400, 800, 190, 18)}<rect x="270" y="320" width="260" height="470" rx="6" fill="${c}" stroke="${d}" stroke-width="3"/><rect x="254" y="290" width="292" height="60" rx="6" fill="${light(c, 0.1)}" stroke="${d}" stroke-width="3"/><rect x="376" y="290" width="48" height="500" fill="${rib}" opacity="0.95"/>${bow(400, 280)}`;
  return `${shadow(g, 400, 760, 250, 20)}<ellipse cx="400" cy="640" rx="230" ry="60" fill="${dark(c, 0.25)}"/><rect x="170" y="500" width="460" height="140" fill="${c}"/><ellipse cx="400" cy="500" rx="230" ry="58" fill="${light(c, 0.12)}" stroke="${d}" stroke-width="3"/><ellipse cx="400" cy="640" rx="230" ry="60" fill="none" stroke="${d}" stroke-width="3"/><path d="M170 500v140M630 500v140" stroke="${d}" stroke-width="3"/><path d="M400 440v-32" stroke="${rd}" stroke-width="8" stroke-linecap="round"/>${bow(400, 410)}`;
}

const DRAW = { handbags: bag, wallets: wallet, jewellery: jewel, watches: watch, eyewear, accessories: accessory, gifts: gift };
const PALETTES = {
  handbags: [['black', 'tan'], ['cognac', 'ivory'], ['burgundy', 'black'], ['tan', 'olive'], ['navy', 'sand'], ['ivory', 'cognac'], ['olive', 'black'], ['blush', 'burgundy'], ['sand', 'navy'], ['black', 'burgundy'], ['cognac', 'black'], ['sage', 'tan']],
  wallets: [['black', 'tan'], ['cognac', 'black'], ['burgundy', 'ivory'], ['navy', 'tan'], ['olive', 'sand'], ['tan', 'black'], ['ivory', 'cognac'], ['black', 'navy'], ['blush', 'cognac'], ['sage', 'black'], ['cognac', 'navy'], ['burgundy', 'tan']],
  jewellery: [['gold', 'silver'], ['gold', 'rose'], ['silver', 'gold'], ['rose', 'gold'], ['gold', 'silver'], ['silver', 'rose'], ['gold', 'rose'], ['rose', 'silver'], ['gold', 'silver'], ['silver', 'gold'], ['rose', 'gold'], ['gold', 'rose']],
  watches: [['gold', 'silver'], ['rose', 'gold'], ['silver', 'gold'], ['silver', 'rose'], ['gold', 'rose'], ['rose', 'silver'], ['gold', 'silver'], ['silver', 'gold'], ['rose', 'gold'], ['silver', 'rose'], ['gold', 'silver'], ['rose', 'gold']],
  eyewear: [['black', 'tan'], ['cognac', 'black'], ['tan', 'navy'], ['burgundy', 'black'], ['olive', 'tan'], ['navy', 'cognac'], ['black', 'burgundy'], ['sand', 'black'], ['cognac', 'tan'], ['ivory', 'black'], ['sage', 'tan'], ['black', 'navy']],
  accessories: [['burgundy', 'navy'], ['cognac', 'black'], ['olive', 'sand'], ['blush', 'sage'], ['navy', 'ivory'], ['tan', 'black'], ['sage', 'blush'], ['black', 'cognac'], ['sand', 'burgundy'], ['ivory', 'navy'], ['olive', 'tan'], ['blush', 'cognac']],
  gifts: [['ivory', 'sand'], ['burgundy', 'ivory'], ['navy', 'sand'], ['sage', 'ivory'], ['blush', 'sand'], ['olive', 'ivory'], ['black', 'sand'], ['sand', 'burgundy'], ['ivory', 'navy'], ['cognac', 'ivory'], ['sage', 'blush'], ['burgundy', 'sand']],
};

const write = (rel, svg) => { const p = join(ROOT, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, svg); };

// ---- products: two images each (primary and alternate colourway) ----
for (const [cat, draw] of Object.entries(DRAW)) {
  PALETTES[cat].forEach(([a, b], i) => {
    const n = String(i + 1).padStart(2, '0');
    write(`demo/products/${cat}-${n}-a.svg`, frame((g) => draw(i, a, g), { bg: BGS[i % BGS.length] }));
    write(`demo/products/${cat}-${n}-b.svg`, frame((g) => draw(i, b, g), { bg: BGS[(i + 2) % BGS.length] }));
  });
}

// ---- category tiles ----
for (const [cat, draw] of Object.entries(DRAW)) {
  const [a] = PALETTES[cat][0];
  write(`demo/categories/${cat}.svg`, frame((g) => draw(0, a, g), { bg: BGS[Object.keys(DRAW).indexOf(cat) % BGS.length] }));
}

// ---- editorial scenes (hero, story, campaign, about) ----
const arch = (x, y, w, h, fill, op = 1) => `<path d="M${x} ${y + h}V${y + w / 2}a${w / 2} ${w / 2} 0 0 1 ${w} 0V${y + h}z" fill="${fill}" opacity="${op}"/>`;
const plinth = (x, y, w, h, c) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/><rect x="${x}" y="${y}" width="${w}" height="14" fill="${light(c, 0.35)}"/><rect x="${x}" y="${y + 14}" width="${w}" height="${h - 14}" fill="#000" opacity="0.05"/>`;
const rays = (w, h) => `<path d="M0 0L${w * 0.55} 0L${w * 0.2} ${h}L0 ${h}z" fill="#fff" opacity="0.18"/><path d="M${w * 0.35} 0L${w * 0.7} 0L${w * 0.45} ${h}L${w * 0.15} ${h}z" fill="#fff" opacity="0.1"/>`;
const place = (draw, i, col, tx, ty, s) => (g) => `<g transform="translate(${tx} ${ty}) scale(${s})">${draw(i, col, g)}</g>`;

function scene(w, h, bg, items, { archX = 0.62 } = {}) {
  return frame((g) => `${arch(w * archX - w * 0.2, h * 0.08, w * 0.4, h * 0.8, light(bg[1], 0.25), 0.9)}${rays(w, h)}<rect y="${h * 0.86}" width="${w}" height="${h * 0.14}" fill="${dark(bg[1], 0.08)}"/>${items.map((f) => f(g)).join('')}`, { w, h, bg });
}
write('brand/hero.svg', scene(1600, 900, ['#efe8db', '#d3c7b4'], [place(bag, 0, 'cognac', 780, 70, 0.9), place(jewel, 0, 'gold', 1010, 130, 0.5), place(watch, 0, 'gold', 520, 220, 0.42)]));
write('brand/story.svg', scene(800, 1000, ['#efe9de', '#d1c5b2'], [(g) => plinth(250, 640, 300, 200, '#cdbfa8'), place(bag, 3, 'tan', 0, -150, 1), place(jewel, 0, 'gold', 150, -40, 0.55)]));
write('brand/editorial.svg', scene(1200, 900, ['#ece4d6', '#cbbea9'], [place(eyewear, 1, 'black', 280, 60, 0.85), place(accessory, 0, 'burgundy', 560, 40, 0.6), place(wallet, 0, 'cognac', 120, 200, 0.6)], { archX: 0.4 }));
write('brand/about-hero.svg', scene(1600, 1000, ['#ece3d4', '#c9bba5'], [place(bag, 1, 'ivory', 640, 110, 0.95), place(watch, 2, 'rose', 1010, 180, 0.4), place(eyewear, 0, 'tan', 220, 280, 0.7)], { archX: 0.55 }));
write('brand/about-1.svg', scene(800, 1000, ['#f0eadf', '#d6cab8'], [(g) => plinth(230, 700, 340, 150, '#d3c6b0'), place(wallet, 0, 'cognac', 0, 20, 1), place(jewel, 2, 'gold', 120, 80, 0.5)]));
write('brand/about-2.svg', scene(800, 1000, ['#e8dfcf', '#c8baa3'], [place(watch, 1, 'gold', 0, 40, 0.95), (g) => plinth(180, 810, 440, 80, '#c2b39b')], { archX: 0.5 }));
write('brand/about-3.svg', scene(1200, 800, ['#efe7da', '#d4c8b4'], [place(accessory, 0, 'sage', 0, 20, 0.75), place(gift, 0, 'ivory', 520, 90, 0.7)], { archX: 0.7 }));
console.log('Demo artwork written to', ROOT);
