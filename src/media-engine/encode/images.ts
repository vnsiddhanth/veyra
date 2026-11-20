/**
 * Image-sequence outputs: animated GIF (from a video or from stills) and a ZIP of extracted frames.
 * Runs in the media worker. Outputs are re-read and checked before they are returned.
 */
import { applyPalette, GIFEncoder, quantize } from 'gifenc';
import { CanvasSink } from 'mediabunny';
import { MediaError } from '../core/errors';
import type { FileResult, FramesOptions, GifImagesOptions, GifOptions, ValidationCheck } from '../core/types';
import { frameRateOf, mediaRange, openInput } from '../import/probe';
import { createScratchFile, deleteScratchFile } from './output-store';
import { readStoredZip, ZipWriter } from './zip';

import { MAX_GIF_FRAMES, MAX_ZIP_FRAMES } from '../core/limits';

const safeName = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').trim().slice(0, 120) || 'output';

async function validateGif(blob: Blob, expectFrames: number, w: number, h: number): Promise<ValidationCheck[]> {
  const checks: ValidationCheck[] = [];
  const head = new Uint8Array(await blob.slice(0, 10).arrayBuffer());
  const sig = String.fromCharCode(...head.subarray(0, 6));
  const gw = head[6]! | (head[7]! << 8);
  const gh = head[8]! | (head[9]! << 8);
  checks.push({ name: 'Format', ok: sig === 'GIF89a', detail: sig });
  checks.push({ name: 'Size', ok: gw === w && gh === h, detail: `${gw}×${gh}` });
  const Decoder = (globalThis as { ImageDecoder?: typeof ImageDecoder }).ImageDecoder;
  if (Decoder) {
    const dec = new Decoder({ data: await blob.arrayBuffer(), type: 'image/gif' });
    try {
      await dec.tracks.ready;
      const count = dec.tracks.selectedTrack?.frameCount ?? 0;
      checks.push({ name: 'Frames', ok: count === expectFrames, detail: `${count} (expected ${expectFrames})` });
      const first = await dec.decode({ frameIndex: 0 });
      const last = await dec.decode({ frameIndex: Math.max(0, count - 1) });
      checks.push({ name: 'Decodes', ok: true, detail: `first and last frame decode (${first.image.displayWidth}×${first.image.displayHeight})` });
      first.image.close();
      last.image.close();
    } catch (e) {
      checks.push({ name: 'Decodes', ok: false, detail: String(e) });
    } finally {
      dec.close();
    }
  } else {
    try {
      const bmp = await createImageBitmap(blob);
      checks.push({ name: 'Decodes', ok: bmp.width === w, detail: `first frame ${bmp.width}×${bmp.height}` });
      bmp.close();
    } catch (e) {
      checks.push({ name: 'Decodes', ok: false, detail: String(e) });
    }
  }
  return checks;
}

function finishGif(gif: ReturnType<typeof GIFEncoder>, fileName: string): File {
  gif.finish();
  const bytes = gif.bytes();
  return new File([bytes as Uint8Array<ArrayBuffer>], `${safeName(fileName)}.gif`, { type: 'image/gif' });
}

function encodeFrame(gif: ReturnType<typeof GIFEncoder>, rgba: Uint8ClampedArray, w: number, h: number, colors: number, delay: number, repeat: number) {
  const palette = quantize(rgba, colors, { format: 'rgb565' });
  const index = applyPalette(rgba, palette, 'rgb565');
  gif.writeFrame(index, w, h, { palette, delay, repeat });
}

export async function videoToGif(file: Blob, o: GifOptions, onProgress: (p: number) => void, signal: AbortSignal): Promise<FileResult> {
  const started = performance.now();
  const input = openInput(file);
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new MediaError('no-tracks', 'This file has no video track.');
    if (!(await track.canDecode())) throw new MediaError('unsupported-codec', 'This browser cannot decode the video.');
    const range = await mediaRange(input);
    const t0 = range.start;
    const dur = Math.min(await track.computeDuration(), range.end) - t0;
    const start = Math.max(0, o.start ?? 0);
    const end = Math.min(dur, o.end ?? dur);
    const fps = Math.max(1, Math.min(50, o.fps));
    const count = Math.floor((end - start) * fps + 1e-6);
    if (count < 1) throw new MediaError('not-media', 'The selected range is shorter than one GIF frame.');
    if (count > MAX_GIF_FRAMES) {
      throw new MediaError('too-large', `That would be ${count} frames. GIFs are limited to ${MAX_GIF_FRAMES} frames here — shorten the range or lower the frame rate.`);
    }
    const w = Math.max(16, Math.round(o.width / 2) * 2);
    const h = Math.max(16, Math.round((w * track.displayHeight) / track.displayWidth / 2) * 2);
    const sink = new CanvasSink(track, { width: w, height: h, fit: 'fill', poolSize: 2 });
    const times = Array.from({ length: count }, (_, i) => t0 + start + i / fps);
    const delay = Math.max(20, Math.round(1000 / fps / (o.speed ?? 1) / 10) * 10);
    const gif = GIFEncoder();
    let i = 0;
    for await (const wc of sink.canvasesAtTimestamps(times)) {
      if (signal.aborted) throw new MediaError('cancelled', 'Cancelled.');
      if (!wc) continue;
      const ctx = (wc.canvas as OffscreenCanvas).getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;
      const { data } = ctx.getImageData(0, 0, w, h);
      encodeFrame(gif, data, w, h, o.colors, delay, o.repeat);
      i++;
      onProgress((i / count) * 0.95);
    }
    const out = finishGif(gif, o.fileName);
    const checks = await validateGif(out, i, w, h);
    if (checks.some((c) => !c.ok)) throw new MediaError('validation-failed', `The GIF failed validation: ${checks.filter((c) => !c.ok).map((c) => c.detail).join('; ')}`);
    onProgress(1);
    return { file: out, storage: 'memory', scratchName: null, checks, summary: `${w}×${h} · ${i} frames · ${fps} fps`, elapsedMs: Math.round(performance.now() - started) };
  } finally {
    input.dispose();
  }
}

export async function imagesToGif(files: Blob[], o: GifImagesOptions, onProgress: (p: number) => void, signal: AbortSignal): Promise<FileResult> {
  const started = performance.now();
  if (files.length === 0) throw new MediaError('not-media', 'Add at least one image.');
  if (files.length > MAX_GIF_FRAMES) throw new MediaError('too-large', `At most ${MAX_GIF_FRAMES} images per GIF.`);
  const w = Math.max(16, Math.round(o.width));
  const h = Math.max(16, Math.round(o.height));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const gif = GIFEncoder();
  const delay = Math.max(20, Math.round(o.delay / 10) * 10);
  for (let i = 0; i < files.length; i++) {
    if (signal.aborted) throw new MediaError('cancelled', 'Cancelled.');
    let bmp: ImageBitmap;
    try {
      bmp = await createImageBitmap(files[i]!);
    } catch {
      throw new MediaError('not-media', `Image ${i + 1} could not be decoded (SVG is not supported here).`);
    }
    ctx.fillStyle = o.background;
    ctx.fillRect(0, 0, w, h);
    const s = Math.min(w / bmp.width, h / bmp.height);
    ctx.drawImage(bmp, (w - bmp.width * s) / 2, (h - bmp.height * s) / 2, bmp.width * s, bmp.height * s);
    bmp.close();
    encodeFrame(gif, ctx.getImageData(0, 0, w, h).data, w, h, o.colors, delay, o.repeat);
    onProgress(((i + 1) / files.length) * 0.95);
  }
  const out = finishGif(gif, o.fileName);
  const checks = await validateGif(out, files.length, w, h);
  if (checks.some((c) => !c.ok)) throw new MediaError('validation-failed', `The GIF failed validation: ${checks.filter((c) => !c.ok).map((c) => c.detail).join('; ')}`);
  onProgress(1);
  return { file: out, storage: 'memory', scratchName: null, checks, summary: `${w}×${h} · ${files.length} frames`, elapsedMs: Math.round(performance.now() - started) };
}

export async function extractFramesZip(file: Blob, o: FramesOptions, jobId: string, onProgress: (p: number) => void, signal: AbortSignal): Promise<FileResult> {
  const started = performance.now();
  const input = openInput(file);
  const base = safeName(o.fileName);
  const scratchName = `out_${jobId.replace(/[^a-z0-9_]/gi, '')}__${base}.zip`;
  let scratch = await createScratchFile(scratchName);
  const memParts: Uint8Array[] = [];
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new MediaError('no-tracks', 'This file has no video track.');
    if (!(await track.canDecode())) throw new MediaError('unsupported-codec', 'This browser cannot decode the video.');
    // Work in source timestamps (o.start/o.end count from the first frame).
    const range = await mediaRange(input);
    const t0 = range.start;
    const dur = Math.min(await track.computeDuration(), range.end);
    const first = await track.getFirstTimestamp();
    const start = Math.max(first, o.start + t0);
    const end = Math.min(dur, o.end + t0);
    if (!(end > start)) throw new MediaError('not-media', 'The range is empty.');

    let times: number[] | null = null;
    if (o.mode === 'interval') {
      const step = Math.max(0.01, o.interval ?? 1);
      times = [];
      for (let t = start; t < end - 1e-9; t += step) times.push(t);
    } else if (o.mode === 'count') {
      const n = Math.max(1, Math.min(MAX_ZIP_FRAMES, Math.round(o.count ?? 10)));
      times = Array.from({ length: n }, (_, i) => start + ((end - start) * (i + 0.5)) / n);
    }
    const expected = times ? times.length : Math.round((end - start) * (await frameRateOf(track)));
    if (expected > MAX_ZIP_FRAMES) throw new MediaError('too-large', `That is about ${expected} frames; the limit is ${MAX_ZIP_FRAMES}. Use an interval or a shorter range.`);

    const w = o.width ? Math.max(2, Math.round(o.width)) : track.displayWidth;
    const h = Math.max(2, Math.round((w * track.displayHeight) / track.displayWidth));
    const sink = new CanvasSink(track, { width: w, height: h, fit: 'fill', poolSize: 2 });
    const zip = new ZipWriter({
      write: async (chunk) => {
        if (scratch) await scratch.writable.write(chunk as Uint8Array<ArrayBuffer>);
        else memParts.push(chunk);
      },
    });
    const mime = `image/${o.format}`;
    const iter = times ? sink.canvasesAtTimestamps(times) : sink.canvases(start, end);
    let n = 0;
    const digits = String(Math.max(expected, 1)).length + 1;
    for await (const wc of iter) {
      if (signal.aborted) throw new MediaError('cancelled', 'Cancelled.');
      if (!wc) continue;
      const blob = await (wc.canvas as OffscreenCanvas).convertToBlob({ type: mime, quality: o.quality ?? 0.92 });
      if (blob.type !== mime) throw new MediaError('no-encoder', `This browser cannot encode ${o.format.toUpperCase()} images. Choose PNG or JPEG.`);
      n++;
      const ms = Math.round((wc.timestamp - t0) * 1000);
      await zip.add(`${base}_${String(n).padStart(digits, '0')}_${ms}ms.${o.format === 'jpeg' ? 'jpg' : o.format}`, new Uint8Array(await blob.arrayBuffer()));
      if (n > MAX_ZIP_FRAMES) throw new MediaError('too-large', `More than ${MAX_ZIP_FRAMES} frames. Use an interval or a shorter range.`);
      onProgress(Math.min(0.95, (n / Math.max(1, expected)) * 0.95));
    }
    if (n === 0) throw new MediaError('not-media', 'No frames were found in that range.');
    await zip.finish();

    let out: File;
    if (scratch) {
      await scratch.writable.close();
      out = new File([await scratch.handle.getFile()], `${base}_frames.zip`, { type: 'application/zip' });
    } else {
      out = new File(memParts as Uint8Array<ArrayBuffer>[], `${base}_frames.zip`, { type: 'application/zip' });
    }
    const checks: ValidationCheck[] = [];
    // Verify the archive structure, and every CRC for archives that fit comfortably in memory.
    if (out.size <= 512 * 1024 * 1024) {
      const entries = readStoredZip(new Uint8Array(await out.arrayBuffer()));
      checks.push({ name: 'Archive', ok: entries.length === n, detail: `${entries.length} files` });
      const bad = entries.filter((e) => !e.crcOk).length;
      checks.push({ name: 'Checksums', ok: bad === 0, detail: bad ? `${bad} corrupt` : 'all CRC-32 match' });
    } else {
      checks.push({ name: 'Archive', ok: true, detail: `${n} files (checksums not re-read for archives over 512 MB)` });
    }
    if (checks.some((c) => !c.ok)) throw new MediaError('validation-failed', 'The frame archive failed validation.');
    onProgress(1);
    const result: FileResult = {
      file: out,
      storage: scratch ? 'opfs' : 'memory',
      scratchName: scratch?.name ?? null,
      checks,
      summary: `${n} ${o.format.toUpperCase()} frames · ${w}×${h}`,
      elapsedMs: Math.round(performance.now() - started),
    };
    scratch = null;
    return result;
  } finally {
    input.dispose();
    if (scratch) {
      await scratch.writable.abort().catch(() => undefined);
      await deleteScratchFile(scratch.name);
    }
  }
}
