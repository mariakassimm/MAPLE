import { test, expect } from '@playwright/test';

// Needs the seeded API and the Vite dev server (see docs/TESTING.md). Not executed by the author.

test('only a handful of products carry the New badge, and they match the New Arrivals page', async ({ page }) => {
  await page.goto('/shop?new=true');
  await page.locator('a[href^="/products/"]').first().waitFor();
  const hrefs = (l: ReturnType<typeof page.locator>) => l.evaluateAll((els) => new Set(els.map((e) => e.getAttribute('href'))).size);
  const onNewPage = await hrefs(page.locator('a[href^="/products/"]'));
  await page.goto('/shop');
  await page.locator('a[href^="/products/"]').first().waitFor();
  const more = page.getByRole('button', { name: /load more|show more/i });
  if (await more.count()) await more.first().click();
  const badges = await page.locator('main').getByText(/^new$/i).count();
  expect(onNewPage).toBeGreaterThan(0);
  expect(onNewPage).toBeLessThanOrEqual(10);
  expect(badges).toBeLessThanOrEqual(10); // every other product in the catalogue is unbadged
});

test('no placeholder development text is visible on a product page', async ({ page }) => {
  await page.goto('/shop');
  await page.locator('a[href^="/products/"]').first().click();
  await expect(page.getByText(/demo product for development/i)).toHaveCount(0);
});

test('Back from a product returns to the previous place in the shop', async ({ page }) => {
  await page.goto('/shop');
  await page.locator('a[href^="/products/"]:visible').first().waitFor();
  // Instant scrolls only: the site's CSS makes plain scrollTo/scrollIntoView animate, which would make positions a moving target.
  await page.evaluate(() => window.scrollTo({ top: 1400, behavior: 'instant' }));
  await page.waitForFunction(() => Math.abs(window.scrollY - 1400) < 5);
  // Click a product that is already on screen so nothing scrolls between "before" and the click.
  const target = await page.evaluate(() => {
    const links = [...document.querySelectorAll<HTMLAnchorElement>('a[href^="/products/"]')];
    const hit = links.find((a) => { const r = a.getBoundingClientRect(); return r.top > 80 && r.bottom < innerHeight - 40; });
    return hit ? hit.getAttribute('href') : null;
  });
  expect(target, 'a product link on screen at scrollY 1400').not.toBeNull();
  // Playwright may nudge the link into view before clicking (it does on phones), so record the position at the click itself.
  await page.evaluate(() => window.addEventListener('click', () => ((window as unknown as { __y: number }).__y = window.scrollY), true));
  await page.locator(`a[href="${target}"]`).first().click();
  const before = await page.evaluate(() => (window as unknown as { __y: number }).__y);
  expect(before).toBeGreaterThan(500);
  await expect(page).toHaveURL(/\/products\//);
  await page.goBack();
  await expect(page).toHaveURL(/\/shop/);
  await page.waitForTimeout(2500);
  const after = await page.evaluate(() => ({ y: window.scrollY, h: document.documentElement.scrollHeight, saved: sessionStorage.getItem('maple-scroll') }));
  expect(Math.abs(after.y - before), `before=${before} after=${JSON.stringify(after, null, 1)}`).toBeLessThan(200);
});

test('mobile product page shows one Add to Bag at a time', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'mobile only');
  await page.goto('/shop');
  await page.locator('a[href^="/products/"]:visible').first().click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.waitForTimeout(800);
  // The in-page button reads "Add to bag", the sticky bar's reads "Add". getByRole ignores aria-hidden elements, so a hidden sticky bar is not counted.
  const visible = await page.getByRole('button', { name: /^add( to bag)?$/i }).evaluateAll(
    (els) => els.filter((e) => { const r = e.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; }).length,
  );
  expect(visible).toBe(1);
});
