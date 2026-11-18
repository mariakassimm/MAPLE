import { test, expect } from '@playwright/test';

// Set E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD to a throwaway super admin created on a TEST database.
const email = process.env.E2E_ADMIN_EMAIL;
const password = process.env.E2E_ADMIN_PASSWORD;

test('anonymous visitor is redirected away from /admin', async ({ page }) => {
  await page.goto('/admin');
  await expect(page).toHaveURL(/login/);
});

test.describe('signed-in staff', () => {
  test.skip(!email || !password, 'E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD not set');

  test('super admin can sign in and open the dashboard and audit log', async ({ page }) => {
    await page.goto('/login?next=/admin');
    await page.getByLabel(/email/i).fill(email!);
    await page.getByLabel(/password/i).fill(password!);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL(/admin/);
    await page.getByRole('link', { name: /audit log/i }).click();
    await expect(page.getByRole('heading', { name: /audit log/i })).toBeVisible();
  });
});
