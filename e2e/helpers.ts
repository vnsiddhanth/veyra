import { expect, type Page } from '@playwright/test';
import { ALL_FORMATS, BufferSource, Input } from 'mediabunny';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const fixture = (name: string): string => join(import.meta.dirname, 'fixtures', name);

/**
 * Independent check of an output file in Node: Mediabunny demuxes containers without
 * WebCodecs, so this verifies container, tracks, codecs and duration outside the browser.
 */
export async function inspectInNode(path: string) {
  const input = new Input({ source: new BufferSource(readFileSync(path)), formats: ALL_FORMATS });
  try {
    const v = await input.getPrimaryVideoTrack();
    const a = await input.getPrimaryAudioTrack();
    return {
      mime: await input.getMimeType(),
      duration: await input.computeDuration(),
      video: v ? { codec: v.codec, width: v.displayWidth, height: v.displayHeight } : null,
      audio: a ? { codec: a.codec, sampleRate: a.sampleRate, channels: a.numberOfChannels } : null,
    };
  } finally {
    input.dispose();
  }
}

/** Load a file into the tool page's (hidden) file input. */
export async function chooseFile(page: Page, path: string): Promise<void> {
  // Wait until the tool UI (lazy-loaded) is interactive before handing it a file.
  await page.getByRole('button', { name: 'Choose file' }).first().waitFor();
  await page.locator('main input[type=file]').first().setInputFiles(path);
  // The file was taken once the drop zone is gone (a result, an error or the tool controls show).
  await page.getByRole('button', { name: 'Choose file' }).first().waitFor({ state: 'detached', timeout: 30_000 }).catch(() => undefined);
}

/** Wait for the dev-only engine hook. */
export async function engineReady(page: Page): Promise<void> {
  await page.waitForFunction(() => !!(window as unknown as { __veyra?: unknown }).__veyra);
}

/**
 * Average RGB of a 4×4 patch at (8,8) of the frame shown at `t` seconds, decoded by the app's engine.
 * The fixture background hue changes every frame, so this identifies frames.
 */
export async function framePixel(page: Page, bytes: Buffer, name: string, t: number): Promise<number[]> {
  return page.evaluate(
    async ({ b64, name, t }) => {
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const file = new File([arr], name);
      const engine = (window as unknown as { __veyra: { mediaEngine: { extractFrame(f: File, o: object): { result: Promise<{ blob: Blob }> } } } }).__veyra;
      const { blob } = await engine.mediaEngine.extractFrame(file, { timestamp: t, format: 'png', width: 64 }).result;
      const bmp = await createImageBitmap(blob);
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const g = c.getContext('2d')!;
      g.drawImage(bmp, 0, 0);
      const d = g.getImageData(8, 8, 4, 4).data;
      const sum = [0, 0, 0];
      for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) sum[k]! += d[i + k]!;
      return sum.map((v) => Math.round(v / 16));
    },
    { b64: bytes.toString('base64'), name, t },
  );
}

export function expectClose(a: number[], b: number[], tol = 3): void {
  for (let i = 0; i < 3; i++) expect(Math.abs(a[i]! - b[i]!), `channel ${i}: ${a} vs ${b}`).toBeLessThanOrEqual(tol);
}

/** Distance between two colours; used to show neighbouring frames are distinguishable. */
export const colorDistance = (a: number[], b: number[]): number => Math.max(...a.map((v, i) => Math.abs(v - b[i]!)));
