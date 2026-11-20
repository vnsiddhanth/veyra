import { describe, expect, it } from 'vitest';
import { LoudnessMeter, PeakLimiter } from './loudness';

const SR = 48000;

function sine(seconds: number, freq: number, amp: number, sr = SR): Float32Array {
  const n = Math.round(seconds * sr);
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = amp * Math.sin((2 * Math.PI * freq * i) / sr);
  return a;
}

describe('LoudnessMeter (BS.1770-4)', () => {
  it('reads a stereo 997 Hz tone at −20 dBFS as −20 LUFS (EBU Tech 3341 case 1)', () => {
    const m = new LoudnessMeter(SR);
    const s = sine(20, 997, 0.1);
    m.add(s, s);
    expect(m.integrated()).toBeCloseTo(-20, 1);
  });

  it('is sample-rate independent', () => {
    const m = new LoudnessMeter(44100);
    const s = sine(10, 997, 0.1, 44100);
    m.add(s, s);
    expect(m.integrated()).toBeCloseTo(-20, 1);
  });

  it('gates out silence (EBU Tech 3341 case 3: −36 / −23 / −36 sequence reads −23)', () => {
    const m = new LoudnessMeter(SR);
    const amp = (db: number) => 10 ** (db / 20);
    for (const [db, sec] of [
      [-36, 10],
      [-23, 60],
      [-36, 10],
    ] as const) {
      const s = sine(sec, 1000, amp(db));
      m.add(s, s);
    }
    expect(m.integrated()).toBeCloseTo(-23, 0);
  });

  it('reports −Infinity for silence', () => {
    const m = new LoudnessMeter(SR);
    const z = new Float32Array(SR * 2);
    m.add(z, z);
    expect(m.integrated()).toBe(-Infinity);
  });
});

describe('PeakLimiter', () => {
  const source = (l: Float32Array, r = l) => {
    let pos = 0;
    return async (n: number): Promise<[Float32Array, Float32Array]> => {
      const a = new Float32Array(n);
      const b = new Float32Array(n);
      a.set(l.subarray(pos, pos + n));
      b.set(r.subarray(pos, pos + n));
      pos += n;
      return [a, b];
    };
  };

  it('passes quiet audio unchanged and sample-aligned', async () => {
    const s = sine(0.5, 440, 0.2);
    const lim = new PeakLimiter(source(s), SR, 0, -1);
    const [l] = await lim.next(s.length);
    for (let i = 0; i < s.length; i += 97) expect(l[i]).toBeCloseTo(s[i]!, 6);
    expect(lim.limited).toBe(0);
  });

  it('applies gain and never exceeds the ceiling', async () => {
    const s = sine(1, 440, 0.5);
    s[20000] = 1; // a transient
    const lim = new PeakLimiter(source(s), SR, 6, -1);
    const ceiling = 10 ** (-1 / 20);
    let max = 0;
    for (let done = 0; done < s.length; done += 2048) {
      const [l] = await lim.next(Math.min(2048, s.length - done));
      for (const v of l) max = Math.max(max, Math.abs(v));
    }
    expect(max).toBeLessThanOrEqual(ceiling + 1e-6);
    expect(lim.limited).toBeGreaterThan(0);
  });

  it('changes gain smoothly (no sample-to-sample jumps larger than the signal allows)', async () => {
    const quiet = sine(0.2, 200, 0.1);
    const loud = sine(0.2, 200, 1);
    const s = new Float32Array(quiet.length + loud.length);
    s.set(quiet);
    s.set(loud, quiet.length);
    const lim = new PeakLimiter(source(s), SR, 0, -1);
    const [l] = await lim.next(s.length);
    let maxStep = 0;
    for (let i = 1; i < l.length; i++) maxStep = Math.max(maxStep, Math.abs(l[i]! - l[i - 1]!));
    // A 200 Hz sine at full scale moves at most 2π·200/48000 ≈ 0.026 per sample.
    expect(maxStep).toBeLessThan(0.05);
  });
});
