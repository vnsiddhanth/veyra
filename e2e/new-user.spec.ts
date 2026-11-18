/**
 * Phase 9 acceptance: a new user edits and exports without help — following only what the UI
 * shows (links, the Get started guide, visible buttons). No test hooks, no model injection.
 */
import { expect, test } from '@playwright/test';
import { fixture, inspectInNode } from './helpers';

test('from the home page to an exported edit using only on-screen guidance', async ({ page }) => {
  test.setTimeout(150_000);
  // Use the <input type=file> fallback (as Firefox/Safari do) so the file chooser is observable;
  // Chromium's File System Access picker cannot be driven by Playwright.
  await page.addInitScript(() => {
    delete (window as { showOpenFilePicker?: unknown }).showOpenFilePicker;
  });
  await page.goto('/');
  await page.getByRole('link', { name: 'Open editor' }).first().click();
  await page.getByRole('button', { name: /New project|Create your first project/ }).first().click();

  // The guide tells the user what to do first.
  const guide = page.getByRole('region', { name: 'Get started' });
  await expect(guide).toBeVisible();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), guide.getByRole('button', { name: 'Import files' }).click()]);
  await chooser.setFiles(fixture('counter-720p30-5s.mp4'));
  await expect(guide.getByText('Import your media (done)')).toBeVisible();

  // "select it and click its + button"
  const card = page.getByRole('button', { name: 'counter-720p30-5s', exact: true });
  await card.click();
  await page.getByRole('button', { name: 'Append to timeline' }).click();
  await expect(page.locator('[data-clip]')).toHaveCount(1);

  // "Press S to split at the red playhead": move the playhead by clicking the ruler, then press S.
  const ruler = page.getByLabel('Timeline ruler: click or drag to move the playhead');
  const box = (await ruler.boundingBox())!;
  await ruler.click({ position: { x: 80, y: box.height / 2 } }); // 2 s at the default zoom
  await page.keyboard.press('s');
  await expect(page.locator('[data-clip]')).toHaveCount(2);

  // "Press Export at the top right"
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Export video' });
  await dialog.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(dialog.getByText('output verified')).toBeVisible({ timeout: 120_000 });
  const [dl] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('link', { name: 'Download' }).click()]);
  const out = test.info().outputPath(dl.suggestedFilename());
  await dl.saveAs(out);
  const meta = await inspectInNode(out);
  expect(meta.video?.width).toBe(1280);
  expect(Math.abs(meta.duration - 5)).toBeLessThan(0.1);
});

test('phone layout: stacked monitor with media / timeline / inspector tabs', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto('/editor');
  await page.getByRole('button', { name: /New project|Create your first project/ }).first().click();
  const tabs = page.getByRole('tablist', { name: 'Editor panels' });
  await expect(tabs).toBeVisible();
  await tabs.getByRole('tab', { name: 'media' }).click();
  await page.locator('aside[aria-label="Media library"] input[type=file]').setInputFiles(fixture('counter-720p30-5s.mp4'));
  await page.getByRole('button', { name: 'counter-720p30-5s', exact: true }).click();
  await page.getByRole('button', { name: 'Append to timeline' }).click();
  await tabs.getByRole('tab', { name: 'timeline' }).click();
  await expect(page.locator('[data-clip]')).toHaveCount(1);
  // No horizontal page overflow on a phone.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await ctx.close();
});
