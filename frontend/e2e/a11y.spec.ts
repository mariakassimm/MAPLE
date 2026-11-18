import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';

// Automated accessibility scan (WCAG 2.1 A/AA rules). Fails on serious or critical violations only.
// Needs the seeded API and the Vite dev server. Not executed by the author.
for (const path of ['/', '/shop', '/about', '/order-tracking', '/bag']) {
  test(`no serious accessibility violations on ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    // Each line names the failing elements and, for contrast, the actual colours and ratio.
    const report = serious.map((v) =>
      [
        `${v.id}: ${v.help} (${v.nodes.length})`,
        ...v.nodes.slice(0, 6).map((n) => {
          const d = n.any[0]?.data as
            { fgColor?: string; bgColor?: string; contrastRatio?: number; expectedContrastRatio?: string } | undefined;
          return `   ${n.target.join(' ')}${d?.contrastRatio ? `  ${d.fgColor} on ${d.bgColor} = ${d.contrastRatio} (needs ${d.expectedContrastRatio})` : ''}`;
        }),
      ].join('\n'),
    );
    expect(report).toEqual([]);
  });
}
