import { connectDb, disconnectDb } from '../src/config/db';
import { Page } from '../src/modules/content/content.model';
import { POLICY_PAGES } from './policy-pages';

// Publishes the four policy pages (shipping, returns, privacy, terms).
// By default a page you have already edited is left alone: only missing pages and untouched "DRAFT:" starter pages are written.
// Use --force to overwrite all four with this text.
async function main() {
  const force = process.argv.includes('--force');
  await connectDb();
  try {
    for (const p of POLICY_PAGES) {
      const existing = await Page.findOne({ slug: p.slug }).select('body').lean<{ body: string } | null>();
      if (existing && !force && !existing.body.startsWith('DRAFT:')) { console.log(`Skipped ${p.slug}: it has been edited (use --force to overwrite).`); continue; }
      await Page.updateOne({ slug: p.slug }, { $set: { title: p.title, body: p.body, seoTitle: p.seoTitle, seoDescription: p.seoDescription, published: true } }, { upsert: true });
      console.log(`${existing ? 'Updated' : 'Created'} ${p.slug}`);
    }
  } finally {
    await disconnectDb();
  }
}

main().catch((err) => { console.error(err instanceof Error ? err.message : err); process.exit(1); });
