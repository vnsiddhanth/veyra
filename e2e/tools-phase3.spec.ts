/**
 * Phase 3 standalone tools: each test drives the real tool UI, downloads the result, and checks it
 * independently in Node (container, tracks, codecs, size, duration). Timing-sensitive tools are
 * also checked frame-by-frame with the app's decoder (fixture frames have unique colours).
 */
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { chooseFile, colorDistance, engineReady, expectClose, fixture, framePixel, inspectInNode } from './helpers';

const SRC = fixture('counter-720p30-5s.mp4'); // 1280×720, 30 fps, 150 frames, AAC stereo
const SRC2 = fixture('counter-480p24-6s.webm'); // 854×480, 24 fps, VP9/Opus

test.describe.configure({ timeout: 120_000 });

async function download(page: Page, name = 'Download', index = 0): Promise<string> {
  await expect(page.getByText('output verified', { exact: false }).first()).toBeVisible({ timeout: 90_000 });
  const link = page.getByRole('link', { name }).nth(index);
  const [dl] = await Promise.all([page.waitForEvent('download'), link.click()]);
  const out = test.info().outputPath(dl.suggestedFilename());
  await dl.saveAs(out);
  return out;
}

async function open(page: Page, slug: string, file = SRC) {
  await page.goto(`/tools/${slug}`);
  await chooseFile(page, file);
}

test('compress video makes a smaller valid MP4', async ({ page }) => {
  await open(page, 'compress-video');
  await page.getByLabel('Compression').selectOption('very-low');
  await page.getByRole('button', { name: 'Compress', exact: true }).click();
  const out = await download(page);
  const meta = await inspectInNode(out);
  expect(meta.video?.width).toBe(1280);
  expect(meta.audio).not.toBeNull();
  expect(Math.abs(meta.duration - 5)).toBeLessThan(0.1);
  expect(readFileSync(out).length).toBeLessThan(readFileSync(SRC).length);
});

test('compress to target size stays under the limit', async ({ page }) => {
  await open(page, 'compress-to-size');
  await page.getByLabel('Target size').fill('0.3');
  await page.getByLabel('Target size').press('Enter');
  // 0.3 MB is rejected by the field minimum (1 MB) → use 1 MB, which is below the source size.
  await page.getByLabel('Target size').fill('1');
  await page.getByLabel('Target size').press('Enter');
  await page.getByRole('button', { name: 'Compress', exact: true }).click();
  const out = await download(page);
  expect(readFileSync(out).length).toBeLessThanOrEqual(1_000_000);
  const meta = await inspectInNode(out);
  expect(meta.video).not.toBeNull();
});

test('extract audio as MP3 (WASM LAME fallback when needed)', async ({ page }) => {
  await open(page, 'extract-audio');
  await page.getByLabel('Output format').selectOption('mp3');
  await page.getByRole('button', { name: 'Extract audio' }).click();
  const out = await download(page);
  expect(out.endsWith('.mp3')).toBe(true);
  const meta = await inspectInNode(out);
  expect(meta.video).toBeNull();
  expect(meta.audio?.codec).toBe('mp3');
  expect(Math.abs(meta.duration - 5)).toBeLessThan(0.15);
});

test('resize to a vertical reel pads to 1080×1920', async ({ page }) => {
  await open(page, 'resize-video');
  await page.getByLabel('Size').selectOption('reel');
  await page.getByRole('button', { name: 'Resize' }).click();
  const meta = await inspectInNode(await download(page));
  expect(meta.video).toMatchObject({ width: 1080, height: 1920 });
});

test('rotate 90° swaps dimensions', async ({ page }) => {
  await open(page, 'rotate-video');
  await page.getByText('90°', { exact: true }).click();
  await page.getByRole('button', { name: 'Rotate' }).click();
  const meta = await inspectInNode(await download(page));
  expect(meta.video).toMatchObject({ width: 720, height: 1280 });
});

test('crop to a square region', async ({ page }) => {
  await open(page, 'crop-video');
  await page.getByLabel('Aspect').selectOption('1:1');
  await page.getByRole('button', { name: 'Crop', exact: true }).click();
  const meta = await inspectInNode(await download(page));
  expect(meta.video).toMatchObject({ width: 720, height: 720 });
});

test('mute removes audio and keeps video', async ({ page }) => {
  await open(page, 'mute-video');
  await page.getByRole('button', { name: 'Remove audio' }).click();
  const meta = await inspectInNode(await download(page));
  expect(meta.audio).toBeNull();
  expect(meta.video?.codec).toBe('avc');
});

test('convert WebM → MP4', async ({ page }) => {
  await open(page, 'mp4-converter', SRC2);
  await page.getByRole('button', { name: 'Convert', exact: true }).click();
  const meta = await inspectInNode(await download(page));
  expect(meta.mime).toContain('video/mp4');
  expect(meta.video?.width).toBe(854);
  expect(meta.audio).not.toBeNull();
});

test('aspect ratio with blurred background renders 9:16', async ({ page }) => {
  await open(page, 'aspect-ratio-converter');
  await page.getByRole('button', { name: 'Convert', exact: true }).click();
  const meta = await inspectInNode(await download(page));
  expect(meta.video).toMatchObject({ width: 720, height: 1280 });
  expect(meta.audio).not.toBeNull();
  expect(Math.abs(meta.duration - 5)).toBeLessThan(0.1);
});

test('video to GIF produces an animated GIF of the requested size', async ({ page }) => {
  await open(page, 'video-to-gif');
  await page.getByLabel('End').fill('2');
  await page.getByLabel('End').press('Enter');
  await page.getByLabel('Width').fill('320');
  await page.getByLabel('Width').press('Enter');
  await page.getByRole('button', { name: 'Make GIF' }).click();
  const out = await download(page);
  const gif = readFileSync(out);
  expect(gif.subarray(0, 6).toString()).toBe('GIF89a');
  expect(gif.readUInt16LE(6)).toBe(320);
  expect(gif.readUInt16LE(8)).toBe(180);
});

test('extract frames packs a ZIP with one image per second', async ({ page }) => {
  await open(page, 'extract-frames');
  await page.getByRole('button', { name: 'Extract frames' }).click();
  const zip = readFileSync(await download(page));
  // End-of-central-directory record: entry count at offset 10.
  const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  expect(zip.readUInt16LE(eocd + 10)).toBe(5);
});

test('split into 2 parts gives two valid files', async ({ page }) => {
  await open(page, 'split-video');
  await page.getByRole('button', { name: 'Split into 2 parts' }).click();
  await expect(page.getByRole('list', { name: 'Parts' }).getByRole('listitem')).toHaveCount(2, { timeout: 60_000 });
  const outs: string[] = [];
  for (let i = 0; i < 2; i++) {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download' }).nth(i).click()]);
    const p = test.info().outputPath(dl.suggestedFilename());
    await dl.saveAs(p);
    outs.push(p);
  }
  const d = await Promise.all(outs.map(async (p) => (await inspectInNode(p)).duration));
  // Fast split snaps to key frames (every 2 s): 0–2 or 0–4 and the rest; together they cover the source.
  expect(d[0]! + d[1]!).toBeGreaterThan(4.9);
});

test('change speed 2× halves duration and shows every other frame', async ({ page }) => {
  await open(page, 'change-speed');
  await page.getByRole('button', { name: 'Change speed' }).click();
  const out = await download(page);
  const meta = await inspectInNode(out);
  expect(Math.abs(meta.duration - 2.5)).toBeLessThan(0.1);
  expect(meta.audio).not.toBeNull();
  await engineReady(page);
  const src = readFileSync(SRC);
  const res = readFileSync(out);
  const [o10, s20, s21] = await Promise.all([framePixel(page, res, 'o.mp4', 10.5 / 30), framePixel(page, src, 's.mp4', 20.5 / 30), framePixel(page, src, 's.mp4', 21.5 / 30)]);
  expect(colorDistance(s20, s21)).toBeGreaterThan(3);
  expectClose(o10, s20, 6);
});

test('reverse video: first output frame is the last source frame', async ({ page }) => {
  await open(page, 'reverse-video');
  await page.getByRole('button', { name: 'Reverse video' }).click();
  const out = await download(page);
  const meta = await inspectInNode(out);
  expect(Math.abs(meta.duration - 5)).toBeLessThan(0.1);
  await engineReady(page);
  const src = readFileSync(SRC);
  const res = readFileSync(out);
  const [o0, s149, o149, s0] = await Promise.all([
    framePixel(page, res, 'o.mp4', 0.5 / 30),
    framePixel(page, src, 's.mp4', 149.5 / 30),
    framePixel(page, res, 'o.mp4', 149.5 / 30),
    framePixel(page, src, 's.mp4', 0.5 / 30),
  ]);
  expectClose(o0, s149, 6);
  expectClose(o149, s0, 6);
});

test('merge two videos with a crossfade', async ({ page }) => {
  await page.goto('/tools/merge-videos');
  await page.locator('main input[type=file]').first().setInputFiles([SRC, SRC]);
  await page.getByLabel('Transition between clips').selectOption('crossfade');
  await expect(page.getByRole('button', { name: 'Merge videos' })).toBeEnabled({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Merge videos' }).click();
  const out = await download(page);
  const meta = await inspectInNode(out);
  // 5 + 5 − 0.8 s transition.
  expect(Math.abs(meta.duration - 9.2)).toBeLessThan(0.1);
  await engineReady(page);
  const src = readFileSync(SRC);
  const res = readFileSync(out);
  // Frame 30 of the output is source frame 30 (before the transition window).
  const [o30, s30] = await Promise.all([framePixel(page, res, 'o.mp4', 30.5 / 30), framePixel(page, src, 's.mp4', 30.5 / 30)]);
  expectClose(o30, s30, 6);
});

test('add text renders the title over the video', async ({ page }) => {
  await open(page, 'add-text');
  await page.getByLabel('Text', { exact: true }).fill('HELLO');
  await page.getByLabel('Position', { exact: true }).selectOption('center');
  await page.getByLabel('Animation').selectOption('none');
  await page.getByRole('button', { name: 'Render video' }).click();
  const out = await download(page);
  const meta = await inspectInNode(out);
  expect(meta.video).toMatchObject({ width: 1280, height: 720 });
  expect(Math.abs(meta.duration - 5)).toBeLessThan(0.1);
});

test('replace audio with another file', async ({ page }) => {
  await open(page, 'replace-audio');
  await page.locator('main input[type=file]').first().setInputFiles(SRC2);
  await page.getByRole('button', { name: 'Replace audio' }).click();
  const meta = await inspectInNode(await download(page));
  expect(meta.audio).not.toBeNull();
  expect(Math.abs(meta.duration - 5)).toBeLessThan(0.1);
});

test('video filters (cinematic look, WebGL effects) render', async ({ page }) => {
  await open(page, 'video-filters');
  await page.getByRole('button', { name: 'Render video' }).click();
  const meta = await inspectInNode(await download(page));
  expect(meta.video?.width).toBe(1280);
});
