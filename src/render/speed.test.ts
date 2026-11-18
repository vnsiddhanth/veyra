import { describe, expect, it } from 'vitest';
import { createClip } from '@/project/schema/factory';
import { secondsToFlicks } from '@/utils/time';
import { sourceTimeAt } from './evaluate';
import { rampedSpan, sourceAdvance, speedAt } from './speed';

const S = secondsToFlicks;
const ramp = () => ({
  ...createClip({ trackId: 't', assetId: 'a', start: S(1), duration: S(2), name: 'c' }),
  keyframes: {
    speed: [
      { t: 0, value: 1, easing: 'linear' as const },
      { t: S(2), value: 3, easing: 'linear' as const },
    ],
  },
});

describe('speed ramps', () => {
  it('integrates speed over time (linear 1→3× over 2 s consumes 4 s of source)', () => {
    const c = ramp();
    expect(rampedSpan(c) / S(1)).toBeCloseTo(4, 3);
    // After 1 s: ∫0..1 (1 + t) dt = 1.5 s.
    expect(sourceAdvance(c, S(1)) / S(1)).toBeCloseTo(1.5, 3);
    expect(speedAt(c, S(1))).toBeCloseTo(2);
  });
  it('drives the source time of frames, forward and reversed', () => {
    const c = ramp();
    expect(sourceTimeAt(c, S(2), 0)).toBeCloseTo(1.5, 3);
    expect(sourceTimeAt({ ...c, reversed: true }, S(1), 0)).toBeCloseTo(4, 3);
  });
  it('without keyframes it is the constant speed', () => {
    const c = { ...ramp(), keyframes: {}, speed: 2 };
    expect(sourceAdvance(c, S(1))).toBe(S(2));
    expect(rampedSpan(c)).toBe(S(4));
  });
});
