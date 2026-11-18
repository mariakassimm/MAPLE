import { connectDb, disconnectDb } from '../src/config/db';
import { Product } from '../src/modules/products/product.model';

// One-off tidy-up for databases seeded before the seed script stopped adding a development note to every demo product.
// It ONLY edits the `description` of products whose SKU starts with DEMO- and that still end with that exact note, by
// removing the note. Nothing else is touched (no images, prices, stock, status or any product you created yourself).
// Safe to run more than once. Preview first with:  npm run clean-demo-content -- --dry-run
const NOTE = /\n*\s*Demo product for development: replace this text and imagery with your own\.\s*$/;

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  await connectDb();
  try {
    const products = await Product.find({ 'variants.sku': /^DEMO-/, description: NOTE }).select('name description').lean<{ _id: unknown; name: string; description: string }[]>();
    for (const p of products) {
      if (!dryRun) await Product.updateOne({ _id: p._id }, { $set: { description: p.description.replace(NOTE, '') } });
    }
    console.log(`${dryRun ? 'Would clean' : 'Cleaned'} ${products.length} product description(s).`);
  } finally {
    await disconnectDb();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
