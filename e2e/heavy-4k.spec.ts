/**
 * Heavy-media check: real 4K H.264 at a phone-like bitrate through the most memory-hungry tools,
 * while sampling the browser's resident memory (all of its processes, Linux `ps`; shared pages are
 * counted per process, so this is an upper bound). Runs only when the 4K fixture exists — CI makes
 * it with ffmpeg in .github/workflows/heavy.yml. Results go to test-results/heavy-4k-<project>.json
 * and the GitHub job summary.
 */
import { expect, test, type Page } from '@playwright/test';
import { execSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { chooseFile, fixture, inspectInNode } from './helpers';

const SRC = fixture('heavy-4k.mp4');
const PROC = process.env.HEAVY_PROC_MATCH ?? '';

test.skip(!existsSync(SRC), 'needs e2e/fixtures/heavy-4k.mp4 (made in CI by heavy.yml)');
test.describe.configure({ mode: 'serial', timeout: 45 * 60_000 });

/** Total resident memory (MB) of processes whose command line contains PROC. */
function browserRssMb(): number {
  if (process.platform !== 'linux' || !PROC) return NaN;
  let kb = 0;
  for (const line of execSync('ps -eo rss=,args=', { encoding: 'utf8' }).split('\n')) {
    const m = /^\s*(\d+)\s+(.*)$/.exec(line);
    if (m && m[2]!.includes(PROC) && !m[2]!.includes('node ') && !m[2]!.startsWith('ps ')) kb += Number(m[1]);
  }
  return Math.round(kb / 1024);
}

const results: { tool: string; seconds: number; peakMb: number; baselineMb: number; outputMb: number; outputDuration: number }[] = [];

async function measured(page: Page, tool: string, run: () => Promise<void>): Promise<string> {
  const baselineMb = browserRssMb();
  let peakMb = baselineMb;
  const timer = setInterval(() => (peakMb = Math.max(peakMb, browserRssMb())), 500);
  const t0 = Date.now();
  try {
    await run();
    await expect(page.getByText('Done · output verified', { exact: true }).first()).toBeVisible({ timeout: 40 * 60_000 });
  } finally {
    clearInterval(timer);
  }
  const seconds = Math.round((Date.now() - t0) / 1000);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download' }).first().click()]);
  const out = test.info().outputPath(dl.suggestedFilename());
  await dl.saveAs(out);
  const meta = await inspectInNode(out);
  const r = { tool, seconds, peakMb, baselineMb, outputMb: Math.round(statSync(out).size / 1e6), outputDuration: Math.round(meta.duration * 10) / 10 };
  results.push(r);
  console.log(`[heavy-4k] ${JSON.stringify(r)}`);
  return out;
}

test.afterAll(({}, workerInfo) => {
  const project = workerInfo.project.name;
  mkdirSync('test-results', { recursive: true });
  writeFileSync(`test-results/heavy-4k-${project}.json`, JSON.stringify({ project, source: { mb: Math.round(statSync(SRC).size / 1e6) }, results }, null, 2));
  if (process.env.GITHUB_STEP_SUMMARY) {
    const rows = results.map((r) => `| ${r.tool} | ${r.seconds}s | ${r.baselineMb} MB | **${r.peakMb} MB** | ${r.outputMb} MB, ${r.outputDuration}s |`).join('\n');
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### 4K in ${project}\n\nSource: 3840×2160 H.264, ${Math.round(statSync(SRC).size / 1e6)} MB\n\n| Tool | Time | Browser memory before | Peak | Output |\n|---|---|---|---|---|\n${rows}\n\n`,
    );
  }
});

test('4K: compress keeps 4K and finishes', async ({ page }) => {
  await page.goto('/tools/compress-video');
  await chooseFile(page, SRC);
  const out = await measured(page, 'Compress video (4K → 4K)', () => page.getByRole('button', { name: 'Compress', exact: true }).click());
  expect((await inspectInNode(out)).video).toMatchObject({ width: 3840, height: 2160 });
});

test('4K: rescale to 1080p', async ({ page }) => {
  await page.goto('/tools/change-resolution');
  await chooseFile(page, SRC);
  await page.getByLabel('Resolution').selectOption('1080');
  const out = await measured(page, 'Change resolution (4K → 1080p)', () => page.getByRole('button', { name: 'Rescale' }).click());
  expect((await inspectInNode(out)).video).toMatchObject({ width: 1920, height: 1080 });
});

test('4K: frame-accurate trim of the middle', async ({ page }) => {
  await page.goto('/tools/trim-video');
  await chooseFile(page, SRC);
  await page.getByLabel('Start time in seconds').fill('5');
  await page.getByLabel('Start time in seconds').press('Enter');
  await page.getByLabel('End time in seconds').fill('25');
  await page.getByLabel('End time in seconds').press('Enter');
  const out = await measured(page, 'Trim (20 s of 4K)', () => page.getByRole('button', { name: 'Trim and export' }).click());
  expect(Math.abs((await inspectInNode(out)).duration - 20)).toBeLessThan(0.6);
});

test('4K: merge two 4K files with a crossfade', async ({ page }) => {
  await page.goto('/tools/merge-videos');
  await page.locator('main input[type=file]').first().setInputFiles([SRC, SRC]);
  await page.getByLabel('Transition between clips').selectOption('crossfade');
  await expect(page.getByRole('button', { name: 'Merge videos' })).toBeEnabled({ timeout: 60_000 });
  const out = await measured(page, 'Merge 2 × 4K with crossfade', () => page.getByRole('button', { name: 'Merge videos' }).click());
  expect((await inspectInNode(out)).video?.width).toBe(3840);
});
