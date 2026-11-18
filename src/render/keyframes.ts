/** Keyframe interpolation (no project/timeline dependencies). */
import type { Easing, Keyframe } from '@/project/schema/types';
import type { Flicks } from '@/utils/time';


/** Cubic-bezier y for x, solved by bisection (CSS-style timing function). */
export function cubicBezier(x: number, [x1, y1, x2, y2]: [number, number, number, number]): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bx = (t: number) => 3 * (1 - t) * (1 - t) * t * x1 + 3 * (1 - t) * t * t * x2 + t * t * t;
  const by = (t: number) => 3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (bx(mid) < x) lo = mid;
    else hi = mid;
  }
  return by((lo + hi) / 2);
}

const EASINGS: Record<Exclude<Easing, 'bezier' | 'hold'>, [number, number, number, number]> = {
  linear: [0, 0, 1, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
};

export function ease(easing: Easing, x: number, bezier?: [number, number, number, number]): number {
  if (easing === 'hold') return 0;
  if (easing === 'linear') return x;
  return cubicBezier(x, easing === 'bezier' ? (bezier ?? EASINGS.linear) : EASINGS[easing]);
}

/**
 * Value of a keyframed property at `t` (flicks from clip start). The easing of a keyframe shapes
 * the segment that leaves it. Before the first / after the last keyframe the value is held.
 */
export function evalKeyframes(list: readonly Keyframe[] | undefined, t: Flicks, base: number): number {
  if (!list || list.length === 0) return base;
  if (t <= list[0]!.t) return list[0]!.value;
  const last = list[list.length - 1]!;
  if (t >= last.t) return last.value;
  for (let i = 0; i < list.length - 1; i++) {
    const a = list[i]!;
    const b = list[i + 1]!;
    if (t >= a.t && t < b.t) {
      const x = (t - a.t) / (b.t - a.t);
      return a.value + (b.value - a.value) * ease(a.easing, x, a.bezier);
    }
  }
  return last.value;
}

