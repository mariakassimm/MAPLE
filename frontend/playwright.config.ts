import { defineConfig, devices } from '@playwright/test';

// E2E needs the API (with a seeded database) on :4000 and the Vite dev server on :5173.
// See docs/TESTING.md for the exact setup. These tests have NOT been executed by the author.
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  workers: process.env.CI ? 2 : 1, // the dev server is slow when hit by many browsers at once
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: process.env.E2E_BASE_URL ? undefined : { command: 'npm run dev', url: 'http://localhost:5173', reuseExistingServer: true },
});
