/** Speed ramps render the integrated source time; the stabiliser measures rotation in real video. */
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { engineReady, expectClose, fixture, framePixel } from './helpers';

test.describe.configure({ timeout: 180_000 });
const F = 705_600_000;

/** Render a one-clip project in the page with the given clip fields; returns the output bytes. */
async function renderClip(page: Page, clipPatch: object, seconds: number, texture = false): Promise<Buffer> {
  const src = readFileSync(fixture('counter-720p30-5s.mp4')).toString('base64');
  const b64 = await page.evaluate(
    async ({ b64, clipPatch, seconds, texture }) => {
      let file: File;
      if (texture) {
        // Textured still (blurred random blocks), like real scenery: edges carry detail to measure.
        const c = new OffscreenCanvas(1280, 720);
        const g = c.getContext('2d')!;
        let seed = 11;
        const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
        for (let y = 0; y < 720; y += 12) for (let x = 0; x < 1280; x += 12) {
          g.fillStyle = `hsl(${Math.floor(rnd() * 360)} 50% ${Math.floor(20 + rnd() * 60)}%)`;
          g.fillRect(x, y, 12, 12);
        }
        const c2 = new OffscreenCanvas(1280, 720);
        const g2 = c2.getContext('2d')!;
        g2.filter = 'blur(3px)';
        g2.drawImage(c, 0, 0);
        file = new File([await c2.convertToBlob({ type: 'image/png' })], 'tex.png', { type: 'image/png' });
      } else {
        const bin = atob(b64);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        file = new File([arr], 'src.mp4', { type: 'video/mp4' });
      }
      const { mediaEngine } = (window as any).__veyra;
      const { info } = await mediaEngine.probe(file).result;
      const F = 705_600_000;
      const clip = {
        id: 'c', trackId: 'v', assetId: 'a', start: 0, duration: Math.round(seconds * F), sourceIn: 0, speed: 1, reversed: false,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, flipH: false, flipV: false, crop: { left: 0, top: 0, right: 0, bottom: 0 } },
        opacity: 1, blendMode: 'normal', effects: [], keyframes: {}, audio: { gain: 1, pan: 0, fadeIn: 0, fadeOut: 0 }, text: null, name: 'c', ...clipPatch,
      };
      const project = {
        schemaVersion: 1, id: 'p', name: 'p', createdAt: 0, updatedAt: 0,
        settings: { width: 1280, height: 720, frameRate: { num: 30, den: 1 }, sampleRate: 48000, background: '#000000' },
        folders: [], assets: [{ id: 'a', kind: texture ? 'image' : 'video', name: 'src', fileName: file.name, size: file.size, lastModified: 0, fingerprint: 'x', mimeType: file.type, info, subtitles: null, folderId: null, addedAt: 0 }],
        tracks: [{ id: 'v', kind: 'video', name: 'V1', locked: false, muted: false, hidden: false, solo: false, volume: 1, clipIds: ['c'] }],
        clips: { c: clip }, transitions: {}, markers: [], inPoint: null, outPoint: null,
        exportPrefs: { container: 'mp4', videoCodec: null, audioCodec: null, width: null, height: null, quality: 'high', videoBitrate: null, audioBitrate: null, fileName: null },
      };
      const r = await mediaEngine.render({ project, files: { a: file }, settings: { container: 'mp4', fileName: 'out', videoBitrate: 'very-high' } }).result;
      const buf = new Uint8Array(await r.file.arrayBuffer());
      let s = '';
      for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return btoa(s);
    },
    { b64: src, clipPatch, seconds, texture },
  );
  return Buffer.from(b64, 'base64');
}

test('speed ramp: output frames follow the integral of the ramp', async ({ page }) => {
  await page.goto('/tools');
  await engineReady(page);
  // 0.5× → 1.5× over 4 s (linear). After 2 s the source has advanced ∫(0.5 + 0.25t)dt = 1.5 s.
  const out = await renderClip(page, { keyframes: { speed: [{ t: 0, value: 0.5, easing: 'linear' }, { t: 4 * F, value: 1.5, easing: 'linear' }] } }, 4);
  const src = readFileSync(fixture('counter-720p30-5s.mp4'));
  const [o60, s45, s50] = await Promise.all([framePixel(page, out, 'o.mp4', 60.5 / 30), framePixel(page, src, 's.mp4', 45.5 / 30), framePixel(page, src, 's.mp4', 50.5 / 30)]);
  expectClose(o60, s45, 6);
  // A constant 1× clip would show frame 60; 0.5× would show 30. The ramp shows 45, clearly distinct from neighbours.
  expect(Math.max(...o60.map((v, i) => Math.abs(v - s50[i]!)))).toBeGreaterThan(3);
});

test('stabiliser measures injected rotation jitter', async ({ page }) => {
  await page.goto('/tools');
  await engineReady(page);
  let seed = 3;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31) * 2 - 1;
  const angles = Array.from({ length: 150 }, () => rnd() * 1.5); // degrees
  const kr = angles.map((v, i) => ({ t: Math.round((i * F) / 30), value: v, easing: 'hold' }));
  const out = await renderClip(page, { transform: { x: 0, y: 0, scaleX: 1.15, scaleY: 1.15, rotation: 0, flipH: false, flipV: false, crop: { left: 0, top: 0, right: 0, bottom: 0 } }, keyframes: { rotation: kr } }, 5, true);
  const dr: number[] = await page.evaluate(async (b64) => {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const a = await (window as any).__veyra.mediaEngine.analyzeMotion(new File([arr], 'r.mp4'), 320).result;
    return Array.from(a.dr as Float32Array);
  }, out.toString('base64'));
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 1; i < 150; i++) {
    const e = ((angles[i]! - angles[i - 1]!) * Math.PI) / 180;
    sxy += e * dr[i]!; sxx += e * e; syy += dr[i]! * dr[i]!;
  }
  console.log('rotation corr', sxy / Math.sqrt(sxx * syy), 'gain', sxy / sxx, 'rms dr', Math.sqrt(syy / 149));
  let good = 0;
  for (let i = 1; i < 150; i++) {
    const expected = ((angles[i]! - angles[i - 1]!) * Math.PI) / 180;
    if (Math.abs(dr[i]! - expected) < 0.006) good++;
  }
  expect(good / 149).toBeGreaterThan(0.8);
});
