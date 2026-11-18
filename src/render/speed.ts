/**
 * Speed ramps. A clip's playback speed may be keyframed (`keyframes.speed`, absolute multipliers;
 * the static value is `clip.speed`). Source time is the integral of speed over timeline time, so a
 * ramp never jumps. The integral is tabulated per keyframe list (1 ms steps) and cached.
 */
import type { Clip, Keyframe } from '@/project/schema/types';
import type { Flicks } from '@/utils/time';
import { evalKeyframes } from './keyframes';

const STEP: Flicks = 705_600; // 1 ms
const cache = new WeakMap<readonly Keyframe[], Map<number, Float64Array>>();

function table(list: readonly Keyframe[], duration: Flicks, base: number): Float64Array {
  let byDur = cache.get(list);
  if (!byDur) {
    byDur = new Map();
    cache.set(list, byDur);
  }
  const key = duration * 1000 + base;
  let t = byDur.get(key);
  if (!t) {
    const n = Math.ceil(duration / STEP) + 2;
    t = new Float64Array(n);
    let prev = Math.max(0.01, evalKeyframes(list, 0, base));
    for (let i = 1; i < n; i++) {
      const cur = Math.max(0.01, evalKeyframes(list, i * STEP, base));
      t[i] = t[i - 1]! + ((prev + cur) / 2) * STEP; // trapezoid
      prev = cur;
    }
    if (byDur.size > 8) byDur.clear();
    byDur.set(key, t);
  }
  return t;
}

export function hasSpeedRamp(clip: Clip): boolean {
  return (clip.keyframes.speed?.length ?? 0) > 0;
}

/** Source flicks consumed from the clip start up to `local` timeline flicks. */
export function sourceAdvance(clip: Clip, local: Flicks): Flicks {
  const list = clip.keyframes.speed;
  if (!list?.length) return local * clip.speed;
  const t = table(list, Math.max(clip.duration, local), clip.speed);
  const x = Math.max(0, local) / STEP;
  const i = Math.min(t.length - 2, Math.floor(x));
  const f = x - i;
  return t[i]! + (t[i + 1]! - t[i]!) * f;
}

/** Total source span of the clip (equals duration × speed without a ramp). */
export function rampedSpan(clip: Clip): Flicks {
  return hasSpeedRamp(clip) ? sourceAdvance(clip, clip.duration) : clip.duration * clip.speed;
}

/** Instantaneous speed at `local`. */
export function speedAt(clip: Clip, local: Flicks): number {
  return evalKeyframes(clip.keyframes.speed, local, clip.speed);
}
