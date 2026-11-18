import { test, expect } from '@playwright/test';

// The tracking lockout is per order number, so this test uses a fresh random number each run.
// Requires: API running, at least one published in-stock product, and the service area for E2E_CITY enabled.
const CITY = process.env.E2E_CITY ?? 'Lahore';

test('home page renders brand and has no horizontal scroll', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Elegance, Without Effort');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});

test('unknown route shows the not-found page', async ({ page }) => {
  await page.goto('/this-does-not-exist');
  await expect(page.getByText(/moved on|does not exist/i).first()).toBeVisible();
});

test('guest can add to bag and reach checkout with COD', async ({ page }) => {
  await page.goto('/shop');
  await page.locator('a[href^="/products/"]').first().click();
  const option = page.locator('[role="radio"]:not([aria-disabled="true"])').first();
  if (await option.count()) await option.click();
  await page.getByRole('button', { name: /add to bag/i }).click();
  await page.goto('/bag');
  await page.getByRole('link', { name: /checkout/i }).first().click();
  await expect(page).toHaveURL(/checkout/);
  await page.getByLabel(/full name/i).fill('Test Shopper');
  await page.getByLabel(/mobile/i).fill('03001234567');
  await page.getByLabel(/address/i).first().fill('House 1, Street 2');
  await page.getByRole('combobox', { name: /city/i }).fill(CITY);
  await expect(page.getByRole('radiogroup', { name: /payment method/i }).getByText('Cash on delivery', { exact: true })).toBeVisible();
});

test('order tracking rejects a wrong order number without leaking details', async ({ page }) => {
  await page.goto('/order-tracking');
  await page.getByLabel(/order number/i).fill(`MPL-${Math.random().toString(36).slice(2, 10).toUpperCase().padEnd(8, '0')}`);
  await page.getByLabel(/mobile/i).fill('03001234567');
  await page.getByRole('button', { name: /track|find/i }).click();
  await expect(page.getByText(/couldn.t find|no order|not found/i)).toBeVisible();
});
