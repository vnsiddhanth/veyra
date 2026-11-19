/** Drag-and-drop reordering: tool lists (mouse + keyboard), media library, timeline Rearrange. */
import { expect, test, type Page } from '@playwright/test';
import { engineReady, fixture } from './helpers';

const F = 705_600_000;
const names = (page: Page) => page.getByRole('list', { name: /reorderable/ }).getByRole('listitem').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')!.split(',')[0]));

test('tool list: drag with the mouse, move with the keyboard, and sort', async ({ page }) => {
  await page.goto('/tools/merge-videos');
  await page.getByRole('button', { name: 'Choose videos' }).waitFor();
  await page.locator('main input[type=file]').first().setInputFiles(['counter-720p30-5s.mp4', 'counter-480p24-6s.webm', 'counter-1080p60-3s.mp4'].map(fixture));
  await expect(page.getByRole('list', { name: /reorderable/ }).getByRole('listitem')).toHaveCount(3);
  expect(await names(page)).toEqual(['counter-720p30-5s.mp4', 'counter-480p24-6s.webm', 'counter-1080p60-3s.mp4']);

  // Mouse: drag the third tile onto the first.
  const items = page.getByRole('list', { name: /reorderable/ }).getByRole('listitem');
  const from = (await items.nth(2).locator('p').first().boundingBox())!;
  const to = (await items.nth(0).boundingBox())!;
  await page.mouse.move(from.x + 10, from.y + 5);
  await page.mouse.down();
  await page.mouse.move(to.x + 20, to.y + to.height / 2, { steps: 12 });
  await page.mouse.up();
  expect(await names(page)).toEqual(['counter-1080p60-3s.mp4', 'counter-720p30-5s.mp4', 'counter-480p24-6s.webm']);

  // Keyboard: pick up the first, move right twice, drop.
  await items.nth(0).focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Space');
  expect(await names(page)).toEqual(['counter-720p30-5s.mp4', 'counter-480p24-6s.webm', 'counter-1080p60-3s.mp4']);
  await expect(page.locator('[aria-live="assertive"]')).toContainText('Dropped counter-1080p60-3s.mp4 at position 3 of 3');

  // Alt+arrow moves one step directly; Sort A→Z restores natural name order.
  await page.getByRole('list', { name: /reorderable/ }).getByRole('listitem').nth(2).focus();
  await page.keyboard.press('Alt+ArrowLeft');
  expect((await names(page))[1]).toBe('counter-1080p60-3s.mp4');
  // Natural order: numbers compare by value, so 480 < 720 < 1080.
  await page.getByRole('button', { name: 'Sort A→Z' }).click();
  expect(await names(page)).toEqual(['counter-480p24-6s.webm', 'counter-720p30-5s.mp4', 'counter-1080p60-3s.mp4']);
});

async function editorWith(page: Page, files: string[]) {
  await page.goto('/editor');
  await page.getByRole('button', { name: /New project|Create your first project/ }).first().click();
  await engineReady(page);
  await page.locator('aside[aria-label="Media library"] input[type=file]').setInputFiles(files.map(fixture));
  await expect(page.locator('aside[aria-label="Media library"] ul.grid > li')).toHaveCount(files.length);
}
const assetOrder = (page: Page) => page.evaluate(() => (window as any).__veyra.useProjectStore.getState().history.present.assets.map((a: any) => a.name));

test('media library: drag a card onto another to change "My order"; Alt+arrow too', async ({ page }) => {
  await editorWith(page, ['counter-720p30-5s.mp4', 'counter-480p24-6s.webm']);
  // Imports finish in any order; read the current order from the model.
  const before: string[] = await assetOrder(page);
  const cards = page.locator('aside[aria-label="Media library"] ul.grid > li [draggable=true]');
  await cards.nth(1).dragTo(cards.nth(0), { targetPosition: { x: 5, y: 20 } });
  expect(await assetOrder(page)).toEqual([before[1], before[0]]);
  await page.getByRole('button', { name: before[1]!, exact: true }).focus();
  await page.keyboard.press('Alt+ArrowRight');
  expect(await assetOrder(page)).toEqual(before);
});

test('timeline Rearrange: drag the last clip to the front; others make room; one undo', async ({ page }) => {
  await editorWith(page, ['counter-720p30-5s.mp4']);
  const card = page.locator('aside[aria-label="Media library"] ul.grid > li').first();
  await card.getByRole('button', { name: 'counter-720p30-5s', exact: true }).click();
  for (let i = 0; i < 3; i++) await card.getByRole('button', { name: 'Append to timeline' }).click();
  await expect(page.locator('[data-clip]')).toHaveCount(3);
  await page.evaluate(() => (window as any).__veyra.useEditorUi.getState().setZoom(40));
  const ids: string[] = await page.evaluate(() => {
    const p = (window as any).__veyra.useProjectStore.getState().history.present;
    return p.tracks.find((t: any) => t.name === 'V1').clipIds;
  });
  await page.getByRole('button', { name: 'Rearrange' }).click();
  const last = (await page.locator(`[data-clip="${ids[2]}"]`).boundingBox())!;
  const first = (await page.locator(`[data-clip="${ids[0]}"]`).boundingBox())!;
  await page.mouse.move(last.x + 30, last.y + last.height / 2);
  await page.mouse.down();
  await page.mouse.move(first.x + 5, first.y + first.height / 2, { steps: 10 });
  await page.mouse.up();
  const starts = await page.evaluate((ids) => {
    const p = (window as any).__veyra.useProjectStore.getState().history.present;
    return ids.map((id: string) => p.clips[id].start / 705_600_000);
  }, ids);
  expect(starts).toEqual([5, 10, 0]);
  await page.keyboard.press('Control+z');
  const undone = await page.evaluate((ids) => ids.map((id: string) => (window as any).__veyra.useProjectStore.getState().history.present.clips[id].start / 705_600_000), ids);
  expect(undone).toEqual([0, 5, 10]);
  void F;
});

test('merge page: files dropped anywhere on the page are added; unusable files are explained', async ({ page }) => {
  await page.goto('/tools/merge-videos');
  await page.getByRole('button', { name: 'Choose videos' }).waitFor();
  // Drop two videos and one non-video on the page heading (outside the drop zone).
  const dt = await page.evaluateHandle(async () => {
    const d = new DataTransfer();
    for (const n of ['counter-720p30-5s.mp4', 'counter-480p24-6s.webm']) {
      const b = await (await fetch('/e2e/fixtures/' + n)).blob();
      d.items.add(new File([b], n, { type: b.type }));
    }
    d.items.add(new File(['not a video'], 'notes.txt', { type: 'text/plain' }));
    return d;
  });
  const h1 = page.getByRole('heading', { level: 1 });
  await h1.dispatchEvent('dragenter', { dataTransfer: dt });
  await h1.dispatchEvent('dragover', { dataTransfer: dt });
  await h1.dispatchEvent('drop', { dataTransfer: dt });
  await expect(page.getByRole('list', { name: /reorderable/ }).getByRole('listitem')).toHaveCount(3);
  const alert = page.getByRole('alert').filter({ hasText: 'can’t be used' });
  await expect(alert).toContainText('notes.txt');
  await alert.getByRole('button', { name: 'Remove them' }).click();
  await expect(page.getByRole('list', { name: /reorderable/ }).getByRole('listitem')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Merge videos' })).toBeEnabled();
});
