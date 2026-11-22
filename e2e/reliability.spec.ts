/** Phase 8: stabilisation accuracy, proxies, storage management and the device benchmark. */
import { expect, test } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { chooseFile, engineReady, fixture, inspectInNode, opfsUsable } from './helpers';

test.describe.configure({ timeout: 180_000 });

test('stabiliser recovers injected camera shake and renders a steadier video', async ({ page }) => {
  await page.goto('/tools/stabilize-video');
  await engineReady(page);
  const src = readFileSync(fixture('counter-720p30-5s.mp4')).toString('base64');
  // Make a shaky clip: the fixture rendered with known per-frame jitter (±12 px), zoomed so edges stay covered.
  const { shaky, jitter } = await page.evaluate(async (b64) => {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const file = new File([arr], 'src.mp4', { type: 'video/mp4' });
    const { mediaEngine } = (window as any).__veyra;
    const { info } = await mediaEngine.probe(file).result;
    const F = 705_600_000;
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31) * 2 - 1;
    const jitter: [number, number][] = [];
    const kx: any[] = [];
    const ky: any[] = [];
    for (let i = 0; i < 150; i++) {
      const j: [number, number] = [Math.round(rnd() * 12), Math.round(rnd() * 12)];
      jitter.push(j);
      kx.push({ t: Math.round((i * F) / 30), value: j[0], easing: 'hold' });
      ky.push({ t: Math.round((i * F) / 30), value: j[1], easing: 'hold' });
    }
    const track = { id: 'v', kind: 'video', name: 'V1', locked: false, muted: false, hidden: false, solo: false, volume: 1, clipIds: ['c'] };
    const clip = {
      id: 'c', trackId: 'v', assetId: 'a', start: 0, duration: 5 * F, sourceIn: 0, speed: 1, reversed: false,
      transform: { x: 0, y: 0, scaleX: 1.1, scaleY: 1.1, rotation: 0, flipH: false, flipV: false, crop: { left: 0, top: 0, right: 0, bottom: 0 } },
      opacity: 1, blendMode: 'normal', effects: [], keyframes: { x: kx, y: ky }, audio: { gain: 1, pan: 0, fadeIn: 0, fadeOut: 0 }, text: null, name: 'c',
    };
    const project = {
      schemaVersion: 1, id: 'p', name: 'shaky', createdAt: 0, updatedAt: 0,
      settings: { width: 1280, height: 720, frameRate: { num: 30, den: 1 }, sampleRate: 48000, background: '#000000' },
      folders: [], assets: [{ id: 'a', kind: 'video', name: 'src', fileName: 'src.mp4', size: file.size, lastModified: 0, fingerprint: 'x', mimeType: 'video/mp4', info, subtitles: null, folderId: null, addedAt: 0 }],
      tracks: [track], clips: { c: clip }, transitions: {}, markers: [], inPoint: null, outPoint: null,
      exportPrefs: { container: 'mp4', videoCodec: null, audioCodec: null, width: null, height: null, quality: 'high', videoBitrate: null, audioBitrate: null, fileName: null },
    };
    const r = await mediaEngine.render({ project, files: { a: file }, settings: { container: 'mp4', fileName: 'shaky', videoBitrate: 'very-high' } }).result;
    const buf = new Uint8Array(await r.file.arrayBuffer());
    let s = '';
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { shaky: btoa(s), jitter };
  }, src);
  const shakyPath = test.info().outputPath('shaky.mp4');
  writeFileSync(shakyPath, Buffer.from(shaky, 'base64'));

  // The analyser should find the frame-to-frame jitter differences (in 160-px analysis units).
  const est = await page.evaluate(async (b64) => {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const a = await (window as any).__veyra.mediaEngine.analyzeMotion(new File([arr], 'shaky.mp4'), 320).result;
    return { dx: Array.from(a.dx as Float32Array), dy: Array.from(a.dy as Float32Array), w: a.width };
  }, shaky);
  const scale = est.w / 1280;
  let good = 0;
  for (let i = 1; i < 150; i++) {
    const ex = (jitter[i]![0] - jitter[i - 1]![0]) * 1.0 * scale;
    const ey = (jitter[i]![1] - jitter[i - 1]![1]) * 1.0 * scale;
    if (Math.abs(est.dx[i]! - ex) <= 1.01 && Math.abs(est.dy[i]! - ey) <= 1.01) good++;
  }
  // Integer-pixel analysis at 320 px: allow ±1 px; most frames must match.
  expect(good / 149).toBeGreaterThan(0.85);

  // Stabilise through the UI and check the output.
  await chooseFile(page, shakyPath);
  await page.getByRole('button', { name: 'Analyse shake' }).click();
  await expect(page.getByText(/Measured shake up to/)).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Stabilize video' }).click();
  await expect(page.getByText('Done · output verified', { exact: true })).toBeVisible({ timeout: 120_000 });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download' }).click()]);
  const out = test.info().outputPath('stable.mp4');
  await dl.saveAs(out);
  const meta = await inspectInNode(out);
  expect(meta.video).toMatchObject({ width: 1280, height: 720 });
  expect(Math.abs(meta.duration - 5)).toBeLessThan(0.1);
});

test('preview proxy is created, persisted and listed in storage', async ({ page }) => {
  await page.goto('/editor');
  await page.getByRole('button', { name: /New project|Create your first project/ }).first().click();
  await engineReady(page);
  await page.locator('aside[aria-label="Media library"] input[type=file]').setInputFiles(fixture('counter-1080p60-3s.mp4'));
  const card = page.locator('aside[aria-label="Media library"] ul.grid > li').first();
  await card.getByRole('button', { name: 'counter-1080p60-3s', exact: true }).click();
  await card.getByRole('button', { name: /Create preview proxy/ }).click();
  await expect(card.getByTitle('Preview proxy', { exact: true })).toHaveText('proxy', { timeout: 60_000 });
  // Without OPFS (Playwright WebKit on macOS, Safari Private Browsing) the proxy is kept for the session only.
  if (!(await opfsUsable(page))) {
    await expect(page.getByText(/kept for this session only/)).toBeVisible();
    test.info().annotations.push({ type: 'note', description: 'OPFS unavailable: proxy kept in memory, persistence not checked' });
    return;
  }
  await page.goto('/privacy');
  const storage = page.getByLabel('Storage on this device');
  await expect(storage).toContainText(/Preview proxies\s*1 file/);
  await storage.getByRole('listitem').filter({ hasText: 'Preview proxies' }).getByRole('button', { name: 'Clear' }).click();
  await expect(storage).toContainText(/Preview proxies\s*0 files/);
});

test('device benchmark reports measured numbers', async ({ page, browserName }, info) => {
  await page.goto('/benchmark');
  await page.getByLabel('Benchmark resolution').selectOption('1080p');
  await page.getByRole('button', { name: 'Run benchmark' }).click();
  const table = page.getByRole('table', { name: 'Benchmark results' });
  await expect(table).toBeVisible({ timeout: 150_000 });
  const rows = await table.locator('tr').allTextContents();
  const line = `${info.project.name}/${browserName}: ${rows.join(' | ')}`;
  console.log('BENCH', line);
  info.annotations.push({ type: 'benchmark', description: line });
  const encode = Number(/Encode([\d.]+)/.exec(rows.join(''))?.[1] ?? 0);
  expect(encode).toBeGreaterThan(0);
});
