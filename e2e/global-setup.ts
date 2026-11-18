/**
 * Ensures deterministic media fixtures exist in e2e/fixtures/. They are generated in a real
 * browser by the dev-only /dev/fixtures page (Mediabunny + WebCodecs), then cached on disk.
 * Delete the folder to regenerate.
 */
import { chromium, type FullConfig } from '@playwright/test';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const FIXTURES_DIR = join(import.meta.dirname, 'fixtures');
export const FIXTURES = ['counter-720p30-5s.mp4', 'counter-1080p60-3s.mp4', 'counter-480p24-6s.webm'];

export default async function globalSetup(config: FullConfig): Promise<void> {
  mkdirSync(FIXTURES_DIR, { recursive: true });
  const missing = FIXTURES.filter((f) => !existsSync(join(FIXTURES_DIR, f)));
  if (missing.length === 0) return;
  const baseURL = config.projects[0]!.use.baseURL!;
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const page = await browser.newPage();
    await page.goto(`${baseURL}/dev/fixtures`);
    for (const name of missing) {
      await page.locator(`[data-generate="${name}"]`).click();
      const link = page.locator(`[data-fixture="${name}"]`);
      await link.waitFor({ timeout: 60_000 });
      const base64 = await link.evaluate(async (a: HTMLAnchorElement) => {
        const buf = new Uint8Array(await (await fetch(a.href)).arrayBuffer());
        let s = '';
        for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        return btoa(s);
      });
      writeFileSync(join(FIXTURES_DIR, name), Buffer.from(base64, 'base64'));
    }
  } finally {
    await browser.close();
  }
}
