/**
 * Video scopes computed from an RGBA frame (Rec. 709 luma and chroma):
 * - waveform: for each of `cols` columns, how many pixels have each luma level (0–255)
 * - parade: the same per R, G and B channel
 * - vectorscope: 2D density of Cb/Cr, `VS`×`VS` cells (centre = neutral grey)
 * - histogram: 256 bins each for R, G, B and luma
 * Pure functions on typed arrays so they run in the preview worker and are unit-tested.
 */

export const LEVELS = 256;
export const VS = 128;

export interface ScopeData {
  cols: number;
  /** cols × 256, column-major: waveform[x * 256 + level]. */
  waveform: Uint32Array;
  /** 3 × cols × 256: parade[(c * cols + x) * 256 + level], c = R, G, B. */
  parade: Uint32Array;
  /** VS × VS: vectorscope[y * VS + x], x = Cb, y = −Cr (red is up-left like a hardware scope). */
  vectorscope: Uint32Array;
  /** 4 × 256: R, G, B, luma. */
  histogram: Uint32Array;
  /** Pixels sampled. */
  samples: number;
}

/** Rec. 709 luma from 8-bit RGB. */
export const luma = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

export function computeScopes(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number, cols = Math.min(width, 256)): ScopeData {
  const waveform = new Uint32Array(cols * LEVELS);
  const parade = new Uint32Array(3 * cols * LEVELS);
  const vectorscope = new Uint32Array(VS * VS);
  const histogram = new Uint32Array(4 * LEVELS);
  const half = VS / 2;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = rgba[i]!;
      const g = rgba[i + 1]!;
      const b = rgba[i + 2]!;
      const yv = luma(r, g, b);
      const yl = Math.min(255, Math.round(yv));
      const col = Math.min(cols - 1, Math.floor((x * cols) / width));
      waveform[col * LEVELS + yl]!++;
      parade[(0 * cols + col) * LEVELS + r]!++;
      parade[(1 * cols + col) * LEVELS + g]!++;
      parade[(2 * cols + col) * LEVELS + b]!++;
      histogram[r]!++;
      histogram[LEVELS + g]!++;
      histogram[2 * LEVELS + b]!++;
      histogram[3 * LEVELS + yl]!++;
      // Cb, Cr in [-0.5, 0.5] for full-range Rec. 709.
      const cb = (b - yv) / 1.8556 / 255;
      const cr = (r - yv) / 1.5748 / 255;
      const vx = Math.min(VS - 1, Math.max(0, Math.round(half + cb * VS * 0.95)));
      const vy = Math.min(VS - 1, Math.max(0, Math.round(half - cr * VS * 0.95)));
      vectorscope[vy * VS + vx]!++;
    }
  }
  return { cols, waveform, parade, vectorscope, histogram, samples: width * height };
}

/** Percentage of pixels with luma at or above 254 (clipped highlights) and at or below 1 (crushed blacks). */
export function clipping(data: ScopeData): { highlights: number; shadows: number } {
  const h = data.histogram.subarray(3 * LEVELS);
  const pct = (n: number) => (data.samples ? (100 * n) / data.samples : 0);
  return { highlights: pct(h[254]! + h[255]!), shadows: pct(h[0]! + h[1]!) };
}
