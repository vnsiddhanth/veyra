/**
 * Filmmaking tools: loudness normalisation on export (checked by measuring the exported WAV
 * independently), video scopes and framing guides in the program monitor.
 */
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { LoudnessMeter } from '../src/render/loudness';
import { colorDistance, engineReady, expectClose, fixture, framePixel, inspectInNode } from './helpers';

async function projectWithClip(page: Page) {
  await page.goto('/editor');
  await page.getByRole('button', { name: /New project|Create your first project/ }).first().click();
  await engineReady(page);
  await page.locator('aside[aria-label="Media library"] input[type=file]').setInputFiles(fixture('counter-720p30-5s.mp4'));
  const card = page.locator('aside[aria-label="Media library"] ul.grid > li').first();
  await card.getByRole('button', { name: 'counter-720p30-5s', exact: true }).click();
  await card.getByRole('button', { name: 'Append to timeline' }).click();
  await expect(page.locator('[data-clip]')).toHaveCount(1);
}

/** 16-bit or float PCM WAV → planar stereo floats. */
function readWav(buf: Buffer): { sr: number; l: Float32Array; r: Float32Array } {
  let p = 12;
  let fmt = { format: 1, ch: 2, sr: 48000, bits: 16 };
  while (p < buf.length - 8) {
    const id = buf.toString('ascii', p, p + 4);
    const size = buf.readUInt32LE(p + 4);
    if (id === 'fmt ') fmt = { format: buf.readUInt16LE(p + 8), ch: buf.readUInt16LE(p + 10), sr: buf.readUInt32LE(p + 12), bits: buf.readUInt16LE(p + 22) };
    if (id === 'data') {
      const bytes = fmt.bits / 8;
      const n = Math.floor(size / (bytes * fmt.ch));
      const l = new Float32Array(n);
      const r = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const o = p + 8 + i * bytes * fmt.ch;
        const rd = (k: number) => (fmt.format === 3 ? buf.readFloatLE(o + k * bytes) : buf.readInt16LE(o + k * bytes) / 32768);
        l[i] = rd(0);
        r[i] = fmt.ch > 1 ? rd(1) : l[i]!;
      }
      return { sr: fmt.sr, l, r };
    }
    p += 8 + size + (size & 1);
  }
  throw new Error('no data chunk');
}

test('export normalises loudness to the chosen LUFS target with peaks under −1 dB', async ({ page }) => {
  test.setTimeout(180_000);
  await projectWithClip(page);
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Export video' });
  await dialog.getByLabel('Format').selectOption('wav');
  await dialog.getByLabel('Loudness').selectOption('-23');
  await dialog.getByLabel('File name').fill('loud');
  await dialog.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(dialog.getByText('Done · output verified', { exact: true })).toBeVisible({ timeout: 150_000 });
  const [dl] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('link', { name: 'Download' }).click()]);
  const out = test.info().outputPath('loud.wav');
  await dl.saveAs(out);

  const { sr, l, r } = readWav(readFileSync(out));
  const m = new LoudnessMeter(sr);
  m.add(l, r);
  expect(Math.abs(m.integrated() - -23)).toBeLessThan(0.5);
  expect(m.samplePeakDb()).toBeLessThanOrEqual(-0.9);
  // The result card explains what was done.
  await dialog.getByText('Checks').click().catch(() => undefined);
  await expect(dialog.getByText(/Measured .* LUFS; gain/)).toBeAttached();
});

test('scopes and framing guides draw over the program monitor', async ({ page }) => {
  await projectWithClip(page);
  await page.getByRole('tab', { name: 'program' }).click();
  const monitor = page.getByRole('img', { name: 'Program monitor' });
  await expect(monitor).toBeVisible();
  for (const [value, name] of [
    ['waveform', 'Waveform (luma)'],
    ['parade', 'RGB parade'],
    ['vectorscope', 'Vectorscope'],
    ['histogram', 'Histogram'],
  ]) {
    await page.getByLabel('Video scopes').selectOption(value!);
    const scope = page.getByRole('img', { name: `${name} of the current frame` });
    await expect(scope).toBeVisible();
    // The scope has been drawn from real frame data (not blank).
    await expect
      .poll(() => scope.evaluate((c: HTMLCanvasElement) => {
        const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
        let lit = 0;
        for (let i = 0; i < d.length; i += 4) if (d[i]! + d[i + 1]! + d[i + 2]! > 60) lit++;
        return lit;
      }))
      .toBeGreaterThan(20);
  }
  await expect(page.getByText(/clip \d+\.\d% · crush \d+\.\d%/)).toBeVisible();

  await page.getByLabel('Framing guides').selectOption('2.39');
  // 16:9 project with a 2.39:1 mask: bars of (1 − (16/9)/2.39)/2 ≈ 12.8 % top and bottom.
  const bar = page.locator('section, div').filter({ has: monitor }).locator('div.bg-black\\/75').first();
  const ratio = await bar.evaluate((el) => el.getBoundingClientRect().height / el.parentElement!.getBoundingClientRect().height);
  expect(ratio).toBeGreaterThan(0.12);
  expect(ratio).toBeLessThan(0.135);

  await page.getByLabel('Video scopes').selectOption('off');
  await expect(page.getByRole('img', { name: /of the current frame/ })).toHaveCount(0);
});

test('freeze frame holds the exact frame for 2 s, then the clip continues', async ({ page }) => {
  test.setTimeout(180_000);
  await projectWithClip(page);
  // Playhead to 1 s (frame 30), press F.
  await page.evaluate(() => (window as any).__veyra.useEditorUi.getState().setPlayhead(705_600_000));
  await page.getByRole('button', { name: 'Freeze', exact: true }).click();
  await expect(page.locator('[data-clip]')).toHaveCount(3);
  await expect(page.locator('[data-clip]').filter({ hasText: 'freeze' })).toHaveCount(1);

  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Export video' });
  await dialog.getByLabel('Format').selectOption('mp4');
  await dialog.getByLabel('File name').fill('freeze');
  await dialog.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(dialog.getByText('Done · output verified', { exact: true })).toBeVisible({ timeout: 150_000 });
  const [dl] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('link', { name: 'Download' }).click()]);
  const out = test.info().outputPath('freeze.mp4');
  await dl.saveAs(out);
  const meta = await inspectInNode(out);
  expect(Math.abs(meta.duration - 7)).toBeLessThan(0.1);

  const src = readFileSync(fixture('counter-720p30-5s.mp4'));
  const res = readFileSync(out);
  const at = (b: Buffer, n: string, frame: number) => framePixel(page, b, n, (frame + 0.5) / 30);
  const [s30, s31, o30, o45, o89, o90] = await Promise.all([at(src, 's.mp4', 30), at(src, 's.mp4', 31), at(res, 'o.mp4', 30), at(res, 'o.mp4', 45), at(res, 'o.mp4', 89), at(res, 'o.mp4', 90)]);
  expect(colorDistance(s30, s31)).toBeGreaterThan(3); // neighbouring source frames differ
  expectClose(o30, s30, 6); // freeze starts on source frame 30
  expectClose(o45, s30, 6); // …and holds it
  expectClose(o89, s30, 6); // …until the end of the 2 s hold (frames 30–89)
  expectClose(o90, s30, 6); // then the clip continues from frame 30
});

test('rolling credits move up through the frame at constant speed', async ({ page }) => {
  await projectWithClip(page);
  await page.getByRole('button', { name: '+ Credits' }).click();
  await expect(page.locator('[data-clip][title^="Credits"]')).toHaveCount(1);
  // Measure the credits alone on black: remove the video clip.
  await page.evaluate(() => {
    const { useProjectStore } = (window as any).__veyra;
    useProjectStore.getState().apply((p: any) => {
      const keep = Object.fromEntries(Object.entries<any>(p.clips).filter(([, c]) => c.text));
      return { ...p, clips: keep, tracks: p.tracks.map((t: any) => ({ ...t, clipIds: t.clipIds.filter((id: string) => keep[id]) })), transitions: {} };
    });
  });
  await page.getByRole('tab', { name: 'program' }).click();
  // Render two moments of the 20 s roll and find the vertical centre of the bright text pixels.
  const centreY = async (sec: number) => {
    await page.evaluate(async (s) => {
      const ui = (window as any).__veyra.useEditorUi.getState();
      ui.setPlayhead(Math.round(s * 705_600_000));
      await (window as any).__veyraPreview.settled();
    }, sec);
    return page.evaluate(async () => {
      const e = (window as any).__veyraPreview;
      const ys: number[] = [];
      for (let y = 0.01; y < 1; y += 0.02)
        for (let x = 0.4; x <= 0.6; x += 0.02) {
          const rgb = await e.probe(x, y);
          if (rgb[0] > 110 && rgb[1] > 110 && rgb[2] > 110) {
            ys.push(y);
            break;
          }
        }
      return ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : null;
    });
  };
  const early = await centreY(4);
  const mid = await centreY(10);
  const late = await centreY(16);
  expect(early).not.toBeNull();
  expect(mid).not.toBeNull();
  expect(late).not.toBeNull();
  expect(mid!).toBeLessThan(early!); // moving up…
  expect(late!).toBeLessThan(mid!);
  expect(await centreY(0.05)).toBeNull(); // starts below the frame
  expect(await centreY(19.95)).toBeNull(); // ends above it
});
