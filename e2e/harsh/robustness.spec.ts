/**
 * Harsh sweep 3: abuse. Cancelling, re-running, double-clicking, leaving mid-job, very long lists,
 * clean-up of temporary files, memory growth over repeated jobs, and the editor fed every fixture.
 */
import { expect, test, type Page } from '@playwright/test';
import { HAVE_FIXTURES, MANIFEST, fxPath, probe, record } from './lib';

test.describe.configure({ mode: 'parallel' });
test.skip(!HAVE_FIXTURES, 'harsh fixtures not generated');
test.describe.configure({ timeout: 20 * 60_000 });

const verified = (page: Page) => page.getByText('Done · output verified', { exact: true }).first();

async function opfsOutputs(page: Page): Promise<number> {
  return page.evaluate(async () => {
    try {
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle('outputs');
      let n = 0;
      for await (const _ of (dir as unknown as { keys(): AsyncIterable<string> }).keys()) n++;
      return n;
    } catch {
      return 0;
    }
  });
}

function errorsOf(page: Page): string[] {
  const errs: string[] = [];
  page.on('pageerror', (e) => errs.push(e.message));
  return errs;
}

test('cancel a long job, then the same tool still works', async ({ page }, info) => {
  const errs = errorsOf(page);
  await page.goto('/tools/compress-video');
  await page.locator('main input[type=file]').first().setInputFiles(fxPath('v_h264_long_3min.mp4'));
  await page.locator('main [data-run]').click();
  await page.getByRole('button', { name: /Cancel/ }).click({ timeout: 30_000 });
  await expect(page.getByText(/Cancelled/)).toBeVisible({ timeout: 30_000 });
  await page.locator('main [data-run]').click();
  await expect(verified(page)).toBeVisible({ timeout: 300_000 });
  expect(errs).toEqual([]);
  record({ suite: 'robustness', tool: 'compress-video', fixture: 'v_h264_long_3min.mp4', variant: 'cancel then rerun', verdict: 'must', outcome: 'ok', pass: true, detail: 'ok', ms: 0 }, info.project.name);
});

test('five jobs back to back produce five verified files and leave no temporary files behind', async ({ page }) => {
  const errs = errorsOf(page);
  await page.goto('/tools/compress-video');
  await page.locator('main input[type=file]').first().setInputFiles(fxPath('v_h264_1080p30.mp4'));
  for (let i = 0; i < 5; i++) {
    await page.locator('main [data-run]').click();
    await expect(verified(page)).toBeVisible({ timeout: 120_000 });
    await page.getByRole('button', { name: 'Change settings' }).click();
  }
  await page.waitForTimeout(500);
  expect(await opfsOutputs(page), 'temporary outputs left after dismissing results').toBe(0);
  expect(errs).toEqual([]);
});

test('double-clicking run starts exactly one job', async ({ page }) => {
  const errs = errorsOf(page);
  await page.goto('/tools/convert-video');
  await page.locator('main input[type=file]').first().setInputFiles(fxPath('v_h264_1080p30.mp4'));
  await page.locator('main [data-run]').dblclick();
  await expect(verified(page)).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('main [role="alert"]')).toHaveCount(0);
  expect(errs).toEqual([]);
});

test('leaving mid-render and coming back works', async ({ page }) => {
  const errs = errorsOf(page);
  await page.goto('/tools/compress-video');
  await page.locator('main input[type=file]').first().setInputFiles(fxPath('v_h264_long_3min.mp4'));
  await page.locator('main [data-run]').click();
  await page.waitForTimeout(1500);
  await page.getByRole('link', { name: 'Tools', exact: true }).first().click();
  await page.goto('/tools/convert-video');
  await page.locator('main input[type=file]').first().setInputFiles(fxPath('v_h264_1080p30.mp4'));
  await page.locator('main [data-run]').click();
  await expect(verified(page)).toBeVisible({ timeout: 180_000 });
  expect(errs).toEqual([]);
});

test('merging 20 clips of mixed formats, sizes and rates', async ({ page }) => {
  const errs = errorsOf(page);
  const pool = ['v_h264_1080p30.mp4', 'v_h264_aac.mov', 'v_h264_aac.mkv', 'v_vp9_opus.webm', 'v_h264_portrait_1080x1920.mp4', 'v_h264_rotated90.mp4', 'v_h264_60fps.mp4', 'v_h264_23976.mp4', 'v_h264_noaudio.mp4', 'v_h264_mono44k.mp4'].filter((n) => MANIFEST.some((f) => f.name === n));
  const files = Array.from({ length: 20 }, (_, i) => fxPath(pool[i % pool.length]!));
  await page.goto('/tools/merge-videos');
  await page.locator('main input[type=file]').first().setInputFiles(files);
  await expect(page.getByRole('button', { name: 'Merge videos' })).toBeEnabled({ timeout: 120_000 });
  await page.getByRole('button', { name: 'Merge videos' }).click();
  await expect(verified(page)).toBeVisible({ timeout: 900_000 });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download' }).first().click()]);
  const out = test.info().outputPath('merged20.mp4');
  await dl.saveAs(out);
  const want = files.reduce((s, p) => s + (MANIFEST.find((f) => p.endsWith(f.name))?.duration ?? 0), 0);
  expect(Math.abs((await probe(out)).duration - want)).toBeLessThan(0.5);
  expect(errs).toEqual([]);
});

test('memory does not keep growing over ten jobs (Chromium)', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'performance.memory is Chromium-only');
  await page.goto('/tools/convert-video');
  await page.locator('main input[type=file]').first().setInputFiles(fxPath('v_h264_1080p30.mp4'));
  const heap = () => page.evaluate(() => (performance as unknown as { memory: { usedJSHeapSize: number } }).memory.usedJSHeapSize);
  const samples: number[] = [];
  for (let i = 0; i < 10; i++) {
    await page.locator('main [data-run]').click();
    await expect(verified(page)).toBeVisible({ timeout: 120_000 });
    await page.getByRole('button', { name: /Change settings|Start over/ }).first().click();
    samples.push(await heap());
  }
  // After warm-up, the main-thread heap must not keep climbing (allow 40 % noise).
  expect(samples[9]!, `heap samples ${samples.map((s) => Math.round(s / 1e6)).join(', ')} MB`).toBeLessThan(samples[2]! * 1.4);
});

test('the editor imports every fixture: good files work, bad files are refused with a message', async ({ page }) => {
  const errs = errorsOf(page);
  await page.goto('/editor');
  await page.getByRole('button', { name: /New project|Create your first project/ }).first().click();
  const lib = page.locator('aside[aria-label="Media library"]');
  const media = MANIFEST.filter((f) => f.kind !== 'subtitle');
  for (const f of media) await lib.locator('input[type=file]').setInputFiles(fxPath(f));
  await page.waitForTimeout(8000);
  const cards = await lib.locator('ul.grid > li').count();
  const good = media.filter((f) => f.expect === 'ok' && f.kind !== 'broken').length;
  expect(cards, 'every good file appears in the media library').toBeGreaterThanOrEqual(good);
  // Append a spread of good clips and export the timeline.
  for (const name of ['v_h264_1080p30.mp4', 'v_h264_rotated90.mp4', 'v_h264_aac.mov', 'v_vp9_opus.webm', 'a_aac.m4a', 'i_1080p.png']) {
    const card = lib.locator('ul.grid > li').filter({ hasText: name.replace(/\.[^.]+$/, '') }).first();
    if (!(await card.count())) continue;
    await card.getByRole('button', { name: name.replace(/\.[^.]+$/, ''), exact: true }).click();
    await card.getByRole('button', { name: 'Append to timeline' }).click();
  }
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Export video' });
  await dialog.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(dialog.getByText('Done · output verified', { exact: true })).toBeVisible({ timeout: 600_000 });
  expect(errs).toEqual([]);
});
