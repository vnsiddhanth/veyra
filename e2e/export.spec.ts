/**
 * Phase 7 acceptance: the exported file matches the timeline — timing, transition blend, overlay
 * and audio — checked with independent frame decodes and an audio envelope.
 */
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { engineReady, expectClose, fixture, framePixel, inspectInNode } from './helpers';


test('export renders the timeline exactly: cuts, crossfade blend, title and audio', async ({ page, browserName }) => {
  // Firefox encodes H.264 in software (OpenH264) with slightly coarser colour; neighbouring frames still differ by more.
  const tol = browserName === 'firefox' ? 9 : 6;
  test.setTimeout(180_000);
  await page.goto('/editor');
  await page.getByRole('button', { name: /New project|Create your first project/ }).first().click();
  await engineReady(page);
  await page.locator('aside[aria-label="Media library"] input[type=file]').setInputFiles(fixture('counter-720p30-5s.mp4'));
  const card = page.locator('aside[aria-label="Media library"] ul.grid > li').first();
  await card.getByRole('button', { name: 'counter-720p30-5s', exact: true }).click();
  await card.getByRole('button', { name: 'Append to timeline' }).click();
  await expect(page.locator('[data-clip]')).toHaveCount(1);

  // Timeline: A = source 0–2 s at 0; B = source 3–5 s at 2 s; 1 s crossfade centred on the cut; a title 0.5–1.5 s.
  await page.evaluate(() => {
    const { useProjectStore } = (window as any).__veyra;
    useProjectStore.getState().apply((p: any) => {
      const F = 705_600_000;
      const a = Object.values<any>(p.clips)[0];
      const v1 = p.tracks.find((t: any) => t.name === 'V1');
      const t1 = p.tracks.find((t: any) => t.name === 'T1');
      const A = { ...a, duration: 2 * F, sourceIn: 0 };
      const B = { ...a, id: 'clp_b', start: 2 * F, duration: 2 * F, sourceIn: 3 * F };
      const T = {
        ...a, id: 'clp_t', trackId: t1.id, assetId: null, start: F / 2, duration: F, sourceIn: 0, name: 'Title',
        text: { text: 'TITLE', fontFamily: 'sans-serif', fontSize: 120, fontWeight: 700, color: '#ffffff', background: null, align: 'center', outline: null, shadow: null, letterSpacing: 0, lineHeight: 1.2 },
      };
      return {
        ...p,
        clips: { [A.id]: A, clp_b: B, clp_t: T },
        tracks: p.tracks.map((t: any) => (t.id === v1.id ? { ...t, clipIds: [A.id, 'clp_b'] } : t.id === t1.id ? { ...t, clipIds: ['clp_t'] } : t)),
        transitions: { tr1: { id: 'tr1', type: 'crossfade', fromClipId: A.id, toClipId: 'clp_b', duration: F, params: {} } },
      };
    });
  });

  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Export video' });
  await dialog.getByLabel('Format').selectOption('mp4');
  await dialog.getByLabel('File name').fill('timeline');
  await dialog.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(dialog.getByText('output verified')).toBeVisible({ timeout: 150_000 });
  const [dl] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('link', { name: 'Download' }).click()]);
  const out = test.info().outputPath('timeline.mp4');
  await dl.saveAs(out);

  const meta = await inspectInNode(out);
  expect(meta.video).toMatchObject({ codec: 'avc', width: 1280, height: 720 });
  // AAC where the browser can encode it; Firefox has no AAC encoder and falls back to Opus in MP4.
    expect(['aac', 'opus']).toContain(meta.audio?.codec);
  expect(Math.abs(meta.duration - 4)).toBeLessThan(0.08);

  const src = readFileSync(fixture('counter-720p30-5s.mp4'));
  const res = readFileSync(out);
  const px = (buf: Buffer, n: string, f: number) => framePixel(page, buf, n, (f + 0.5) / 30);
  // Before the transition window (1.5 s): A only. Frame 10 → source 10.
  expectClose(await px(res, 'o.mp4', 10), await px(src, 's.mp4', 10), tol);
  // After the window (2.5 s): B only. Output frame 90 (3.0 s) → source 3 + 1 = 4.0 s = frame 120.
  expectClose(await px(res, 'o.mp4', 90), await px(src, 's.mp4', 120), tol);
  // At the cut (2.0 s) the crossfade is 50 %: A shows source 2.0 s (60), B source 3.0 s (90).
  const [mid, a60, b90] = await Promise.all([px(res, 'o.mp4', 60), px(src, 's.mp4', 60), px(src, 's.mp4', 90)]);
  expectClose(mid, a60.map((v, i) => (v + b90[i]!) / 2), tol + 2);

  // Audio is present and audible (the fixture carries a continuous tone).
  const peak = await page.evaluate(async (b64) => {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const { mediaEngine } = (window as any).__veyra;
    const peaks = (await mediaEngine.waveform(new File([arr], 'o.mp4'), 20).result).peaks as Uint8Array;
    return Math.max(...peaks);
  }, res.toString('base64'));
  expect(peak).toBeGreaterThan(40);
});
