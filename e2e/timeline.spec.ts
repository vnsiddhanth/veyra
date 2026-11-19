/**
 * Phase 4: interactive timeline with real pointer input. Assertions read the project model
 * through the dev-only hook, so they check the edit itself, not just pixels.
 */
import { expect, test, type Page } from '@playwright/test';
import { engineReady, fixture } from './helpers';

type Snap = { tracks: { name: string; clips: { start: number; duration: number; sourceIn: number }[] }[]; markers: number; past: number };
const F = 705_600_000;

async function model(page: Page): Promise<Snap> {
  return page.evaluate(() => {
    const h = (window as any).__veyra.useProjectStore.getState().history;
    const p = h.present;
    return {
      tracks: p.tracks.map((t: any) => ({ name: t.name, clips: t.clipIds.map((id: string) => ({ start: p.clips[id].start, duration: p.clips[id].duration, sourceIn: p.clips[id].sourceIn })) })),
      markers: p.markers.length,
      past: h.past.length,
    };
  });
}
const track = (s: Snap, name: string) => s.tracks.find((t) => t.name === name)!.clips;

async function setup(page: Page) {
  await page.goto('/editor');
  await page.getByRole('button', { name: /New project|Create your first project/ }).first().click();
  await expect(page).toHaveURL(/\/editor\/prj_/);
  await engineReady(page);
  await page.locator('aside[aria-label="Media library"] input[type=file]').setInputFiles([fixture('counter-720p30-5s.mp4'), fixture('counter-480p24-6s.webm')]);
  const cards = page.locator('aside[aria-label="Media library"] ul.grid > li');
  await expect(cards).toHaveCount(2);
  // Zoom to a known scale: 40 px per second.
  await page.evaluate(() => (window as any).__veyra.useEditorUi.getState().setZoom(40));
}

async function appendAll(page: Page) {
  for (const name of ['counter-720p30-5s', 'counter-480p24-6s']) {
    const card = page.locator('aside[aria-label="Media library"] ul.grid > li').filter({ hasText: name });
    await card.getByRole('button', { name, exact: true }).click();
    await card.getByRole('button', { name: 'Append to timeline' }).click();
  }
  await expect(page.locator('[data-clip]')).toHaveCount(2);
}

test('drag a clip to another track and time; one undo restores it', async ({ page }) => {
  await setup(page);
  await appendAll(page);
  const before = await model(page);
  const clip = page.locator('[data-clip]').nth(1);
  const box = (await clip.boundingBox())!;
  await page.mouse.move(box.x + 30, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 30 + 80, box.y + box.height / 2 - 48, { steps: 8 }); // +2 s, one row up
  await page.mouse.up();
  const after = await model(page);
  expect(track(after, 'V2')).toHaveLength(1);
  expect(track(after, 'V2')[0]!.start).toBe(track(before, 'V1')[1]!.start + 2 * F);
  expect(after.past).toBe(before.past + 1);
  await page.keyboard.press('Control+z');
  expect(track(await model(page), 'V1')).toHaveLength(2);
});

test('trim, split at playhead and ripple delete', async ({ page }) => {
  await setup(page);
  await appendAll(page);
  // Trim the end of the first clip by 1 s (40 px).
  const first = page.locator('[data-clip]').first();
  const b = (await first.boundingBox())!;
  await page.mouse.move(b.x + b.width - 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width - 42, b.y + b.height / 2, { steps: 6 });
  await page.mouse.up();
  let m = await model(page);
  expect(track(m, 'V1')[0]!.duration).toBe(4 * F);
  // Playhead to 2 s and split everything under it.
  await page.evaluate((t) => (window as any).__veyra.useEditorUi.getState().setPlayhead(t), 2 * F);
  await page.locator('[aria-label="Timeline tracks"]').click({ position: { x: 5, y: 5 } }).catch(() => undefined);
  await page.keyboard.press('Escape');
  await page.keyboard.press('s');
  m = await model(page);
  expect(track(m, 'V1').map((c) => c.start / F)).toEqual([0, 2, 5]);
  expect(track(m, 'V1')[1]!.sourceIn).toBe(2 * F);
  // Ripple-delete the middle piece: the gap closes.
  await page.locator('[data-clip]').nth(1).click();
  await page.keyboard.press('Shift+Delete');
  m = await model(page);
  // The 2 s gap closes: the last clip moves from 5 s to 3 s.
  expect(track(m, 'V1').map((c) => c.start / F)).toEqual([0, 3]);
});

test('drop media from the library onto a track at the drop position', async ({ page }) => {
  await setup(page);
  const card = page.locator('aside[aria-label="Media library"] ul.grid > li').filter({ hasText: 'counter-480p24-6s' }).locator('[draggable=true]');
  const lane = page.locator('[data-track="V2"] > div').nth(1);
  const lb = (await lane.boundingBox())!;
  await card.dragTo(lane, { targetPosition: { x: 120 - 0, y: lb.height / 2 } });
  const m = await model(page);
  expect(track(m, 'V2')).toHaveLength(1);
  expect(track(m, 'V2')[0]!.start / F).toBeCloseTo(3, 1);
});

test('markers, copy/paste and marquee selection', async ({ page }) => {
  await setup(page);
  await appendAll(page);
  await page.evaluate((t) => (window as any).__veyra.useEditorUi.getState().setPlayhead(t), F);
  await page.keyboard.press('m');
  expect((await model(page)).markers).toBe(1);
  // Marquee from empty space on V2 down across both clips on V1.
  const lane = page.locator('[data-track="V2"] > div').nth(1);
  const lb = (await lane.boundingBox())!;
  await page.mouse.move(lb.x + 10, lb.y + 10);
  await page.mouse.down();
  await page.mouse.move(lb.x + 300, lb.y + lb.height + 30, { steps: 5 });
  await page.mouse.up();
  const sel = await page.evaluate(() => (window as any).__veyra.useEditorUi.getState().selectedClipIds.length);
  expect(sel).toBe(2);
  await page.keyboard.press('Control+c');
  await page.evaluate((t) => (window as any).__veyra.useEditorUi.getState().setPlayhead(t), 20 * F);
  await page.keyboard.press('Control+v');
  const m = await model(page);
  expect(track(m, 'V1').map((c) => c.start / F)).toEqual([0, 5, 20, 25]);
});
