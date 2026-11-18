/** Pure stabilisation maths (no media dependencies, safe for the UI bundle). */
import type { MotionAnalysis } from './motion';

/** Moving-average correction of one cumulative path: smoothed − raw. */
function smoothCorrection(d: ArrayLike<number>, window: number): Float32Array {
  const n = d.length;
  const path = new Float64Array(n);
  for (let i = 1; i < n; i++) path[i] = path[i - 1]! + d[i]!;
  const r = Math.max(1, Math.round(window));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    let k = 0;
    for (let j = Math.max(0, i - r); j <= Math.min(n - 1, i + r); j++) {
      s += path[j]!;
      k++;
    }
    out[i] = s / k - path[i]!;
  }
  return out;
}

/** Camera path → per-frame correction toward a moving-average smoothed path (pixels; radians for cr). */
export function stabilisationCorrection(
  a: Pick<MotionAnalysis, 'dx' | 'dy'> & { dr?: ArrayLike<number> },
  window: number,
): { cx: Float32Array; cy: Float32Array; cr: Float32Array } {
  return {
    cx: smoothCorrection(a.dx, window),
    cy: smoothCorrection(a.dy, window),
    cr: a.dr ? smoothCorrection(a.dr, window) : new Float32Array(a.dx.length),
  };
}

/** Zoom that keeps a W×H frame covered after translating by (tx, ty) px and rotating by r radians. */
export function coverZoom(w: number, h: number, tx: number, ty: number, r: number): number {
  const c = Math.cos(Math.abs(r));
  const s = Math.sin(Math.abs(r));
  const rot = c + s * Math.max(w / h, h / w);
  return rot + Math.max((2 * Math.abs(tx)) / w, (2 * Math.abs(ty)) / h);
}
