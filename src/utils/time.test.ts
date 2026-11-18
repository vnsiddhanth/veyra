import { describe, expect, it } from 'vitest';
import {
  COMMON_FRAME_RATES,
  FLICKS_PER_SECOND,
  flicksToFrames,
  formatTimecode,
  fpsToRational,
  frameDuration,
  framesToFlicks,
  quantizeToFrame,
  secondsToFlicks,
} from './time';

describe('flick timebase', () => {
  it('represents every common frame duration as an exact integer', () => {
    for (const { rate } of COMMON_FRAME_RATES) {
      const exact = (FLICKS_PER_SECOND * rate.den) / rate.num;
      expect(Number.isInteger(exact)).toBe(true);
      expect(frameDuration(rate)).toBe(exact);
    }
  });

  it('represents common audio sample periods exactly', () => {
    for (const sr of [8000, 16000, 22050, 32000, 44100, 48000, 88200, 96000, 192000]) {
      expect(Number.isInteger(FLICKS_PER_SECOND / sr)).toBe(true);
    }
  });

  it('round-trips frames ↔ flicks without drift over long durations', () => {
    const ntsc = { num: 30000, den: 1001 };
    const frames = 30 * 60 * 60 * 24; // ~a day of 29.97 footage
    const t = framesToFlicks(frames, ntsc);
    expect(Number.isSafeInteger(t)).toBe(true);
    expect(flicksToFrames(t, ntsc)).toBe(frames);
  });

  it('quantizes to frame boundaries', () => {
    const r = { num: 25, den: 1 };
    const fd = frameDuration(r);
    expect(quantizeToFrame(fd * 3 + 1, r, 'round')).toBe(fd * 3);
    expect(quantizeToFrame(fd * 3 + 1, r, 'ceil')).toBe(fd * 4);
    expect(quantizeToFrame(fd * 3 + fd - 1, r, 'floor')).toBe(fd * 3);
    expect(quantizeToFrame(fd * 3, r, 'ceil')).toBe(fd * 3);
  });

  it('converts seconds', () => {
    expect(secondsToFlicks(1.5)).toBe(1.5 * FLICKS_PER_SECOND);
  });

  it('recognises NTSC rates from measured fps', () => {
    expect(fpsToRational(29.97002997)).toEqual({ num: 30000, den: 1001 });
    expect(fpsToRational(23.976)).toEqual({ num: 24000, den: 1001 });
    expect(fpsToRational(59.94)).toEqual({ num: 60000, den: 1001 });
    expect(fpsToRational(25.0001)).toEqual({ num: 25, den: 1 });
    expect(fpsToRational(Number.NaN)).toEqual({ num: 30, den: 1 });
  });
});

describe('formatTimecode', () => {
  it('formats non-drop-frame', () => {
    const r = { num: 25, den: 1 };
    expect(formatTimecode(framesToFlicks(25 * 61 + 3, r), r)).toBe('00:01:01:03');
  });

  it('formats 29.97 drop-frame (skips ;00 and ;01 at minute boundaries except every 10th)', () => {
    const r = { num: 30000, den: 1001 };
    expect(formatTimecode(framesToFlicks(1799, r), r)).toBe('00:00:59;29');
    expect(formatTimecode(framesToFlicks(1800, r), r)).toBe('00:01:00;02');
    expect(formatTimecode(framesToFlicks(17982, r), r)).toBe('00:10:00;00');
  });

  it('handles negatives', () => {
    const r = { num: 30, den: 1 };
    expect(formatTimecode(-framesToFlicks(30, r), r)).toBe('-00:00:01:00');
  });
});
