import { describe, expect, it } from 'vitest';
import { LEVELS, VS, clipping, computeScopes } from './scopes';

function frame(w: number, h: number, px: (x: number, y: number) => [number, number, number]): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b] = px(x, y);
      d.set([r, g, b, 255], (y * w + x) * 4);
    }
  return d;
}

describe('video scopes', () => {
  it('a grey frame sits at one level and in the vectorscope centre', () => {
    const s = computeScopes(frame(8, 4, () => [128, 128, 128]), 8, 4, 8);
    expect(s.samples).toBe(32);
    for (let x = 0; x < 8; x++) expect(s.waveform[x * LEVELS + 128]).toBe(4);
    expect(s.vectorscope[(VS / 2) * VS + VS / 2]).toBe(32);
    expect(s.histogram[3 * LEVELS + 128]).toBe(32);
  });

  it('a left-to-right ramp rises across the waveform', () => {
    const s = computeScopes(frame(256, 2, (x) => [x, x, x]), 256, 2, 256);
    expect(s.waveform[0 * LEVELS + 0]).toBe(2);
    expect(s.waveform[255 * LEVELS + 255]).toBe(2);
    expect(s.waveform[100 * LEVELS + 100]).toBe(2);
  });

  it('separates channels in the parade', () => {
    const cols = 4;
    const s = computeScopes(frame(4, 1, () => [255, 0, 10]), 4, 1, cols);
    expect(s.parade[(0 * cols + 0) * LEVELS + 255]).toBe(1);
    expect(s.parade[(1 * cols + 0) * LEVELS + 0]).toBe(1);
    expect(s.parade[(2 * cols + 0) * LEVELS + 10]).toBe(1);
  });

  it('puts red up and to the left of centre, blue to the right', () => {
    const red = computeScopes(frame(1, 1, () => [255, 0, 0]), 1, 1, 1).vectorscope;
    const blue = computeScopes(frame(1, 1, () => [0, 0, 255]), 1, 1, 1).vectorscope;
    const pos = (v: Uint32Array) => {
      const i = v.findIndex((n) => n > 0);
      return { x: i % VS, y: Math.floor(i / VS) };
    };
    expect(pos(red).y).toBeLessThan(VS / 2);
    expect(pos(red).x).toBeLessThan(VS / 2);
    expect(pos(blue).x).toBeGreaterThan(VS / 2);
  });

  it('reports clipped highlights and crushed shadows', () => {
    const s = computeScopes(frame(10, 1, (x) => (x < 3 ? [255, 255, 255] : x < 4 ? [0, 0, 0] : [120, 120, 120])), 10, 1);
    const c = clipping(s);
    expect(c.highlights).toBeCloseTo(30);
    expect(c.shadows).toBeCloseTo(10);
  });
});
