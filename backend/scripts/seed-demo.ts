import { connectDb, disconnectDb } from '../src/config/db';
import { Category } from '../src/modules/categories/category.model';
import { createCategory } from '../src/modules/categories/category.service';
import { Page } from '../src/modules/content/content.model';
import { CATALOGUE } from './demo-catalogue';
import { POLICY_PAGES } from './policy-pages';
import { Product } from '../src/modules/products/product.model';
import { createProduct } from '../src/modules/products/product.service';
import { User } from '../src/modules/users/user.model';

// DEVELOPMENT DEMO DATA ONLY. These are invented products, prices and stock levels so the storefront and admin can be tried
// end to end. Imagery is generated illustration (frontend/public/demo, built by `node scripts/generate-demo-art.mjs`), not
// photography: swap in real MAPLE photography from the admin. No ratings, reviews or bestseller flags are created.
// Idempotent: re-running skips products whose SKU already exists. Remove everything with:  npm run seed-demo -- --remove
type Item = [name: string, pricePaisa: number, description: string];
interface Cat { key: string; name: string; legacy: string[]; slug: string; prefix: string; blurb: string; options: string[]; items: Item[] }

const CATS: Cat[] = [
  {
    key: 'handbags', name: 'Handbags', legacy: [], slug: 'handbags', prefix: 'HB', options: [],
    blurb: 'Structured totes, soft shoulder bags and evening pieces in considered leather.',
    items: [],
  },
  {
    key: 'wallets', name: 'Wallets & Small Leather Goods', legacy: ['Wallets'], slug: 'wallets-small-leather-goods', prefix: 'WL', options: [],
    blurb: 'Wallets, card holders and small leather goods, kept slim and finished with care.',
    items: [],
  },
  {
    key: 'jewellery', name: 'Jewellery', legacy: [], slug: 'jewellery', prefix: 'JW', options: [],
    blurb: 'Fine chains, hoops, rings and cuffs in warm metals, made for everyday wear.',
    items: [],
  },
  {
    key: 'watches', name: 'Watches', legacy: [], slug: 'watches', prefix: 'WT', options: [],
    blurb: 'Considered watches with clean dials and comfortable straps.',
    items: [],
  },
  {
    key: 'eyewear', name: 'Eyewear', legacy: [], slug: 'eyewear', prefix: 'EY', options: [],
    blurb: 'Sunglasses and frames in acetate and metal, with UV-protective lenses.',
    items: [],
  },
  {
    key: 'accessories', name: 'Fashion Accessories', legacy: ['Accessories'], slug: 'fashion-accessories', prefix: 'FA', options: [],
    blurb: 'Scarves, belts, hair accessories and the small finishing touches.',
    items: [],
  },
  {
    key: 'gifts', name: 'Curated Gifts', legacy: ['Gifts'], slug: 'curated-gifts', prefix: 'GF', options: [],
    blurb: 'Considered sets and gift-ready pieces, ready to give.',
    items: [],
  },
];

for (const c of CATS) c.items = (CATALOGUE[c.key] ?? []).map(([name, price, description]) => [name, price, description] as Item);

// Real photographs supplied for the homepage collection tiles (frontend/public/brand). The rest use generated illustrations.
const CATEGORY_PHOTOS: Record<string, string> = { handbags: '/brand/cat-handbags.jpg', wallets: '/brand/cat-wallets.jpg', jewellery: '/brand/cat-jewellery.jpg', watches: '/brand/cat-watches.jpg', accessories: '/brand/quiet-edit.jpg' };
const OLD_CATEGORY_NAMES = ['Handbags', 'Wallets', 'Jewellery', 'Watches', 'Eyewear', 'Accessories', 'Gifts'];
const sku = (c: Cat, i: number, option?: string) => `DEMO-${c.prefix}-${String(i + 1).padStart(2, '0')}${option ? `-${option.toUpperCase()}` : ''}`;

const DRAFT = 'DRAFT: this text is a starting point written for development. Replace it with your own wording, and have it reviewed before you launch.';
const PAGES: { slug: string; title: string; body: string; seoTitle?: string; seoDescription?: string }[] = [
  { slug: 'about', title: 'About MAPLE', body: `${DRAFT}\n\nMAPLE is an independent house of considered pieces, made to be lived in. We believe luxury is quiet: the right proportions, honest materials and finishing you notice only when you look closely.\n\nEvery piece is chosen to move easily from one day to the next. Elegance, without effort.` },
  { slug: 'contact', title: 'Contact', body: 'Questions about an order, a piece or a return? Reach us using the details below and we will reply as soon as we can.' },
  ...POLICY_PAGES,
];

async function remove() {
  const del = await Product.deleteMany({ 'variants.sku': /^DEMO-/ });
  const old = await Product.deleteMany({ name: /^Sample / });
  let cats = 0;
  for (const c of await Category.find({ name: { $in: [...CATS.map((x) => x.name), ...OLD_CATEGORY_NAMES] } })) {
    if ((await Product.countDocuments({ categoryId: c._id })) === 0) { await c.deleteOne(); cats++; }
  }
  console.log(`Removed ${del.deletedCount + old.deletedCount} demo products and ${cats} empty categories. Pages were left as they are.`);
}

async function main() {
  await connectDb();
  try {
    if (process.argv.includes('--remove')) return await remove();
    const admin = await User.findOne({ role: 'super_admin' }).select('_id');
    if (!admin) throw new Error('Create a super admin first (npm run create-super-admin).');
    const actorId = String(admin._id);

    // Demo products are rebuilt on every run so names, prices and photographs always match demo-catalogue.ts.
    const oldDel = await Product.deleteMany({ 'variants.sku': /^DEMO-/ });
    if (oldDel.deletedCount) console.log(`Replaced ${oldDel.deletedCount} earlier demo products.`);

    // Categories: reuse (and rename) legacy ones. Written straight to the collection so older documents without a status
    // field become active.
    const ids = new Map<string, string>();
    for (const [i, c] of CATS.entries()) {
      const found = await Category.collection.findOne({ name: { $in: [c.name, ...c.legacy] } });
      const set = { name: c.name, slug: c.slug, description: c.blurb, status: 'active', displayOrder: i, image: { url: CATEGORY_PHOTOS[c.key] ?? `/demo/categories/${c.key}.svg`, alt: `${c.name} at MAPLE` } };
      if (found) {
        const clash = await Category.collection.findOne({ slug: c.slug, _id: { $ne: found._id } });
        if (clash) throw new Error(`Another category already uses the slug "${c.slug}" (${String(clash.name)}). Rename it in the admin, or use a fresh database.`);
        await Category.collection.updateOne({ _id: found._id }, { $set: set });
        ids.set(c.key, String(found._id));
      } else {
        ids.set(c.key, String((await createCategory({ name: c.name, slug: c.slug, description: c.blurb, displayOrder: i, image: set.image }))._id));
      }
    }
    const active = await Category.collection.countDocuments({ name: { $in: CATS.map((c) => c.name) }, status: 'active' });
    console.log(`Categories ready: ${active}/${CATS.length} active.`);

    let made = 0;
    for (const c of CATS) {
      for (const [i, [name, price, description]] of c.items.entries()) {
        const opts = c.options.length ? c.options : [undefined];
        if (await Product.exists({ 'variants.sku': sku(c, i, opts[0]) })) continue;
        const created = await createProduct({
          name, categoryId: ids.get(c.key)!, featured: i % 4 === 0, bestseller: false, allowBackorder: false,
          description,
          images: (CATALOGUE[c.key]?.[i]?.[3] ?? []).map((url, k) => ({ url, alt: k === 0 ? name : `${name}, alternate view` })),
          attributes: [],
          variants: opts.map((o, vi) => ({ sku: sku(c, i, o), price, initialStock: i % 11 === 10 && vi === 0 ? 0 : 6 + ((i * 3 + vi * 5) % 14), options: o ? [{ name: 'Color', value: o }] : [] })),
        } as never, actorId);
        // Published directly so demo data does not depend on the admin publish rules (which want real photographs).
        await Product.updateOne({ _id: created._id }, { $set: { status: 'published', publishedAt: new Date(Date.now() - made * 3_600_000) } });
        made++;
      }
    }
    for (const c of CATS) console.log(`  ${c.name}: ${await Product.countDocuments({ categoryId: ids.get(c.key), status: 'published', 'variants.sku': /^DEMO-/ })} demo products`);

    let pages = 0;
    for (const p of PAGES) {
      const r = await Page.updateOne({ slug: p.slug }, { $setOnInsert: { ...p, published: true } }, { upsert: true });
      if (r.upsertedCount) pages++;
    }
    console.log(`Created ${made} demo products and ${pages} draft pages (existing ones untouched). Remove demo data with: npm run seed-demo -- --remove`);
  } finally {
    await disconnectDb();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  const details = (err as { details?: unknown }).details;
  if (details) console.error(JSON.stringify(details));
  process.exit(1);
});
