/**
 * Global motion analysis for video stabilisation (translation only).
 *
 * Each frame is decoded at a small width, converted to luma, and compared with the previous frame:
 * a coarse exhaustive search on a 2× downsampled image, refined at full analysis resolution,
 * minimising the mean absolute difference over the central region. Rotation and zoom are not
 * estimated — this corrects handheld shake, not rolling shutter or rotation.
 */
import { CanvasSink } from 'mediabunny';
import { MediaError } from '../core/errors';
import { openInput } from '../import/probe';

export interface MotionAnalysis {
  /** Analysis frame size. */
  width: number;
  height: number;
  fps: number;
  /** Per-frame content shift relative to the previous frame, in analysis pixels (first = 0). */
  dx: Float32Array;
  dy: Float32Array;
  timestamps: Float64Array;
}

export function toLuma(rgba: Uint8ClampedArray, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let i = 0, j = 0; j < out.length; i += 4, j++) out[j] = (rgba[i]! * 77 + rgba[i + 1]! * 150 + rgba[i + 2]! * 29) >> 8;
  return out;
}

export function downsample2(src: Uint8Array, w: number, h: number): { data: Uint8Array; w: number; h: number } {
  const w2 = w >> 1;
  const h2 = h >> 1;
  const out = new Uint8Array(w2 * h2);
  for (let y = 0; y < h2; y++)
    for (let x = 0; x < w2; x++) {
      const i = 2 * y * w + 2 * x;
      out[y * w2 + x] = (src[i]! + src[i + 1]! + src[i + w]! + src[i + w + 1]!) >> 2;
    }
  return { data: out, w: w2, h: h2 };
}

/** Mean absolute difference between `cur` and `prev` displaced by (sx, sy), over the central region. */
function cost(prev: Uint8Array, cur: Uint8Array, w: number, h: number, sx: number, sy: number, margin: number, step: number): number {
  let sum = 0;
  let n = 0;
  for (let y = margin; y < h - margin; y += step) {
    const py = y - sy;
    if (py < 0 || py >= h) continue;
    for (let x = margin; x < w - margin; x += step) {
      const px = x - sx;
      if (px < 0 || px >= w) continue;
      sum += Math.abs(cur[y * w + x]! - prev[py * w + px]!);
      n++;
    }
  }
  return n ? sum / n : Infinity;
}

function search(prev: Uint8Array, cur: Uint8Array, w: number, h: number, cx: number, cy: number, radius: number, margin: number, step: number): [number, number] {
  let best: [number, number] = [cx, cy];
  let bestCost = Infinity;
  for (let sy = cy - radius; sy <= cy + radius; sy++)
    for (let sx = cx - radius; sx <= cx + radius; sx++) {
      const c = cost(prev, cur, w, h, sx, sy, margin, step);
      if (c < bestCost) {
        bestCost = c;
        best = [sx, sy];
      }
    }
  return best;
}

/**
 * Estimate (dx, dy) such that `cur(x, y) ≈ prev(x − dx, y − dy)` — i.e. how far the picture moved.
 * `radius` is the maximum shift searched, in pixels at full analysis resolution.
 */
export function estimateShift(prev: Uint8Array, cur: Uint8Array, w: number, h: number, radius = 12): [number, number] {
  const p2 = downsample2(prev, w, h);
  const c2 = downsample2(cur, w, h);
  const r2 = Math.ceil(radius / 2);
  const margin2 = Math.ceil(Math.min(p2.w, p2.h) * 0.15) + r2;
  const [cx, cy] = search(p2.data, c2.data, p2.w, p2.h, 0, 0, r2, margin2, 1);
  const margin = Math.ceil(Math.min(w, h) * 0.15) + radius;
  return search(prev, cur, w, h, cx * 2, cy * 2, 2, margin, 1);
}

export async function analyzeMotion(file: Blob, width: number, onProgress: (p: number) => void, signal: AbortSignal): Promise<MotionAnalysis> {
  const input = openInput(file);
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new MediaError('no-tracks', 'This file has no video track.');
    if (!(await track.canDecode())) throw new MediaError('unsupported-codec', 'This browser cannot decode the video.');
    const w = Math.max(32, Math.round(width / 2) * 2);
    const h = Math.max(32, Math.round((w * track.displayHeight) / track.displayWidth / 2) * 2);
    const dur = await track.computeDuration();
    const fps = (await track.computeFrameRateMetrics({ targetPacketCount: 120 }).catch(() => null))?.bestGuessFrameRate ?? 30;
    const sink = new CanvasSink(track, { width: w, height: h, fit: 'fill', poolSize: 2 });
    const dx: number[] = [];
    const dy: number[] = [];
    const ts: number[] = [];
    let prev: Uint8Array | null = null;
    for await (const wc of sink.canvases()) {
      if (signal.aborted) throw new MediaError('cancelled', 'Cancelled.');
      const ctx = (wc.canvas as OffscreenCanvas).getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;
      const cur = toLuma(ctx.getImageData(0, 0, w, h).data, w, h);
      const [sx, sy] = prev ? estimateShift(prev, cur, w, h) : [0, 0];
      dx.push(sx);
      dy.push(sy);
      ts.push(wc.timestamp);
      prev = cur;
      if (dur > 0) onProgress(Math.min(0.99, wc.timestamp / dur));
    }
    if (dx.length < 2) throw new MediaError('not-media', 'The video is too short to stabilise.');
    onProgress(1);
    return { width: w, height: h, fps, dx: Float32Array.from(dx), dy: Float32Array.from(dy), timestamps: Float64Array.from(ts) };
  } finally {
    input.dispose();
  }
}

export { stabilisationCorrection } from './motion-math';
