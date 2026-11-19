/**
 * Every tool in the registry, end to end: open it, give it real input, run it and expect a usable
 * result (a verified output, a download, or the report for inspector tools) with no error shown.
 * Deeper per-tool checks (exact sizes, frames, durations) live in the other spec files.
 */
import { expect, test, type Page } from '@playwright/test';
import { TOOLS } from '../src/tools/registry';
import { chooseFile, fixture } from './helpers';

const SRC = fixture('counter-720p30-5s.mp4');
const SRC2 = fixture('counter-480p24-6s.webm');
const SRT = fixture('sample.srt');

test.describe.configure({ timeout: 150_000 });

/** A real PNG image made from a screenshot of a coloured page. */
async function makePng(page: Page, color: string): Promise<{ name: string; mimeType: string; buffer: Buffer }> {
  await page.setContent(`<body style="margin:0;background:${color};width:640px;height:360px"></body>`);
  const buffer = await page.screenshot({ clip: { x: 0, y: 0, width: 640, height: 360 } });
  return { name: `${color}.png`, mimeType: 'image/png', buffer };
}

const INSPECTORS = new Set(['video-metadata', 'frame-rate-inspector', 'resolution-inspector', 'duration-calculator', 'audio-metadata']);

/** Tools whose input is not a single video. */
async function load(page: Page, slug: string): Promise<void> {
  if (slug === 'subtitle-editor') {
    await page.goto(`/tools/${slug}`);
    await page.getByRole('button', { name: 'Choose file' }).nth(1).waitFor();
    await page.locator('main input[type=file]').nth(1).setInputFiles(SRT);
    return;
  }
  if (slug === 'slideshow-maker' || slug === 'images-to-video') {
    const imgs = [await makePng(page, 'tomato'), await makePng(page, 'teal'), await makePng(page, 'gold')];
    await page.goto(`/tools/${slug}`);
    await page.locator('main input[type=file]').first().setInputFiles(imgs);
    return;
  }
  await page.goto(`/tools/${slug}`);
  if (slug === 'remove-overlay') return;
  if (slug === 'merge-videos' || slug === 'add-transitions') {
    await page.locator('main input[type=file]').first().setInputFiles([SRC, SRC2]);
    return;
  }
  await chooseFile(page, SRC);
  if (slug === 'replace-audio' || slug === 'add-audio') await page.locator('main input[type=file]').first().setInputFiles(SRC2);
  if (slug === 'add-subtitles' || slug === 'burn-subtitles') await page.locator('main input[type=file]').first().setInputFiles(SRT);
}

/** The one choice a few tools need before they can run (by design: nothing to do yet). */
async function prepare(page: Page, slug: string): Promise<void> {
  switch (slug) {
    case 'trim-video':
      await page.getByLabel('End time in seconds').fill('3');
      await page.getByLabel('End time in seconds').press('Enter');
      break;
    case 'crop-video':
      await page.getByLabel('Aspect').selectOption('1:1');
      break;
    case 'add-watermark':
      await page.getByLabel('Watermark', { exact: true }).selectOption('text');
      break;
    case 'stabilize-video':
      await page.getByRole('button', { name: 'Analyse shake' }).click();
      break;
  }
}

for (const tool of TOOLS) {
  test(`${tool.slug} works`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await load(page, tool.slug);

    await prepare(page, tool.slug);

    if (INSPECTORS.has(tool.slug)) {
      await expect(page.locator('article')).toContainText(/1280|0:05|5\.0|AAC/i, { timeout: 30_000 });
    } else if (tool.slug === 'remove-overlay') {
      // A guide: overlays added in Veyra are removed in the editor, where the original is kept.
      await expect(page.getByRole('heading', { name: /remove an overlay you added in Veyra/i })).toBeVisible();
    } else if (tool.slug === 'remove-silence') {
      // The fixture has continuous sound, so the honest result is "nothing to remove".
      await expect(page.getByText('No silence found with these settings.')).toBeVisible({ timeout: 30_000 });
    } else if (tool.slug === 'subtitle-editor') {
      await expect(page.getByRole('list', { name: 'Subtitle cues' }).getByRole('listitem')).toHaveCount(2);
      const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download .srt' }).click()]);
      expect(dl.suggestedFilename()).toMatch(/\.srt$/);
    } else {
      const run = page.locator('[data-run]').first();
      const custom = page.getByRole('button', { name: /^(Trim|Capture frame|Split into|Export|Save subtitles|Download)/ }).first();
      await expect(run.or(custom)).toBeVisible({ timeout: 30_000 });
      await expect(run.or(custom)).toBeEnabled({ timeout: 30_000 });
      await run.or(custom).click();
      const ok = page.getByText('Done · output verified', { exact: true }).or(page.getByRole('link', { name: 'Download' })).or(page.getByText(/Frame captured|No silence/i));
      await expect(ok.first()).toBeVisible({ timeout: 120_000 });
    }
    await expect(page.getByRole('alert').filter({ hasText: /fail|error|could not|can’t|cannot/i })).toHaveCount(0);
    expect(errors, 'uncaught page errors').toEqual([]);
  });
}
