/** Pure stabilisation maths (no media dependencies, safe for the UI bundle). */
import type { MotionAnalysis } from './motion';

/** Camera path → per-frame correction (analysis px) toward a moving-average smoothed path. */
export function stabilisationCorrection(a: Pick<MotionAnalysis, 'dx' | 'dy'>, window: number): { cx: Float32Array; cy: Float32Array } {
  const n = a.dx.length;
  const px = new Float64Array(n);
  const py = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    px[i] = px[i - 1]! + a.dx[i]!;
    py[i] = py[i - 1]! + a.dy[i]!;
  }
  const r = Math.max(1, Math.round(window));
  const cx = new Float32Array(n);
  const cy = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let sx = 0;
    let sy = 0;
    let k = 0;
    for (let j = Math.max(0, i - r); j <= Math.min(n - 1, i + r); j++) {
      sx += px[j]!;
      sy += py[j]!;
      k++;
    }
    cx[i] = sx / k - px[i]!;
    cy[i] = sy / k - py[i]!;
  }
  return { cx, cy };
}
