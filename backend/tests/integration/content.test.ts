import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { adminClient, makeCategory, makeProduct, placeDeliveredOrder, seedStore, IMAGE, type AdminClient } from '../factories';
import { clearDb, createUser, loginAs, startTestDb, stopTestDb } from '../helpers';

const app = createApp();
const get = (path: string) => request(app).get(`/api/v1${path}`);

describe('editable content', () => {
  let admin: AdminClient;

  beforeAll(startTestDb);
  afterAll(stopTestDb);
  beforeEach(async () => {
    await clearDb();
    admin = await adminClient(app);
  });

  describe('site settings', () => {
    it('starts with the brand announcement and no invented contact or social details', async () => {
      const { site } = (await get('/content/site')).body.data;
      expect(site.announcement).toBe('DISCOVER THE ART OF EVERYDAY LUXURY');
      expect(site.contact).toEqual({});
      expect(site.social).toEqual({});
    });

    it('can change or switch off the announcement and set contact and social links', async () => {
      const res = await admin.patch('/admin/content/site', {
        announcement: { text: 'FREE DELIVERY OVER RS 10,000', isActive: true },
        contact: { email: 'hello@maple.pk', phone: '+92 300 1234567' },
        social: { instagram: 'https://instagram.com/maple' },
      });
      expect(res.status).toBe(200);
      const site = (await get('/content/site')).body.data.site;
      expect(site).toMatchObject({ announcement: 'FREE DELIVERY OVER RS 10,000', contact: { email: 'hello@maple.pk' }, social: { instagram: 'https://instagram.com/maple' } });
      await admin.patch('/admin/content/site', { announcement: { text: 'x', isActive: false } });
      expect((await get('/content/site')).body.data.site.announcement).toBeNull();
    });

    it('rejects insecure links and unknown fields', async () => {
      expect((await admin.patch('/admin/content/site', { social: { instagram: 'http://instagram.com/maple' } })).status).toBe(400);
      expect((await admin.patch('/admin/content/site', { social: { myspace: 'https://x.test' } })).status).toBe(400);
      expect((await admin.patch('/admin/content/site', {})).status).toBe(400);
      expect((await admin.patch('/admin/content/other', { footerStatement: 'x' })).status).toBe(400);
    });
  });

  describe('homepage', () => {
    it('serves the brand copy and honest empty sections on a brand-new store', async () => {
      const home = (await get('/content/home')).body.data;
      expect(home.hero).toMatchObject({ label: 'THE MAPLE COLLECTION', headline: 'Elegance, Without Effort.', ctaLabel: 'EXPLORE COLLECTION', image: null });
      expect(home.brandStory.headline).toBe('Beauty in Every Detail.');
      expect(home).toMatchObject({ collections: [], newArrivals: [], bestsellers: [], testimonials: [] });
    });

    it('builds collections from active categories, new arrivals from real products, and bestsellers only from flagged ones', async () => {
      const { product } = await seedStore(admin);
      const watches = await makeCategory(admin, 'Watches');
      await makeProduct(admin, watches.id, { name: 'Chronograph', variants: [{ sku: 'CHR-1', stock: 2 }] });
      await makeProduct(admin, watches.id, { name: 'Unfinished', publish: false, variants: [{ sku: 'UNF-1' }] });

      const home = (await get('/content/home')).body.data;
      expect(home.collections.map((c: { title: string; url: string }) => [c.title, c.url])).toEqual([['Handbags', '/collections/handbags'], ['Watches', '/collections/watches']]);
      expect(home.newArrivals.map((p: { name: string }) => p.name)).toEqual(['Chronograph', 'Tote']);
      expect(home.newArrivals[0]).toMatchObject({ currency: 'PKR', category: { slug: 'watches' } });
      expect(home.bestsellers).toEqual([]); // nothing is flagged, so nothing is invented

      await admin.patch(`/admin/products/${product.id}`, { bestseller: true });
      expect((await get('/content/home')).body.data.bestsellers.map((p: { name: string }) => p.name)).toEqual(['Tote']);
    });

    it('hides products in archived categories', async () => {
      const { product } = await seedStore(admin);
      const cat = (await admin.get('/admin/categories')).body.data.categories[0];
      await admin.patch(`/admin/categories/${cat.id}`, { status: 'archived' });
      const home = (await get('/content/home')).body.data;
      expect(home.newArrivals).toEqual([]);
      expect(home.collections).toEqual([]);
      expect(product.id).toBeTruthy();
    });

    it('lets staff replace the hero and curate collections', async () => {
      await seedStore(admin);
      const res = await admin.patch('/admin/content/home', {
        hero: { label: 'AUTUMN', headline: 'Warm Neutrals', subheadline: 'New season.', ctaLabel: 'SHOP NOW', ctaUrl: '/collections/handbags', image: IMAGE, imageMobile: null, videoUrl: null, videoPoster: null },
        collections: [{ categorySlug: 'handbags', title: 'The Bags', image: IMAGE }, { categorySlug: 'does-not-exist' }, { title: 'Gifts', url: '/shop', description: 'For them' }],
      });
      expect(res.status).toBe(200);
      const home = (await get('/content/home')).body.data;
      expect(home.hero).toMatchObject({ headline: 'Warm Neutrals', image: { url: IMAGE.url } });
      expect(home.collections).toEqual([
        { title: 'The Bags', description: '', url: '/collections/handbags', image: IMAGE },
        { title: 'Gifts', description: 'For them', url: '/shop', image: null },
      ]);
      expect(home.brandStory.headline).toBe('Beauty in Every Detail.'); // untouched sections keep their defaults
    });

    it('rejects links off the site, insecure images and unknown sections', async () => {
      const hero = { label: 'L', headline: 'H', subheadline: 'S', ctaLabel: 'GO', ctaUrl: '/shop', image: null, imageMobile: null, videoUrl: null, videoPoster: null };
      expect((await admin.patch('/admin/content/home', { hero: { ...hero, ctaUrl: 'https://evil.example' } })).status).toBe(400);
      expect((await admin.patch('/admin/content/home', { hero: { ...hero, image: { url: 'http://x.test/a.jpg', alt: 'Campaign' } } })).status).toBe(400);
      expect((await admin.patch('/admin/content/home', { carousel: [] })).status).toBe(400);
      const bad = await admin.patch('/admin/content/home', { hero: { ...hero, ctaUrl: '//evil.example' } });
      expect(bad.body.error.details[0].field).toBe('body.hero.ctaUrl');
    });

    it('shows only real, approved, featured reviews as testimonials, and can switch them off', async () => {
      const { v1, product } = await seedStore(admin);
      await createUser({ email: 'ayesha@example.com', name: 'Ayesha Khan' });
      const session = await loginAs(app, 'ayesha@example.com');
      await placeDeliveredOrder(app, admin, v1, { session });
      const long = `Lovely bag. ${'The leather is soft and the finishing is perfect. '.repeat(10)}`;
      const created = await session.agent.post('/api/v1/account/reviews').set('X-CSRF-Token', session.csrf).send({ productSlug: product.slug, rating: 5, body: long });
      const id = created.body.data.review.id as string;

      expect((await get('/content/home')).body.data.testimonials).toEqual([]); // pending
      await admin.patch(`/admin/reviews/${id}`, { status: 'approved' });
      expect((await get('/content/home')).body.data.testimonials).toEqual([]); // approved but not featured
      await admin.patch(`/admin/reviews/${id}`, { featured: true });
      const [t] = (await get('/content/home')).body.data.testimonials;
      expect(t).toMatchObject({ displayName: 'Ayesha K.', rating: 5, product: { name: 'Tote', slug: product.slug } });
      expect(t.body.length).toBeLessThanOrEqual(280);
      expect(t.body.endsWith('…')).toBe(true);
      expect(JSON.stringify(t)).not.toMatch(/Khan|ayesha@/);

      await admin.patch('/admin/content/home', { testimonialsEnabled: false });
      expect((await get('/content/home')).body.data.testimonials).toEqual([]);
    });

    it('is cacheable by the browser and CDN for a short time', async () => {
      expect((await get('/content/home')).headers['cache-control']).toMatch(/public, max-age=60/);
    });
  });

  describe('pages', () => {
    it('keeps a page hidden until published, then serves plain text', async () => {
      const created = await admin.post('/admin/pages', { slug: 'shipping-policy', title: 'Shipping', body: 'We deliver across Pakistan.\n\n<b>Not HTML</b>' });
      expect(created.status).toBe(201);
      expect((await get('/content/pages/shipping-policy')).status).toBe(404);
      expect((await get('/content/pages')).body.data.pages).toEqual([]);

      await admin.patch(`/admin/pages/${created.body.data.page.id}`, { published: true, seoTitle: 'Shipping | MAPLE' });
      const page = (await get('/content/pages/shipping-policy')).body.data.page;
      expect(page).toMatchObject({ slug: 'shipping-policy', title: 'Shipping', seoTitle: 'Shipping | MAPLE' });
      expect(page.body).toContain('<b>Not HTML</b>'); // returned as text; the storefront renders it as text, never as markup
      expect(page).not.toHaveProperty('published');
      expect((await get('/content/pages')).body.data.pages).toEqual([{ slug: 'shipping-policy', title: 'Shipping' }]);

      await admin.patch(`/admin/pages/${created.body.data.page.id}`, { published: false });
      expect((await get('/content/pages/shipping-policy')).status).toBe(404);
    });

    it('rejects duplicate and malformed slugs', async () => {
      await admin.post('/admin/pages', { slug: 'about', title: 'About' });
      expect((await admin.post('/admin/pages', { slug: 'about', title: 'About again' })).status).toBe(409);
      expect((await admin.post('/admin/pages', { slug: 'Not A Slug', title: 'x' })).status).toBe(400);
      const other = (await admin.post('/admin/pages', { slug: 'terms', title: 'Terms' })).body.data.page;
      expect((await admin.patch(`/admin/pages/${other.id}`, { slug: 'about' })).status).toBe(409);
      expect((await admin.get('/admin/pages')).body.data.pages).toHaveLength(2);
    });
  });

  it('is limited to roles with content:write', async () => {
    const pm = await adminClient(app, 'pm@example.com', 'product_manager');
    const om = await adminClient(app, 'om@example.com', 'order_manager');
    expect((await pm.get('/admin/content/home')).status).toBe(200);
    expect((await om.get('/admin/content/home')).status).toBe(403);
    expect((await om.post('/admin/pages', { slug: 'x-y', title: 'XY' })).status).toBe(403);
    expect((await request(app).get('/api/v1/admin/pages')).status).toBe(401);
  });
});
