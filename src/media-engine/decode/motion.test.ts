import { describe, expect, it } from 'vitest';
import { estimateShift } from './motion';
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
