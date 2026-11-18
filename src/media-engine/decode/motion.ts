/**
 * Global motion analysis for video stabilisation: translation and rotation (roll).
 *
 * Each frame is decoded at a small width, converted to luma, and compared with the previous frame.
 * Translation: coarse exhaustive search on a 2× downsampled image, refined at full analysis
 * resolution, minimising the mean absolute difference over the central region.
 * Rotation: four edge blocks (left, right, top, bottom) are matched with sub-pixel precision around
 * the global shift; a rotation by θ moves the left/right blocks vertically by ∓θ·r and the
 * top/bottom blocks horizontally by ±θ·r. Zoom and rolling-shutter skew are not estimated.
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
  /** Per-frame rotation relative to the previous frame, radians (clockwise on screen). */
  dr: Float32Array;
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

/** Sub-pixel shift of one block (centre bx, by; half-size hw, hh) around an initial guess. */
function blockShift(prev: Uint8Array, cur: Uint8Array, w: number, h: number, bx: number, by: number, hw: number, hh: number, gx: number, gy: number, r: number): [number, number] {
  const c = (sx: number, sy: number) => {
    let sum = 0;
    let n = 0;
    for (let y = by - hh; y < by + hh; y++) {
      const py = y - sy;
      if (y < 0 || y >= h || py < 0 || py >= h) continue;
      for (let x = bx - hw; x < bx + hw; x++) {
        const px = x - sx;
        if (x < 0 || x >= w || px < 0 || px >= w) continue;
        sum += Math.abs(cur[y * w + x]! - prev[py * w + px]!);
        n++;
      }
    }
    return n ? sum / n : Infinity;
  };
  let best: [number, number] = [gx, gy];
  let bc = Infinity;
  for (let sy = gy - r; sy <= gy + r; sy++)
    for (let sx = gx - r; sx <= gx + r; sx++) {
      const v = c(sx, sy);
      if (v < bc) {
        bc = v;
        best = [sx, sy];
      }
    }
  // Parabolic refinement per axis.
  const refine = (m: number, z: number, p: number) => {
    const d = m - 2 * z + p;
    return d > 1e-9 ? Math.max(-0.5, Math.min(0.5, (m - p) / (2 * d))) : 0;
  };
  const [x0, y0] = best;
  return [x0 + refine(c(x0 - 1, y0), bc, c(x0 + 1, y0)), y0 + refine(c(x0, y0 - 1), bc, c(x0, y0 + 1))];
}

/** Luma standard deviation below which a block is considered too flat to match. */
const MIN_TEXTURE = 6;

function blockStd(img: Uint8Array, w: number, h: number, bx: number, by: number, hw: number, hh: number): number {
  let s = 0;
  let s2 = 0;
  let n = 0;
  for (let y = Math.max(0, by - hh); y < Math.min(h, by + hh); y += 2)
    for (let x = Math.max(0, bx - hw); x < Math.min(w, bx + hw); x += 2) {
      const v = img[y * w + x]!;
      s += v;
      s2 += v * v;
      n++;
    }
  if (!n) return 0;
  const m = s / n;
  return Math.sqrt(Math.max(0, s2 / n - m * m));
}

/**
 * Estimate translation (dx, dy, pixels) and rotation (radians) between two frames such that
 * cur(p) ≈ prev(R(−θ)·(p − c) + c − d).
 */
export function estimateMotion(prev: Uint8Array, cur: Uint8Array, w: number, h: number, radius = 12): [number, number, number] {
  const [gx, gy] = estimateShift(prev, cur, w, h, radius);
  const hw = Math.round(w * 0.1);
  const hh = Math.round(h * 0.14);
  const rx = w * 0.32;
  const ry = h * 0.3;
  const cx = w / 2;
  const cy = h / 2;
  // Rotation of a few degrees moves edge blocks a few pixels beyond the global shift.
  const r = Math.max(3, Math.ceil(Math.max(rx, ry) * 0.06));
  const L = blockShift(prev, cur, w, h, Math.round(cx - rx), Math.round(cy), hw, hh, gx, gy, r);
  const R = blockShift(prev, cur, w, h, Math.round(cx + rx), Math.round(cy), hw, hh, gx, gy, r);
  const T = blockShift(prev, cur, w, h, Math.round(cx), Math.round(cy - ry), hw, hh, gx, gy, r);
  const B = blockShift(prev, cur, w, h, Math.round(cx), Math.round(cy + ry), hw, hh, gx, gy, r);
  // On screen (y down), a clockwise rotation θ moves (x, y) by (−θ·y, θ·x) relative to the centre.
  const thetaLR = (R[1] - L[1]) / (2 * rx);
  const thetaTB = (T[0] - B[0]) / (2 * ry);
  // Flat regions (sky, walls, plain backgrounds) cannot be matched; their pair is left out rather than
  // adding noise. Weight each pair by its baseline and only if both of its blocks carry texture.
  const tex = (bx: number, by: number) => blockStd(prev, w, h, Math.round(bx), Math.round(by), hw, hh) >= MIN_TEXTURE;
  const wLR = tex(cx - rx, cy) && tex(cx + rx, cy) ? rx : 0;
  const wTB = tex(cx, cy - ry) && tex(cx, cy + ry) ? ry : 0;
  const theta = wLR + wTB > 0 ? (thetaLR * wLR + thetaTB * wTB) / (wLR + wTB) : 0;
  // Translation comes from the global central-region search (robust on flat edges); the edge blocks
  // only contribute rotation.
  return [gx, gy, theta];
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
    const dr: number[] = [];
    const ts: number[] = [];
    let prev: Uint8Array | null = null;
    for await (const wc of sink.canvases()) {
      if (signal.aborted) throw new MediaError('cancelled', 'Cancelled.');
      const ctx = (wc.canvas as OffscreenCanvas).getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;
      const cur = toLuma(ctx.getImageData(0, 0, w, h).data, w, h);
      const [sx, sy, sr] = prev ? estimateMotion(prev, cur, w, h) : [0, 0, 0];
      dx.push(sx);
      dy.push(sy);
      dr.push(sr);
      ts.push(wc.timestamp);
      prev = cur;
      if (dur > 0) onProgress(Math.min(0.99, wc.timestamp / dur));
    }
    if (dx.length < 2) throw new MediaError('not-media', 'The video is too short to stabilise.');
    onProgress(1);
    return { width: w, height: h, fps, dx: Float32Array.from(dx), dy: Float32Array.from(dy), dr: Float32Array.from(dr), timestamps: Float64Array.from(ts) };
  } finally {
    input.dispose();
  }
}

export { stabilisationCorrection } from './motion-math';
