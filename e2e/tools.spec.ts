import { expect, test } from '@playwright/test';
import { chooseFile, fixture } from './helpers';

test('thumbnail maker exports a full-resolution PNG of the chosen frame', async ({ page }) => {
  await page.goto('/tools/thumbnail-maker');
  await chooseFile(page, fixture('counter-720p30-5s.mp4'));
  const player = page.locator('[tabindex="0"]').filter({ has: page.locator('video') });
  await player.focus();
  for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button', { name: 'Capture frame 12' })).toBeVisible();
  await page.getByRole('button', { name: 'Capture frame 12' }).click();
  await expect(page.getByText('Frame captured', { exact: false })).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download' }).click()]);
  expect(download.suggestedFilename()).toBe('counter-720p30-5s-frame-12.png');
  const path = test.info().outputPath('frame.png');
  await download.saveAs(path);
  const { readFileSync } = await import('node:fs');
  const png = readFileSync(path);
  expect(png.subarray(1, 4).toString()).toBe('PNG');
  expect(png.readUInt32BE(16)).toBe(1280); // IHDR width
  expect(png.readUInt32BE(20)).toBe(720); // IHDR height
});

test('metadata viewer reports codecs, frame rate and duration', async ({ page }) => {
  await page.goto('/tools/video-metadata');
  await chooseFile(page, fixture('counter-480p24-6s.webm'));
  const article = page.locator('article');
  await expect(article).toContainText('VP9');
  await expect(article).toContainText('854 × 480');
  await expect(article).toContainText('24 fps');
  await expect(article).toContainText('Opus');
});

test('a project with imported media survives a reload', async ({ page }) => {
  await page.goto('/editor');
  await page.getByRole('button', { name: /New project|Create your first project/ }).first().click();
  await expect(page).toHaveURL(/\/editor\/prj_/);
  await page.locator('aside[aria-label="Media library"] input[type=file]').setInputFiles(fixture('counter-720p30-5s.mp4'));
  const card = page.locator('aside[aria-label="Media library"] ul.grid > li').filter({ hasText: 'counter-720p30-5s' });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'counter-720p30-5s', exact: true }).click(); // select the card
  await card.getByRole('button', { name: 'Append to timeline' }).click();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await expect(page.getByText('1280×720', { exact: true })).toBeVisible(); // project matched the first video
  await page.reload();
  await expect(card).toBeVisible();
  await expect(card).toContainText('Offline'); // honest: no file handle from a plain <input>
  await expect(page.locator('section[aria-label="Timeline"] [data-clip][title^="counter-720p30-5s"]')).toHaveCount(1);
});
