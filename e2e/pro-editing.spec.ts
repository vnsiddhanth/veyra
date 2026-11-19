/** Phase 6: inspector, keyframes, effects, mixer, subtitles. */
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { chooseFile, engineReady, fixture, inspectInNode } from './helpers';

const F = 705_600_000;
const present = (page: Page) => page.evaluate(() => (window as any).__veyra.useProjectStore.getState().history.present);

async function editorWithClip(page: Page) {
  await page.goto('/editor');
  await page.getByRole('button', { name: /New project|Create your first project/ }).first().click();
  await engineReady(page);
  await page.locator('aside[aria-label="Media library"] input[type=file]').setInputFiles(fixture('counter-720p30-5s.mp4'));
  const card = page.locator('aside[aria-label="Media library"] ul.grid > li').first();
  await card.getByRole('button', { name: 'counter-720p30-5s', exact: true }).click();
  await card.getByRole('button', { name: 'Append to timeline' }).click();
  await page.locator('[data-clip]').first().click();
}

test('inspector: keyframed opacity, effects stack and preview reflect edits', async ({ page }) => {
  await editorWithClip(page);
  const insp = page.locator('aside[aria-label="Inspector"]');
  // Keyframe opacity: 1 at 0 s, 0 at 2 s.
  await page.evaluate(() => (window as any).__veyra.useEditorUi.getState().setPlayhead(0));
  await insp.getByRole('button', { name: 'Add Opacity keyframe at playhead' }).click();
  await page.evaluate((t) => (window as any).__veyra.useEditorUi.getState().setPlayhead(t), 2 * F);
  await insp.getByLabel('Opacity', { exact: true }).fill('0');
  let p = await present(page);
  const clip = Object.values<any>(p.clips)[0];
  expect(clip.keyframes.opacity.map((k: any) => [k.t / F, k.value])).toEqual([
    [0, 1],
    [2, 0],
  ]);
  // Preview at 2 s must be the black background (opacity 0).
  await page.getByRole('tab', { name: 'program' }).click();
  await page.waitForTimeout(200);
  await page.evaluate(() => (window as any).__veyraPreview.settled());
  const rgb = await page.evaluate(() => (window as any).__veyraPreview.probe(0.15, 0.25));
  expect(Math.max(...rgb)).toBeLessThan(6);
  // One undo removes the value change, a second the keyframe.
  await page.keyboard.press('Control+z');
  p = await present(page);
  expect(Object.values<any>(p.clips)[0].keyframes.opacity).toHaveLength(1);

  // Add a blur effect from the stack menu, then disable it.
  await insp.getByLabel('Add effects').selectOption('blur');
  p = await present(page);
  expect(Object.values<any>(p.clips)[0].effects.map((e: any) => e.type)).toContain('blur');
  await insp.getByLabel('Enable Gaussian blur').uncheck();
  p = await present(page);
  expect(Object.values<any>(p.clips)[0].effects.find((e: any) => e.type === 'blur').enabled).toBe(false);
});

test('mixer volume and solo update the model', async ({ page }) => {
  await editorWithClip(page);
  await page.locator('[aria-label="Timeline tracks"]').hover();
  await page.keyboard.press('Escape');
  const mixer = page.getByRole('list', { name: 'Track mixer' });
  await mixer.getByLabel('V1 volume').fill('0.5');
  await mixer.getByRole('button', { name: 'Solo A1' }).click();
  const p = await present(page);
  expect(p.tracks.find((t: any) => t.name === 'V1').volume).toBe(0.5);
  expect(p.tracks.find((t: any) => t.name === 'A1').solo).toBe(true);
});

test('add soft subtitles muxes a WebVTT track without re-encoding', async ({ page }) => {
  await page.goto('/tools/add-subtitles');
  await chooseFile(page, fixture('counter-720p30-5s.mp4'));
  await page.locator('main input[type=file]').first().setInputFiles(fixture('sample.srt'));
  await expect(page.getByText('2 cues ready')).toBeVisible();
  await page.getByRole('button', { name: 'Add subtitle track' }).click();
  await expect(page.getByText('Done · output verified', { exact: true })).toBeVisible({ timeout: 60_000 });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download' }).click()]);
  const out = test.info().outputPath('subbed.mp4');
  await dl.saveAs(out);
  const bytes = readFileSync(out);
  expect(bytes.includes(Buffer.from('wvtt'))).toBe(true);
  const meta = await inspectInNode(out);
  expect(meta.video?.codec).toBe('avc');
  expect(meta.audio?.codec).toBe('aac');
});

test('subtitle editor edits timing and exports a valid SRT', async ({ page }) => {
  await page.goto('/tools/subtitle-editor');
  await page.getByRole('button', { name: 'Choose file' }).nth(1).waitFor();
  await page.locator('main input[type=file]').nth(1).setInputFiles(fixture('sample.srt'));
  await expect(page.getByRole('list', { name: 'Subtitle cues' }).getByRole('listitem')).toHaveCount(2);
  await page.getByLabel('Cue 2 text').fill('Edited');
  await page.getByLabel('Shift all cues by (s)').fill('1');
  await page.getByRole('button', { name: 'Shift', exact: true }).click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download .srt' }).click()]);
  const out = test.info().outputPath('out.srt');
  await dl.saveAs(out);
  const text = readFileSync(out, 'utf8');
  expect(text).toContain('00:00:01,500 --> 00:00:03,000');
  expect(text).toContain('Edited');
});
