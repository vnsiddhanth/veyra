import { describe, expect, it } from 'vitest';
import { estimateMotion, estimateShift } from './motion';
import { stabilisationCorrection } from './motion-math';

/** Smooth, non-periodic value noise (like real footage), sampled shifted by (ox, oy). */
function noise(x: number, y: number): number {
  const h = (i: number, j: number) => {
    const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const xi = Math.floor(x / 6);
  const yi = Math.floor(y / 6);
  const fx = x / 6 - xi;
  const fy = y / 6 - yi;
  const a = h(xi, yi) * (1 - fx) + h(xi + 1, yi) * fx;
  const b = h(xi, yi + 1) * (1 - fx) + h(xi + 1, yi + 1) * fx;
  return a * (1 - fy) + b * fy;
}
function image(w: number, h: number, ox: number, oy: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = Math.round(255 * noise(x - ox + 500, y - oy + 500));
  return out;
}

describe('estimateShift', () => {
  it.each([
    [0, 0],
    [3, -2],
    [-7, 5],
    [10, 9],
  ])('recovers a (%i, %i) translation', (dx, dy) => {
    const w = 160;
    const h = 90;
    expect(estimateShift(image(w, h, 0, 0), image(w, h, dx, dy), w, h)).toEqual([dx, dy]);
  });
});

describe('stabilisationCorrection', () => {
  it('cancels jitter around a steady pan', () => {
    // Pan of +2 px/frame with ±3 px alternating shake.
    const dx = Float32Array.from({ length: 41 }, (_, i) => (i === 0 ? 0 : 2 + (i % 2 ? 3 : -3)));
    const dy = new Float32Array(41);
    const { cx } = stabilisationCorrection({ dx, dy }, 4);
    // Corrected path = raw path + correction should advance smoothly (~2 px/frame) in the middle.
    let p = 0;
    const path: number[] = [];
    for (let i = 0; i < 41; i++) {
      p += dx[i]!;
      path.push(p + cx[i]!);
    }
    for (let i = 10; i < 30; i++) expect(Math.abs(path[i + 1]! - path[i]! - 2)).toBeLessThan(0.8);
  });
});

/** The noise image rotated by `theta` (clockwise on screen) about the centre and shifted by (ox, oy). */
function rotated(w: number, h: number, theta: number, ox = 0, oy = 0): Uint8Array {
  const out = new Uint8Array(w * h);
  const cx = w / 2;
  const cy = h / 2;
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      // Inverse map: source point that lands on (x, y).
      const dx = x - cx - ox;
      const dy = y - cy - oy;
      const sx = c * dx + s * dy + cx;
      const sy = -s * dx + c * dy + cy;
      out[y * w + x] = Math.round(255 * noise(sx + 500, sy + 500));
    }
  return out;
}

describe('estimateMotion (rotation)', () => {
  it.each([0, 0.01, -0.02, 0.03])('recovers a %f rad rotation within 0.004 rad', (theta) => {
    const w = 320;
    const h = 180;
    const [, , r] = estimateMotion(rotated(w, h, 0), rotated(w, h, theta), w, h);
    expect(Math.abs(r - theta)).toBeLessThan(0.004);
  });
  it('separates rotation from translation', () => {
    const w = 320;
    const h = 180;
    const [tx, ty, r] = estimateMotion(rotated(w, h, 0), rotated(w, h, 0.015, 4, -3), w, h);
    expect(Math.abs(r - 0.015)).toBeLessThan(0.004);
    expect(Math.abs(tx - 4)).toBeLessThan(0.6);
    expect(Math.abs(ty + 3)).toBeLessThan(0.6);
  });
});
