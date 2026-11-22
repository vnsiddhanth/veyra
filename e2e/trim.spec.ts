import { expect, test } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { colorDistance, chooseFile, engineReady, expectClose, fixture, framePixel, inspectInNode } from './helpers';

const SRC = fixture('counter-720p30-5s.mp4'); // 30 fps, 150 frames, key frame every 2 s, AAC stereo

async function trimViaUi(page: import('@playwright/test').Page, start: string, end: string, precision: 'Frame-accurate' | 'Fast') {
  await page.goto('/tools/trim-video');
  await chooseFile(page, SRC);
  await page.getByLabel('Start time in seconds').fill(start);
  await page.getByLabel('Start time in seconds').press('Enter');
  await page.getByLabel('End time in seconds').fill(end);
  await page.getByLabel('End time in seconds').press('Enter');
  await page.getByText(precision, { exact: true }).click();
  await page.getByRole('button', { name: 'Trim and export' }).click();
  await expect(page.getByText('Done · output verified', { exact: true })).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download' }).click()]);
  const out = test.info().outputPath(download.suggestedFilename());
  await download.saveAs(out);
  return out;
}

for (const precision of ['Frame-accurate', 'Fast'] as const) {
  test(`trim 1.000–3.000 s (${precision}) exports a valid, frame-exact MP4`, async ({ page }) => {
    const out = await trimViaUi(page, '1.000', '3.000', precision);

    // Independent container check in Node.
    const meta = await inspectInNode(out);
    expect(meta.mime).toContain('video/mp4');
    expect(meta.video).toEqual({ codec: 'avc', width: 1280, height: 720 });
    // AAC where the browser can encode it; Firefox has no AAC encoder and falls back to Opus in MP4.
    expect(['aac', 'opus']).toContain(meta.audio?.codec);
    expect(meta.duration).toBeGreaterThan(2.0 - 1 / 30);
    expect(meta.duration).toBeLessThan(2.0 + 1 / 30 + 0.05);

    // Content check: output frame 0 must be source frame 30; the last output frame source frame 89.
    await engineReady(page);
    const src = readFileSync(SRC);
    const res = readFileSync(out);
    const [outFirst, outLast, src29, src30, src89, src90] = await Promise.all([
      framePixel(page, res, 'out.mp4', 0.5 / 30),
      framePixel(page, res, 'out.mp4', 59.5 / 30),
      framePixel(page, src, 'src.mp4', 29.5 / 30),
      framePixel(page, src, 'src.mp4', 30.5 / 30),
      framePixel(page, src, 'src.mp4', 89.5 / 30),
      framePixel(page, src, 'src.mp4', 90.5 / 30),
    ]);
    expectClose(outFirst, src30);
    expectClose(outLast, src89);
    // Neighbouring frames must be distinguishable, or the checks above would prove nothing.
    expect(colorDistance(src29, src30)).toBeGreaterThan(3);
    expect(colorDistance(src89, src90)).toBeGreaterThan(3);
  });
}

test('trim can be cancelled and leaves no output behind', async ({ page }) => {
  await page.goto('/tools/trim-video');
  await engineReady(page);
  const bytes = readFileSync(fixture('counter-1080p60-3s.mp4')).toString('base64');
  const outcome = await page.evaluate(async (b64) => {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const file = new File([arr], 'big.mp4', { type: 'video/mp4' });
    const { mediaEngine } = (window as any).__veyra;
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('outputs', { create: true });
    const count = async () => {
      let n = 0;
      for await (const _ of (dir as any).keys()) n++;
      return n;
    };
    const before = await count();
    const job = mediaEngine.convert(file, { container: 'webm', copy: 'never', video: { codec: 'vp9' }, fileName: 'cancel-me' });
    let maxP = 0;
    job.onProgress((p: number) => {
      maxP = p;
      if (p > 0.1) job.cancel();
    });
    let code = 'resolved';
    try {
      await job.result;
    } catch (e: any) {
      code = e.code;
    }
    // Give the worker a moment to delete its partial file.
    await new Promise((r) => setTimeout(r, 1500));
    return { code, maxP, before, after: await count() };
  }, bytes);
  expect(outcome.code).toBe('cancelled');
  expect(outcome.maxP).toBeGreaterThan(0.1);
  expect(outcome.after).toBe(outcome.before);
});

test('a cut-off file is flagged: refused, or only its readable part is offered', async ({ page }) => {
  const truncated = test.info().outputPath('truncated.mp4');
  writeFileSync(truncated, readFileSync(SRC).subarray(0, 40_000));
  await page.goto('/tools/trim-video');
  await chooseFile(page, truncated);
  // Veyra either refuses a file with nothing usable, or loads the intact start and says the rest is missing.
  await expect(page.getByText(/incomplete|damaged|could not be read/i).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('link', { name: 'Download' })).toHaveCount(0);
});
