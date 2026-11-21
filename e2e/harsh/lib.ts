/**
 * Harsh-suite harness: load any fixture into any tool, run it, and judge the outcome strictly.
 *
 * Outcomes
 * - ok:      the tool produced output that passed the app's own validation AND every independent check here.
 * - refused: the tool declined the input with a visible, specific message (load error or a disabled run
 *            button with its reason) and nothing crashed.
 * - fail:    anything else — page errors, hangs, a broken or wrong output, a valid input refused, or
 *            garbage accepted.
 */
import { expect, type Download, type Page } from '@playwright/test';
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ALL_FORMATS, BufferSource, EncodedPacketSink, Input } from 'mediabunny';
import type { ToolDef } from '../../src/tools/registry';

export const HARSH_DIR = join(import.meta.dirname, '..', 'fixtures', 'harsh');
export const MANIFEST_PATH = join(HARSH_DIR, 'manifest.json');
export const HAVE_FIXTURES = existsSync(MANIFEST_PATH);

export type Kind = 'video' | 'audio' | 'image' | 'subtitle' | 'broken';
export interface Fx {
  name: string;
  kind: Kind;
  size: number;
  expect: 'ok' | 'either' | 'reject';
  duration?: number;
  width?: number | null;
  height?: number | null;
  rotation?: number;
  fps?: number | null;
  hasVideo?: boolean;
  hasAudio?: boolean;
  channels?: number | null;
}

export const MANIFEST: Fx[] = HAVE_FIXTURES ? JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) : [];
export const fx = (name: string) => MANIFEST.find((f) => f.name === name)!;
export const fxPath = (f: Fx | string) => join(HARSH_DIR, typeof f === 'string' ? f : f.name);

/** Edge inputs where refusing politely is as acceptable as working. */
const EDGE = /oneframe|short_0_3s|tiny_64x36|i_1x1|silent|a_silence/;

// ── Tool specifications ─────────────────────────────────────────────────

type Inputs = 'video' | 'audio-or-video' | 'audio' | 'images' | 'subtitle' | 'any-media' | 'picture';
export interface ToolSpec {
  inputs: Inputs;
  /** How to put the fixture in: primary file input (default), two copies, etc. */
  load?: 'single' | 'pair' | 'images' | 'subtitle-second';
  /** Second input the tool needs (by fixture name), loaded after the primary. */
  second?: string;
  prepare?: (page: Page, f: Fx) => Promise<void>;
  /** Button name when the tool does not use the shared run button. */
  action?: RegExp;
  output: 'media' | 'gif' | 'image' | 'zip' | 'srt' | 'parts' | 'report' | 'scopes';
  duration?: 'same' | ((inSec: number) => number) | 'shorter' | 'any';
  size?: 'same' | 'any' | ((w: number, h: number) => [number, number]);
  audio?: 'keep' | 'none' | 'any';
  video?: 'keep' | 'none';
  fps?: (inFps: number) => number;
  maxBytes?: number;
  /** A refusal that is correct for ordinary inputs (e.g. "No silence found"); must still work on `mustWorkOn`. */
  refusalOk?: RegExp;
  mustWorkOn?: RegExp;
}

const set = async (page: Page, label: string, value: string) => {
  const el = page.getByLabel(label, { exact: true }).first();
  await el.fill(value);
  await el.press('Enter');
};

const scaleTo = (p: number) => (w: number, h: number): [number, number] => (h > w ? [p, Math.round((p * h) / w / 2) * 2] : [Math.round((p * w) / h / 2) * 2, p]);

export const SPECS: Record<string, ToolSpec> = {
  'compress-video': { inputs: 'video', output: 'media', duration: 'same', size: 'same', audio: 'keep' },
  'compress-to-size': { inputs: 'video', output: 'media', duration: 'same', size: 'any', audio: 'keep', maxBytes: 25_000_000 },
  'convert-video': { inputs: 'video', output: 'media', duration: 'same', size: 'same', audio: 'keep' },
  'mp4-converter': { inputs: 'video', output: 'media', duration: 'same', size: 'same', audio: 'keep' },
  'webm-converter': { inputs: 'video', output: 'media', duration: 'same', size: 'same', audio: 'keep' },
  'mov-converter': { inputs: 'video', output: 'media', duration: 'same', size: 'same', audio: 'keep' },
  'video-to-gif': { inputs: 'video', output: 'gif' },
  'video-to-audio': { inputs: 'audio-or-video', output: 'media', duration: 'same', audio: 'keep', video: 'none' },
  'audio-converter': { inputs: 'audio-or-video', output: 'media', duration: 'same', audio: 'keep', video: 'none' },
  'change-frame-rate': { inputs: 'video', output: 'media', duration: 'same', size: 'same', audio: 'keep', fps: (f) => (Math.round(f) === 30 ? 60 : 30) },
  'change-resolution': { inputs: 'video', output: 'media', duration: 'same', size: scaleTo(720), audio: 'keep' },
  'repair-video': { inputs: 'video', output: 'media', duration: 'same', size: 'same', audio: 'keep' },
  'trim-video': {
    inputs: 'video',
    output: 'media',
    action: /^Trim and export$/,
    prepare: async (page, f) => {
      const end = Math.max(0.2, Math.min(2, (f.duration ?? 3) * 0.6));
      await set(page, 'End time in seconds', end.toFixed(2));
    },
    duration: (d) => Math.max(0.2, Math.min(2, d * 0.6)),
    size: 'same',
    audio: 'keep',
  },
  'split-video': { inputs: 'video', output: 'parts', action: /^Split into \d+ parts$/ },
  'merge-videos': { inputs: 'video', load: 'pair', output: 'media', duration: (d) => 2 * d, audio: 'any' },
  'crop-video': {
    inputs: 'video',
    output: 'media',
    prepare: async (page) => {
      await page.getByLabel('Aspect').selectOption('1:1');
    },
    duration: 'same',
    size: (w, h) => [Math.min(w, h) - (Math.min(w, h) % 2), Math.min(w, h) - (Math.min(w, h) % 2)],
    audio: 'keep',
  },
  'resize-video': { inputs: 'video', output: 'media', duration: 'same', size: () => [1920, 1080], audio: 'keep' },
  'rotate-video': { inputs: 'video', output: 'media', duration: 'same', size: (w, h) => [h, w], audio: 'keep' },
  'reverse-video': { inputs: 'video', output: 'media', duration: 'same', size: 'same', audio: 'any' },
  'change-speed': { inputs: 'video', output: 'media', duration: (d) => d / 2, size: 'same', audio: 'any' },
  'aspect-ratio-converter': { inputs: 'video', output: 'media', duration: 'same', size: (w, h) => { const L = Math.max(w, h); return [Math.round((L * 9) / 16 / 2) * 2, L]; }, audio: 'keep' },
  'stabilize-video': {
    inputs: 'video',
    output: 'media',
    prepare: async (page) => {
      await page.getByRole('button', { name: 'Analyse shake' }).click();
    },
    duration: 'same',
    size: 'same',
    audio: 'keep',
  },
  'mute-video': { inputs: 'video', output: 'media', duration: 'same', size: 'same', audio: 'none' },
  'extract-audio': { inputs: 'audio-or-video', output: 'media', duration: 'same', audio: 'keep', video: 'none' },
  'replace-audio': { inputs: 'video', second: 'a_pcm16.wav', output: 'media', duration: 'same', size: 'same', audio: 'keep' },
  'add-audio': { inputs: 'video', second: 'a_pcm16.wav', output: 'media', duration: 'same', size: 'same', audio: 'keep' },
  'remove-silence': { inputs: 'audio-or-video', output: 'media', duration: 'shorter', audio: 'keep', refusalOk: /No silence found|below the threshold/, mustWorkOn: /gappy/ },
  'video-filters': { inputs: 'video', output: 'media', duration: 'same', size: 'same', audio: 'keep' },
  'adjust-colors': { inputs: 'video', output: 'media', duration: 'same', size: 'same', audio: 'keep' },
  'add-text': { inputs: 'video', output: 'media', duration: 'same', size: 'same', audio: 'keep' },
  'add-watermark': {
    inputs: 'video',
    output: 'media',
    prepare: async (page) => {
      await page.getByLabel('Watermark', { exact: true }).selectOption('text');
    },
    duration: 'same',
    size: 'same',
    audio: 'keep',
  },
  'add-transitions': { inputs: 'video', load: 'pair', output: 'media', duration: 'any', audio: 'any' },
  'thumbnail-maker': { inputs: 'video', output: 'image', action: /^Capture frame/ },
  'extract-frames': { inputs: 'video', output: 'zip' },
  'gif-maker': { inputs: 'video', output: 'gif' },
  'slideshow-maker': { inputs: 'images', load: 'images', output: 'media', duration: 'any', size: 'any' },
  'images-to-video': { inputs: 'images', load: 'images', output: 'media', duration: 'any', size: 'any' },
  'subtitle-editor': { inputs: 'subtitle', load: 'subtitle-second', output: 'srt', action: /^Download \.srt$/ },
  'add-subtitles': { inputs: 'video', second: 's_good.srt', output: 'media', duration: 'same', size: 'same', audio: 'keep' },
  'burn-subtitles': { inputs: 'video', second: 's_good.srt', output: 'media', duration: 'same', size: 'same', audio: 'keep' },
  'video-metadata': { inputs: 'any-media', output: 'report' },
  'frame-rate-inspector': { inputs: 'video', output: 'report' },
  'resolution-inspector': { inputs: 'picture', output: 'report' },
  'duration-calculator': { inputs: 'any-media', output: 'report' },
  'audio-metadata': { inputs: 'audio-or-video', output: 'report' },
  'remove-background-noise': { inputs: 'audio-or-video', output: 'media', duration: 'same', audio: 'keep' },
  'normalize-loudness': { inputs: 'audio-or-video', output: 'media', duration: 'same', audio: 'keep' },
  'cinematic-bars': { inputs: 'video', output: 'media', duration: 'same', size: 'same', audio: 'keep' },
  'add-end-credits': { inputs: 'video', output: 'media', duration: (d) => d + 20, size: 'same', audio: 'any' },
  'freeze-frame': { inputs: 'video', output: 'media', duration: (d) => d + 2, size: 'same', audio: 'any' },
  'video-color-scopes': { inputs: 'video', output: 'scopes' },
};

/** Should this fixture work in this tool? 'must' | 'may' | 'must-refuse'. */
export function verdictFor(tool: string, f: Fx): 'must' | 'may' | 'must-refuse' {
  const spec = SPECS[tool]!;
  // A PNG with an .mp4 name is still a PNG: image tools and inspectors sniff content, so using it is fine.
  if (/^x_png_named/.test(f.name) && (spec.inputs === 'images' || spec.inputs === 'picture' || spec.inputs === 'any-media')) return 'may';
  if (f.expect === 'reject') return 'must-refuse';
  // Images have no running time, so the duration calculator may decline them.
  if (tool === 'duration-calculator' && f.kind === 'image') return 'may';
  // Damaged-but-salvageable files (cut off part-way): a tool may use the readable part or refuse.
  if (f.kind === 'broken') return f.expect === 'either' && spec.inputs !== 'images' && spec.inputs !== 'subtitle' && spec.inputs !== 'audio' ? 'may' : 'must-refuse';
  // Muting a video that has no sound may be declined with a clear message (nothing to do).
  if (tool === 'mute-video' && f.kind === 'video' && !f.hasAudio) return 'may';
  const fits =
    spec.inputs === 'video'
      ? f.kind === 'video' && !!f.hasVideo
      : spec.inputs === 'audio-or-video'
        ? (f.kind === 'audio' || f.kind === 'video') && !!f.hasAudio
        : spec.inputs === 'audio'
          ? f.kind === 'audio'
          : spec.inputs === 'images'
            ? f.kind === 'image'
            : spec.inputs === 'subtitle'
              ? f.kind === 'subtitle'
              : spec.inputs === 'picture'
                ? (f.kind === 'video' && !!f.hasVideo) || f.kind === 'image'
                : f.kind === 'video' || f.kind === 'audio' || f.kind === 'image';
  if (!fits) {
    // Media of another kind: a clear refusal is right; some tools may still cope (e.g. images in a video
    // inspector), so working is acceptable but never required.
    return spec.inputs === 'any-media' ? 'may' : 'must-refuse';
  }
  if (f.expect === 'either' || EDGE.test(f.name)) return 'may';
  return 'must';
}

// ── Running a tool ────────────────────────────────────────────────────

export interface Outcome {
  outcome: 'ok' | 'refused' | 'fail';
  detail: string;
  ms: number;
  outputs: string[];
  /** Only some of many outputs were downloaded (browsers throttle long download runs). */
  sampled?: boolean;
}

const alertIn = (page: Page) => page.locator('main [role="alert"]').filter({ hasNotText: /^Report this problem$/ });

async function readyOrRefused(page: Page, spec: ToolSpec): Promise<{ ready: boolean; reason?: string }> {
  const ready = page
    .locator('main [data-run]')
    .or(page.getByRole('button', { name: spec.action ?? /^$/ }))
    .or(page.getByRole('button', { name: 'Analyse shake' }))
    .or(page.locator('main article'))
    .or(page.getByRole('list', { name: 'Subtitle cues' }))
    .or(page.getByRole('img', { name: 'Waveform (luma) of the current frame' }));
  const refused = alertIn(page);
  await expect(ready.or(refused).first()).toBeVisible({ timeout: 60_000 });
  if (await refused.first().isVisible()) return { ready: false, reason: (await refused.first().innerText()).trim() };
  return { ready: true };
}

export async function loadFixture(page: Page, slug: string, f: Fx): Promise<void> {
  const spec = SPECS[slug]!;
  await page.goto(`/tools/${slug}`);
  const inputs = page.locator('main input[type=file]');
  await inputs.first().waitFor({ state: 'attached', timeout: 30_000 });
  const buf = (name: string, as: string) => ({ name: as, mimeType: 'application/octet-stream', buffer: readFileSync(fxPath(name)) });
  if (spec.load === 'pair') await inputs.first().setInputFiles([buf(f.name, `a-${f.name}`), buf(f.name, `b-${f.name}`)]);
  else if (spec.load === 'images') await inputs.first().setInputFiles([buf(f.name, f.name)]);
  else if (spec.load === 'subtitle-second') {
    await page.getByRole('button', { name: 'Choose file' }).nth(1).waitFor();
    await inputs.nth(1).setInputFiles(fxPath(f));
  } else await inputs.first().setInputFiles(fxPath(f));
}

/** Load, prepare, run and collect downloads for one tool with one fixture. */
export async function exercise(page: Page, slug: string, f: Fx, variant?: (page: Page) => Promise<void>, opts: { second?: string } = {}): Promise<Outcome> {
  const spec = { ...SPECS[slug]!, ...(opts.second ? { second: opts.second } : {}) };
  const t0 = Date.now();
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  const done = (outcome: Outcome['outcome'], detail: string, outputs: string[] = []): Outcome => ({
    outcome: pageErrors.length ? 'fail' : outcome,
    detail: pageErrors.length ? `page error: ${pageErrors[0]}` : detail,
    ms: Date.now() - t0,
    outputs,
  });
  try {
    await loadFixture(page, slug, f);
    const first = await readyOrRefused(page, spec);
    if (!first.ready) return done('refused', first.reason!);
    if (spec.second) {
      await page.locator('main input[type=file]').first().setInputFiles(fxPath(spec.second));
      await page.waitForTimeout(1500);
    }
    await spec.prepare?.(page, f).catch(() => undefined);
    await variant?.(page);

    if (spec.output === 'report') {
      await expect(page.locator('main article').first()).toBeVisible({ timeout: 60_000 });
      await expect(page.getByText('Reading file…')).toHaveCount(0, { timeout: 60_000 });
      const problem = page.locator('main article [role="alert"]');
      if (await problem.count()) return done('refused', (await problem.first().innerText()).trim());
      const text = await page.locator('main article').first().innerText();
      // A duration row is short ("clip.m4a 0:04.000"), so a time on its own counts as a report.
      if (text.trim().length < 20 && !/\d:\d\d/.test(text)) return done('fail', 'report is empty');
      return done('ok', 'report shown');
    }
    if (spec.output === 'scopes') {
      await expect(page.getByText(/% clipped highlights/)).toBeVisible({ timeout: 30_000 });
      return done('ok', 'scopes drawn');
    }
    if (spec.output === 'srt') {
      const btn = page.getByRole('button', { name: spec.action! });
      if (await btn.isDisabled()) return done('refused', 'no cues to download');
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), btn.click()]);
      return done('ok', 'subtitles downloaded', [await save(dl)]);
    }

    const run = spec.action ? page.getByRole('button', { name: spec.action }).first() : page.locator('main [data-run]').first();
    // A preparation step (e.g. "Analyse shake") may decline the file with an alert instead of offering a run button.
    await expect(run.or(alertIn(page)).first()).toBeVisible({ timeout: 60_000 });
    if (!(await run.isVisible()) && (await alertIn(page).count())) return done('refused', (await alertIn(page).first().innerText()).trim());
    // Files may still be probing or being analysed; give the button a chance to enable.
    await expect(run).toBeEnabled({ timeout: 20_000 }).catch(() => undefined);
    if (await run.isDisabled()) {
      const reason = (await run.locator('xpath=following-sibling::*[1]').innerText({ timeout: 3_000 }).catch(() => '')).trim() || 'run button disabled';
      return done('refused', reason);
    }
    const alertsBefore = await alertIn(page).count();
    await run.click();
    const success = page
      .getByText('Done · output verified', { exact: true })
      .or(page.getByText(/^Frame captured/))
      .or(page.getByRole('list', { name: 'Parts' }).getByRole('listitem').nth(1));
    const failure = alertIn(page).nth(alertsBefore);
    // Long inputs take longer (reversing 3 minutes in Firefox runs past 4 minutes).
    await expect(success.or(failure).first()).toBeVisible({ timeout: Math.max(240_000, (f.duration ?? 0) * 4_000) });
    if (await failure.isVisible().catch(() => false)) return done('refused', `run failed: ${(await failure.innerText()).trim()}`);

    const outputs: string[] = [];
    const links = page.locator('main').getByRole('link', { name: 'Download' });
    const n = await links.count();
    // Dozens of downloads in a row get throttled by the browser; check the first and last five.
    const picks = n > 20 ? [0, 1, 2, 3, 4, n - 5, n - 4, n - 3, n - 2, n - 1] : [...Array(n).keys()];
    for (const i of picks) outputs.push(await downloadLink(page, links.nth(i)));
    if (!outputs.length) return done('fail', 'reported success but offered nothing to download');
    return { ...done('ok', n > picks.length ? `output produced (${picks.length} of ${n} files checked)` : 'output produced', outputs), sampled: n > picks.length };
  } catch (e) {
    return done('fail', `harness: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
  }
}

/**
 * Save what a Download link points to. Some browser builds show certain types (e.g. WebP in
 * Playwright's Firefox) instead of downloading them; then read the file straight from the link.
 */
async function downloadLink(page: Page, link: ReturnType<Page['locator']>): Promise<string> {
  try {
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), link.click()]);
    return await save(dl);
  } catch (e) {
    const href = await link.getAttribute('href');
    if (!href) throw e;
    const b64 = await page.evaluate(async (u) => {
      const bytes = new Uint8Array(await (await fetch(u)).arrayBuffer());
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(bin);
    }, href);
    const name = (await link.getAttribute('download')) || 'output';
    const dir = join(process.cwd(), 'test-results', 'harsh-outputs');
    mkdirSync(dir, { recursive: true });
    const p = join(dir, `${Date.now()}-${saveSeq++}-${name}`);
    writeFileSync(p, Buffer.from(b64, 'base64'));
    return p;
  }
}

let saveSeq = 0;
async function save(dl: Download): Promise<string> {
  const dir = join(process.cwd(), 'test-results', 'harsh-outputs');
  mkdirSync(dir, { recursive: true });
  const p = join(dir, `${Date.now()}-${saveSeq++}-${dl.suggestedFilename()}`);
  await dl.saveAs(p);
  return p;
}

// ── Independent output checks ───────────────────────────────────────────

export async function probe(path: string) {
  const input = new Input({ source: new BufferSource(readFileSync(path)), formats: ALL_FORMATS });
  try {
    const v = await input.getPrimaryVideoTrack();
    const a = await input.getPrimaryAudioTrack();
    let fps: number | null = null;
    if (v) fps = (await v.computePacketStats(120)).averagePacketRate;
    return {
      mime: await input.getMimeType(),
      duration: await input.computeDuration(),
      video: v ? { codec: v.codec, width: v.displayWidth, height: v.displayHeight, fps } : null,
      audio: a ? { codec: a.codec, sampleRate: a.sampleRate, channels: a.numberOfChannels } : null,
    };
  } finally {
    input.dispose();
  }
}

const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

/** How much of a cut-off file is actually present (last packet whose bytes can be read). */
export async function readableDuration(path: string, only?: 'audio' | 'video'): Promise<number> {
  const input = new Input({ source: new BufferSource(readFileSync(path)), formats: ALL_FORMATS });
  try {
    let end = 0;
    const tracks = await input.getTracks();
    for (const t of tracks) {
      if (only && t.type !== only) continue;
      const sink = new EncodedPacketSink(t);
      for await (const k of sink.packets()) end = Math.max(end, k.timestamp + k.duration);
    }
    // MPEG-TS and similar start their clock above 0; outputs start at 0, so measure from the file's start.
    let start = Infinity;
    for (const t of tracks) start = Math.min(start, await t.getFirstTimestamp());
    return end - (Number.isFinite(start) ? Math.max(0, start) : 0);
  } finally {
    input.dispose();
  }
}

/** Strict checks of a successful run's files. Returns a list of problems (empty = good). */
export async function checkOutputs(slug: string, f: Fx, o: Outcome, extra: Partial<ToolSpec> = {}): Promise<string[]> {
  const spec = { ...SPECS[slug]!, ...extra };
  const problems: string[] = [];
  for (const p of o.outputs) {
    const bytes = readFileSync(p);
    if (bytes.length === 0) {
      problems.push(`${p}: empty file`);
      continue;
    }
    if (spec.maxBytes && bytes.length > spec.maxBytes) problems.push(`size ${bytes.length} exceeds ${spec.maxBytes}`);
    if (spec.output === 'gif') {
      if (bytes.subarray(0, 6).toString('latin1') !== 'GIF89a') problems.push('not a GIF89a file');
      continue;
    }
    if (spec.output === 'image') {
      const sig = bytes.subarray(0, 4).toString('latin1');
      if (!sig.includes('PNG') && !(bytes[0] === 0xff && bytes[1] === 0xd8) && !bytes.subarray(8, 12).toString('latin1').includes('WEBP')) problems.push('not a PNG/JPEG/WebP image');
      continue;
    }
    if (spec.output === 'zip') {
      if (bytes.subarray(0, 2).toString('latin1') !== 'PK') problems.push('not a ZIP file');
      continue;
    }
    if (spec.output === 'srt') {
      if (!bytes.toString('utf8').includes('-->')) problems.push('subtitle file has no cues');
      continue;
    }
    let m: Awaited<ReturnType<typeof probe>>;
    try {
      m = await probe(p);
    } catch (e) {
      problems.push(`output does not parse: ${e instanceof Error ? e.message : e}`);
      continue;
    }
    if (!(m.duration > 0)) problems.push(`duration ${m.duration}`);
    // A cut-off source counts only up to where its data ends; output must not be padded past it.
    // Audio pulled out of a video lasts as long as its soundtrack, which may stop before the picture.
    const inDur =
      (/^x_truncated/.test(f.name)
        ? await readableDuration(fxPath(f))
        : spec.video === 'none' && f.hasVideo && f.hasAudio
          ? await readableDuration(fxPath(f), 'audio')
          : f.duration) ?? 0;
    const fr = f.fps && f.fps > 0 ? f.fps : 30;
    const tol = Math.max(0.15, 3 / fr);
    if (spec.output === 'parts') {
      continue; // summed below
    }
    if (spec.duration === 'same' && inDur > 0 && !near(m.duration, inDur, tol)) problems.push(`duration ${m.duration.toFixed(3)} s, expected ${inDur.toFixed(3)} s`);
    if (typeof spec.duration === 'function' && inDur > 0) {
      const want = spec.duration(inDur);
      if (!near(m.duration, want, Math.max(tol, want * 0.02))) problems.push(`duration ${m.duration.toFixed(3)} s, expected ${want.toFixed(3)} s`);
    }
    if (spec.duration === 'shorter' && inDur > 0 && m.duration > inDur + tol) problems.push(`duration ${m.duration.toFixed(3)} s grew past ${inDur.toFixed(3)} s`);
    if (spec.video === 'none' && m.video) problems.push('has a video track but should be audio only');
    if (spec.video !== 'none' && spec.output === 'media' && f.hasVideo && !m.video && spec.inputs !== 'audio-or-video') problems.push('video track missing');
    if (spec.audio === 'none' && m.audio) problems.push('audio track present but should be removed');
    if (spec.audio === 'keep' && f.hasAudio && !m.audio) problems.push('audio track was lost');
    if (m.video && f.width && f.height && spec.size && spec.size !== 'any') {
      const [w, h] = spec.size === 'same' ? [f.width, f.height] : spec.size(f.width, f.height);
      if (!near(m.video.width, w, 2) || !near(m.video.height, h, 2)) problems.push(`size ${m.video.width}×${m.video.height}, expected ${w}×${h}`);
    }
    // Frame rate is only measurable with several frames, and only meaningful for constant-rate sources.
    if (spec.fps && m.video?.fps && f.fps && (f.duration ?? 0) > 0.5 && !/vfr/.test(f.name)) {
      const want = spec.fps(f.fps);
      if (!near(m.video.fps, want, 1.5)) problems.push(`frame rate ${m.video.fps.toFixed(2)}, expected ${want}`);
    }
  }
  if (spec.output === 'parts') {
    if (o.outputs.length < 2) problems.push(`expected 2 parts, got ${o.outputs.length}`);
    let sum = 0;
    for (const p of o.outputs) sum += (await probe(p).catch(() => ({ duration: 0 }))).duration;
    // A cut can't fall inside a frame: each part may hold its last frame to that frame's natural end,
    // which for variable-rate footage is up to ~1/12 s per frame (allow one slow frame per cut).
    const perCut = /vfr/.test(f.name) ? 0.2 : 0;
    if (f.duration && !o.sampled && !near(sum, f.duration, Math.max(0.2, 3 / (f.fps || 30)) + perCut * (o.outputs.length - 1))) problems.push(`parts add up to ${sum.toFixed(3)} s, expected ${f.duration.toFixed(3)} s`);
  }
  return problems;
}

// ── Results log ─────────────────────────────────────────────────────────

export function record(row: { suite: string; tool: string; fixture: string; variant?: string; verdict: string; outcome: string; pass: boolean; detail: string; ms: number }, project: string) {
  const dir = join(process.cwd(), 'test-results', 'harsh');
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, `${project}-${process.pid}.jsonl`), JSON.stringify({ ...row, project }) + '\n');
}

export function judge(verdict: ReturnType<typeof verdictFor>, o: Outcome, problems: string[], ctx?: { tool: string; fixture: string }): { pass: boolean; why: string } {
  if (o.outcome === 'fail') return { pass: false, why: o.detail };
  const spec = ctx ? SPECS[ctx.tool] : undefined;
  if (verdict === 'must' && o.outcome === 'refused' && spec?.refusalOk?.test(o.detail) && !spec.mustWorkOn?.test(ctx!.fixture)) return { pass: true, why: `refused (correct for this input): ${o.detail}` };
  if (o.outcome === 'ok' && problems.length) return { pass: false, why: `wrong output: ${problems.join('; ')}` };
  if (verdict === 'must' && o.outcome !== 'ok') return { pass: false, why: `refused a valid input: ${o.detail}` };
  if (verdict === 'must-refuse' && o.outcome === 'ok') return { pass: false, why: 'accepted an input it should have refused' };
  if (o.outcome === 'refused' && o.detail.trim().length < 8) return { pass: false, why: `refused without a clear reason ("${o.detail}")` };
  return { pass: true, why: o.outcome === 'ok' ? 'ok' : `refused: ${o.detail}` };
}

export const toolsInSuite = (all: ToolDef[]) => all.filter((t) => SPECS[t.slug]);
export const statSize = (p: string) => statSync(p).size;
