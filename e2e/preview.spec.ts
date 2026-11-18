/**
 * Phase 5: the program monitor shows the composed timeline. Pixel probes read the preview
 * worker's canvas and compare with frames decoded independently from the source.
 */
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { engineReady, expectClose, fixture, framePixel } from './helpers';

const F = 705_600_000;

async function newProjectWith(page: Page, files: string[]) {
  await page.goto('/editor');
  await page.getByRole('button', { name: /New project|Create your first project/ }).first().click();
  await expect(page).toHaveURL(/\/editor\/prj_/);
  await engineReady(page);
  await page.locator('aside[aria-label="Media library"] input[type=file]').setInputFiles(files.map(fixture));
  await expect(page.locator('aside[aria-label="Media library"] ul.grid > li')).toHaveCount(files.length);
}

async function append(page: Page, name: string) {
  const card = page.locator('aside[aria-label="Media library"] ul.grid > li').filter({ hasText: name });
  await card.getByRole('button', { name, exact: true }).click();
  await card.getByRole('button', { name: 'Append to timeline' }).click();
}

async function showAt(page: Page, t: number) {
  await page.getByRole('tab', { name: 'program' }).click();
  await page.evaluate((x) => (window as any).__veyra.useEditorUi.getState().setPlayhead(x), t);
  await page.waitForTimeout(150);
  await page.evaluate(() => (window as any).__veyraPreview.settled());
}
const probe = (page: Page, x: number, y: number): Promise<number[]> => page.evaluate(([a, b]) => (window as any).__veyraPreview.probe(a, b), [x, y]);

test('program monitor shows the exact timeline frame at the playhead', async ({ page }) => {
  await newProjectWith(page, ['counter-720p30-5s.mp4']);
  await append(page, 'counter-720p30-5s');
  const src = readFileSync(fixture('counter-720p30-5s.mp4'));
  for (const frame of [0, 45, 149]) {
    await showAt(page, (frame * F) / 30);
    const got = await probe(page, 10 / 64, 10 / 36);
    const want = await framePixel(page, src, 's.mp4', (frame + 0.5) / 30);
    expectClose(got, want, 8);
  }
  // Trim the clip's start in the model: the frame at 0 now comes from source 1 s.
  await page.evaluate(() => {
    const { useProjectStore } = (window as any).__veyra;
    useProjectStore.getState().apply((p: any) => {
      const id = Object.keys(p.clips)[0] as string;
      const c = p.clips[id];
      return { ...p, clips: { ...p.clips, [id]: { ...c, sourceIn: 705_600_000, duration: c.duration - 705_600_000 } } };
    });
  });
  await showAt(page, 0);
  expectClose(await probe(page, 10 / 64, 10 / 36), await framePixel(page, src, 's.mp4', 30.5 / 30), 8);
});

test('playback advances in real time with sound and reports its frame rate', async ({ page }) => {
  await newProjectWith(page, ['counter-1080p60-3s.mp4', 'counter-720p30-5s.mp4']);
  await append(page, 'counter-1080p60-3s');
  // Second layer: put the 720p clip on V2 above the 1080p clip, scaled down (picture-in-picture).
  await page.evaluate(() => {
    const { useProjectStore } = (window as any).__veyra;
    useProjectStore.getState().apply((p: any) => {
      const v2 = p.tracks.find((t: any) => t.name === 'V2');
      const asset = p.assets.find((a: any) => a.name.startsWith('counter-720p30'));
      const id = 'clp_pip';
      const clip = {
        id, trackId: v2.id, assetId: asset.id, start: 0, duration: 3 * 705_600_000, sourceIn: 0, speed: 1, reversed: false,
        transform: { x: 400, y: 200, scaleX: 0.4, scaleY: 0.4, rotation: 0, flipH: false, flipV: false, crop: { left: 0, top: 0, right: 0, bottom: 0 } },
        opacity: 1, blendMode: 'normal', effects: [], keyframes: {}, audio: { gain: 1, pan: 0, fadeIn: 0, fadeOut: 0 }, text: null, name: 'pip',
      };
      return { ...p, clips: { ...p.clips, [id]: clip }, tracks: p.tracks.map((t: any) => (t.id === v2.id ? { ...t, clipIds: [id] } : t)) };
    });
  });
  await page.getByRole('tab', { name: 'program' }).click();
  await page.getByLabel('Preview quality').selectOption('1');
  await page.evaluate(() => (window as any).__veyra.useEditorUi.getState().setPlayhead(0));
  await page.keyboard.press('Escape');
  const t0 = Date.now();
  await page.getByRole('button', { name: /^Play/ }).click();
  await page.waitForTimeout(2000);
  const stats = await page.locator('[title^="Frames shown per second"]').textContent();
  const playhead = await page.evaluate(() => (window as any).__veyra.useEditorUi.getState().playhead / 705_600_000);
  const elapsed = (Date.now() - t0) / 1000;
  test.info().annotations.push({ type: 'preview-1080p60-two-layer', description: `${stats} (playhead ${playhead.toFixed(2)} s after ${elapsed.toFixed(2)} s)` });
  console.log('preview stats:', stats, 'playhead', playhead.toFixed(2));
  expect(playhead).toBeGreaterThan(1.5);
  expect(playhead).toBeLessThan(elapsed + 0.1);
  const fps = Number(/^(\d+) fps/.exec(stats ?? '')?.[1] ?? 0);
  expect(fps).toBeGreaterThanOrEqual(24);
  // Stops at the end.
  await expect(page.getByRole('button', { name: /^Play/ })).toBeVisible({ timeout: 5000 });
});
