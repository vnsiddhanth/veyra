/**
 * Filmmaking tools: loudness normalisation on export (checked by measuring the exported WAV
 * independently), video scopes and framing guides in the program monitor.
 */
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { LoudnessMeter } from '../src/render/loudness';
import { colorDistance, engineReady, expectClose, fixture, framePixel, inspectInNode } from './helpers';

async function projectWithClip(page: Page) {
  await page.goto('/editor');
  await page.getByRole('button', { name: /New project|Create your first project/ }).first().click();
  await engineReady(page);
  await page.locator('aside[aria-label="Media library"] input[type=file]').setInputFiles(fixture('counter-720p30-5s.mp4'));
  const card = page.locator('aside[aria-label="Media library"] ul.grid > li').first();
  await card.getByRole('button', { name: 'counter-720p30-5s', exact: true }).click();
  await card.getByRole('button', { name: 'Append to timeline' }).click();
  await expect(page.locator('[data-clip]')).toHaveCount(1);
}

/** 16-bit or float PCM WAV → planar stereo floats. */
function readWav(buf: Buffer): { sr: number; l: Float32Array; r: Float32Array } {
  let p = 12;
  let fmt = { format: 1, ch: 2, sr: 48000, bits: 16 };
  while (p < buf.length - 8) {
    const id = buf.toString('ascii', p, p + 4);
    const size = buf.readUInt32LE(p + 4);
    if (id === 'fmt ') fmt = { format: buf.readUInt16LE(p + 8), ch: buf.readUInt16LE(p + 10), sr: buf.readUInt32LE(p + 12), bits: buf.readUInt16LE(p + 22) };
    if (id === 'data') {
      const bytes = fmt.bits / 8;
      const n = Math.floor(size / (bytes * fmt.ch));
      const l = new Float32Array(n);
      const r = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const o = p + 8 + i * bytes * fmt.ch;
        const rd = (k: number) => (fmt.format === 3 ? buf.readFloatLE(o + k * bytes) : buf.readInt16LE(o + k * bytes) / 32768);
        l[i] = rd(0);
        r[i] = fmt.ch > 1 ? rd(1) : l[i]!;
      }
      return { sr: fmt.sr, l, r };
    }
    p += 8 + size + (size & 1);
  }
  throw new Error('no data chunk');
}

test('export normalises loudness to the chosen LUFS target with peaks under −1 dB', async ({ page }) => {
  test.setTimeout(180_000);
  await projectWithClip(page);
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Export video' });
  await dialog.getByLabel('Format').selectOption('wav');
  await dialog.getByLabel('Loudness').selectOption('-23');
  await dialog.getByLabel('File name').fill('loud');
  await dialog.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(dialog.getByText('Done · output verified', { exact: true })).toBeVisible({ timeout: 150_000 });
  const [dl] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('link', { name: 'Download' }).click()]);
  const out = test.info().outputPath('loud.wav');
  await dl.saveAs(out);

  const { sr, l, r } = readWav(readFileSync(out));
  const m = new LoudnessMeter(sr);
  m.add(l, r);
  expect(Math.abs(m.integrated() - -23)).toBeLessThan(0.5);
  expect(m.samplePeakDb()).toBeLessThanOrEqual(-0.9);
  // The result card explains what was done.
  await dialog.getByText('Checks').click().catch(() => undefined);
  await expect(dialog.getByText(/Measured .* LUFS; gain/)).toBeAttached();
});

test('scopes and framing guides draw over the program monitor', async ({ page }) => {
  await projectWithClip(page);
  await page.getByRole('tab', { name: 'program' }).click();
  const monitor = page.getByRole('img', { name: 'Program monitor' });
  await expect(monitor).toBeVisible();
  for (const [value, name] of [
    ['waveform', 'Waveform (luma)'],
    ['parade', 'RGB parade'],
    ['vectorscope', 'Vectorscope'],
    ['histogram', 'Histogram'],
  ]) {
    await page.getByLabel('Video scopes').selectOption(value!);
    const scope = page.getByRole('img', { name: `${name} of the current frame` });
    await expect(scope).toBeVisible();
    // The scope has been drawn from real frame data (not blank).
    await expect
      .poll(() => scope.evaluate((c: HTMLCanvasElement) => {
        const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
        let lit = 0;
        for (let i = 0; i < d.length; i += 4) if (d[i]! + d[i + 1]! + d[i + 2]! > 60) lit++;
        return lit;
      }))
      .toBeGreaterThan(20);
  }
  await expect(page.getByText(/clip \d+\.\d% · crush \d+\.\d%/)).toBeVisible();

  await page.getByLabel('Framing guides').selectOption('2.39');
  // 16:9 project with a 2.39:1 mask: bars of (1 − (16/9)/2.39)/2 ≈ 12.8 % top and bottom.
  const bar = page.locator('section, div').filter({ has: monitor }).locator('div.bg-black\\/75').first();
  const ratio = await bar.evaluate((el) => el.getBoundingClientRect().height / el.parentElement!.getBoundingClientRect().height);
  expect(ratio).toBeGreaterThan(0.12);
  expect(ratio).toBeLessThan(0.135);

  await page.getByLabel('Video scopes').selectOption('off');
  await expect(page.getByRole('img', { name: /of the current frame/ })).toHaveCount(0);
});

test('freeze frame holds the exact frame for 2 s, then the clip continues', async ({ page }) => {
  test.setTimeout(180_000);
  await projectWithClip(page);
  // Playhead to 1 s (frame 30), press F.
  await page.evaluate(() => (window as any).__veyra.useEditorUi.getState().setPlayhead(705_600_000));
  await page.getByRole('button', { name: 'Freeze', exact: true }).click();
  await expect(page.locator('[data-clip]')).toHaveCount(3);
  await expect(page.locator('[data-clip]').filter({ hasText: 'freeze' })).toHaveCount(1);

  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Export video' });
  await dialog.getByLabel('Format').selectOption('mp4');
  await dialog.getByLabel('File name').fill('freeze');
  await dialog.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(dialog.getByText('Done · output verified', { exact: true })).toBeVisible({ timeout: 150_000 });
  const [dl] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('link', { name: 'Download' }).click()]);
  const out = test.info().outputPath('freeze.mp4');
  await dl.saveAs(out);
  const meta = await inspectInNode(out);
  expect(Math.abs(meta.duration - 7)).toBeLessThan(0.1);

  const src = readFileSync(fixture('counter-720p30-5s.mp4'));
  const res = readFileSync(out);
  const at = (b: Buffer, n: string, frame: number) => framePixel(page, b, n, (frame + 0.5) / 30);
  const [s30, s31, o30, o45, o89, o90] = await Promise.all([at(src, 's.mp4', 30), at(src, 's.mp4', 31), at(res, 'o.mp4', 30), at(res, 'o.mp4', 45), at(res, 'o.mp4', 89), at(res, 'o.mp4', 90)]);
  expect(colorDistance(s30, s31)).toBeGreaterThan(3); // neighbouring source frames differ
  expectClose(o30, s30, 6); // freeze starts on source frame 30
  expectClose(o45, s30, 6); // …and holds it
  expectClose(o89, s30, 6); // …until the end of the 2 s hold (frames 30–89)
  expectClose(o90, s30, 6); // then the clip continues from frame 30
});

test('rolling credits move up through the frame at constant speed', async ({ page }) => {
  await projectWithClip(page);
  await page.getByRole('button', { name: '+ Credits' }).click();
  await expect(page.locator('[data-clip][title^="Credits"]')).toHaveCount(1);
  // Measure the credits alone on black: remove the video clip.
  await page.evaluate(() => {
    const { useProjectStore } = (window as any).__veyra;
    useProjectStore.getState().apply((p: any) => {
      const keep = Object.fromEntries(Object.entries<any>(p.clips).filter(([, c]) => c.text));
      return { ...p, clips: keep, tracks: p.tracks.map((t: any) => ({ ...t, clipIds: t.clipIds.filter((id: string) => keep[id]) })), transitions: {} };
    });
  });
  await page.getByRole('tab', { name: 'program' }).click();
  // Render two moments of the 20 s roll and find the vertical centre of the bright text pixels.
  const centreY = async (sec: number) => {
    await page.evaluate(async (s) => {
      const ui = (window as any).__veyra.useEditorUi.getState();
      ui.setPlayhead(Math.round(s * 705_600_000));
      await (window as any).__veyraPreview.settled();
    }, sec);
    return page.evaluate(async () => {
      const e = (window as any).__veyraPreview;
      const ys: number[] = [];
      for (let y = 0.01; y < 1; y += 0.02)
        for (let x = 0.4; x <= 0.6; x += 0.02) {
          const rgb = await e.probe(x, y);
          if (rgb[0] > 110 && rgb[1] > 110 && rgb[2] > 110) {
            ys.push(y);
            break;
          }
        }
      return ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : null;
    });
  };
  const early = await centreY(4);
  const mid = await centreY(10);
  const late = await centreY(16);
  expect(early).not.toBeNull();
  expect(mid).not.toBeNull();
  expect(late).not.toBeNull();
  expect(mid!).toBeLessThan(early!); // moving up…
  expect(late!).toBeLessThan(mid!);
  expect(await centreY(0.05)).toBeNull(); // starts below the frame
  expect(await centreY(19.95)).toBeNull(); // ends above it
});

/** Write a 48 kHz stereo 16-bit WAV. */
function wav(l: Float32Array, r: Float32Array, sr = 48000): Buffer {
  const n = l.length;
  const b = Buffer.alloc(44 + n * 4);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + n * 4, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(2, 22);
  b.writeUInt32LE(sr, 24);
  b.writeUInt32LE(sr * 4, 28);
  b.writeUInt16LE(4, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(l[i]! * 32767))), 44 + i * 4);
    b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(r[i]! * 32767))), 46 + i * 4);
  }
  return b;
}

test('dialogue noise reduction lowers hiss between words, keeps the voice and stays in sync', async ({ page }) => {
  test.setTimeout(180_000);
  const SR = 48000;
  const n = SR * 6;
  const l = new Float32Array(n);
  let seed = 42;
  for (let i = 0; i < n; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const hiss = ((seed / 0x7fffffff) * 2 - 1) * 0.03;
    const on = Math.floor(i / (0.5 * SR)) % 2 === 1; // voice 0.5–1.0 s, 1.5–2.0 s, …
    const t = i / SR;
    const v = on ? 0.3 * (0.6 * Math.sin(2 * Math.PI * 220 * t) + 0.3 * Math.sin(2 * Math.PI * 440 * t) + 0.1 * Math.sin(2 * Math.PI * 660 * t)) : 0;
    l[i] = v + hiss;
  }
  const input = wav(l, l);

  await page.goto('/editor');
  await page.getByRole('button', { name: /New project|Create your first project/ }).first().click();
  await engineReady(page);
  await page.locator('aside[aria-label="Media library"] input[type=file]').setInputFiles({ name: 'dialogue.wav', mimeType: 'audio/wav', buffer: input });
  const card = page.locator('aside[aria-label="Media library"] ul.grid > li').first();
  await card.getByRole('button', { name: 'dialogue', exact: true }).click();
  await card.getByRole('button', { name: 'Append to timeline' }).click();
  await expect(page.locator('[data-clip]')).toHaveCount(1);
  await page.locator('[data-clip]').first().click();
  await page.getByLabel('Add audio effects').selectOption('denoise');
  await expect(page.getByRole('group', { name: 'Noise reduction (dialogue) effect' })).toBeVisible();

  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Export video' });
  await dialog.getByLabel('Format').selectOption('wav');
  await dialog.getByLabel('File name').fill('clean');
  await dialog.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(dialog.getByText('Done · output verified', { exact: true })).toBeVisible({ timeout: 150_000 });
  const [dl] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('link', { name: 'Download' }).click()]);
  const out = test.info().outputPath('clean.wav');
  await dl.saveAs(out);
  const res = readWav(readFileSync(out));

  const rms = (a: Float32Array, s: number, e: number) => {
    let x = 0;
    for (let i = Math.round(s * SR); i < Math.round(e * SR); i++) x += a[i]! * a[i]!;
    return Math.sqrt(x / (Math.round(e * SR) - Math.round(s * SR)));
  };
  const db = (a: number, b: number) => 20 * Math.log10(a / b);
  // Noise-only gap 2.1–2.4 s and voiced section 2.6–2.9 s (well inside, past the learning start).
  const gapDrop = db(rms(res.l, 2.1, 2.4), rms(l, 2.1, 2.4));
  const voiceChange = db(rms(res.l, 2.6, 2.9), rms(l, 2.6, 2.9));
  expect(gapDrop).toBeLessThan(-10);
  expect(Math.abs(voiceChange)).toBeLessThan(2);
  // Sync: the output lines up with the input at lag 0 (not shifted by the processing window).
  const corr = (lag: number) => {
    let s = 0;
    for (let i = Math.round(2.6 * SR); i < Math.round(2.9 * SR); i++) s += res.l[i + lag]! * l[i]!;
    return s;
  };
  const best = [-1024, -768, -512, -256, -64, -1, 0, 1, 64, 256, 512, 768, 1024].reduce((a, b) => (corr(b) > corr(a) ? b : a), 0);
  expect(best).toBe(0);
});

test('hand-off exports FCPXML and EDL of the timeline for DaVinci Resolve and Premiere', async ({ page }) => {
  await projectWithClip(page);
  await page.evaluate(() => (window as any).__veyra.useEditorUi.getState().setPlayhead(705_600_000));
  await page.getByRole('button', { name: 'Split', exact: true }).click();
  await page.getByRole('button', { name: '+ Title' }).click();
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Export video' });
  await dialog.getByText('Send the timeline to DaVinci Resolve, Premiere or Final Cut').click();
  await dialog.getByLabel('Media folder').fill(String.raw`D:\Footage`);

  const [x] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: /Download FCPXML/ }).click()]);
  expect(x.suggestedFilename()).toMatch(/\.fcpxml$/);
  const xml = readFileSync(await x.path(), 'utf8');
  expect(xml).toContain('<fcpxml version="1.9">');
  expect(xml).toContain('src="file:///D:/Footage/counter-720p30-5s.mp4"');
  expect((xml.match(/<asset-clip /g) ?? []).length).toBe(2); // the split clip
  expect(xml).toMatch(/<title ref="r\d+" lane="\d+"/);
  // The browser itself parses it as XML without errors.
  const parsed = await page.evaluate((s) => {
    const d = new DOMParser().parseFromString(s, 'application/xml');
    return { error: !!d.querySelector('parsererror'), clips: d.querySelectorAll('spine > asset-clip').length };
  }, xml);
  expect(parsed).toEqual({ error: false, clips: 2 });
  await expect(dialog.getByRole('status').filter({ hasText: 'Downloaded' })).toBeVisible();

  const [e] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: /Download EDL/ }).click()]);
  const edl = readFileSync(await e.path(), 'utf8');
  expect(edl).toMatch(/^TITLE: /);
  expect(edl).toContain('001  AX       B     C        00:00:00:00 00:00:01:00 01:00:00:00 01:00:01:00');
  expect(edl).toContain('002  AX       B     C        00:00:01:00 00:00:05:00 01:00:01:00 01:00:05:00');
});

test.describe('film tools', () => {
  const SRC = fixture('counter-720p30-5s.mp4');
  async function runTool(page: Page, slug: string, action: string, setup?: () => Promise<void>) {
    await page.goto(`/tools/${slug}`);
    await page.getByRole('button', { name: 'Choose file' }).first().waitFor();
    await page.locator('main input[type=file]').first().setInputFiles(SRC);
    await setup?.();
    await page.getByRole('button', { name: action, exact: true }).click();
    await expect(page.getByText('Done · output verified', { exact: true })).toBeVisible({ timeout: 120_000 });
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download' }).first().click()]);
    const out = test.info().outputPath(dl.suggestedFilename());
    await dl.saveAs(out);
    return out;
  }

  test('cinematic bars keep the size and black out top and bottom', async ({ page }) => {
    const out = await runTool(page, 'cinematic-bars', 'Add bars');
    expect((await inspectInNode(out)).video).toMatchObject({ width: 1280, height: 720 });
    await engineReady(page);
    // 2.39:1 in 16:9 → bars of ~12.8 % (92 px) top and bottom; the picture between them is untouched.
    const rows = await page.evaluate(async (b64) => {
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const engine = (window as any).__veyra;
      const { blob } = await engine.mediaEngine.extractFrame(new File([arr], 'o.mp4'), { timestamp: 1, format: 'png' }).result;
      const bmp = await createImageBitmap(blob);
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const g = c.getContext('2d')!;
      g.drawImage(bmp, 0, 0);
      const at = (y: number) => {
        const d = g.getImageData(0, y, bmp.width, 1).data;
        let m = 0;
        for (let i = 0; i < d.length; i += 4) m = Math.max(m, d[i]!, d[i + 1]!, d[i + 2]!);
        return m;
      };
      return { top: at(40), bottom: at(bmp.height - 40), middle: at(Math.round(bmp.height / 2)), edge: at(100) };
    }, readFileSync(out).toString('base64'));
    expect(rows.top).toBeLessThan(20);
    expect(rows.bottom).toBeLessThan(20);
    expect(rows.edge).toBeGreaterThan(40); // just inside the 92 px bar, the picture shows
    expect(rows.middle).toBeGreaterThan(40);
  });

  test('freeze frame tool adds the hold to the length', async ({ page }) => {
    const out = await runTool(page, 'freeze-frame', 'Freeze this frame', async () => {
      await page.locator('[tabindex="0"]').filter({ has: page.locator('video') }).focus();
      for (let i = 0; i < 30; i++) await page.keyboard.press('ArrowRight');
    });
    expect(Math.abs((await inspectInNode(out)).duration - 7)).toBeLessThan(0.1);
  });

  test('end credits tool appends the roll after the video', async ({ page }) => {
    const out = await runTool(page, 'add-end-credits', 'Add credits', async () => {
      await page.getByLabel('Roll length').fill('8');
      await page.getByLabel('Roll length').press('Enter');
    });
    expect(Math.abs((await inspectInNode(out)).duration - 13)).toBeLessThan(0.1);
  });

  test('loudness tool reports what it measured', async ({ page }) => {
    await runTool(page, 'normalize-loudness', 'Normalize loudness');
    await expect(page.getByText(/Measured .* LUFS; gain/)).toBeAttached();
  });

  test('noise removal tool renders a verified file', async ({ page }) => {
    const out = await runTool(page, 'remove-background-noise', 'Remove noise');
    const meta = await inspectInNode(out);
    expect(meta.audio).not.toBeNull();
    expect(Math.abs(meta.duration - 5)).toBeLessThan(0.1);
  });
});
