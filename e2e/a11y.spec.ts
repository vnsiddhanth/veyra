/** Phase 9: automated accessibility audit (axe-core, WCAG 2.1 A/AA) of every page type. */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { engineReady, fixture } from './helpers';

async function audit(page: Page, name: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const report = serious.map((v) => `${v.id} (${v.impact}): ${v.help} → ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  expect(report, `${name}:\n${report.join('\n')}`).toEqual([]);
}

for (const [name, path] of [
  ['home', '/'],
  ['tool directory', '/tools'],
  ['tool page', '/tools/compress-video'],
  ['privacy', '/privacy'],
  ['compatibility', '/compatibility'],
  ['benchmark', '/benchmark'],
  ['guide', '/guide'],
  ['projects', '/editor'],
] as const) {
  test(`a11y: ${name}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await audit(page, name);
  });
}

test('a11y: editor workspace with a clip, and the export dialog', async ({ page }) => {
  await page.goto('/editor');
  await page.getByRole('button', { name: /New project|Create your first project/ }).first().click();
  await engineReady(page);
  await page.locator('aside[aria-label="Media library"] input[type=file]').setInputFiles(fixture('counter-720p30-5s.mp4'));
  const card = page.locator('aside[aria-label="Media library"] ul.grid > li').first();
  await card.getByRole('button', { name: 'counter-720p30-5s', exact: true }).click();
  await card.getByRole('button', { name: 'Append to timeline' }).click();
  await page.locator('[data-clip]').first().click();
  await audit(page, 'editor');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await audit(page, 'export dialog');
});
