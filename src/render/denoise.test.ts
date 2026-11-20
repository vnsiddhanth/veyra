import { describe, expect, it } from 'vitest';
import { AlignedDenoiser, DENOISE_N, Fft, SpectralDenoiser, noiseProfile } from './denoise';

const SR = 48000;

/** Deterministic white noise. */
function noise(n: number, amp: number, seed = 1): Float32Array {
  let s = seed;
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    a[i] = ((s / 0x7fffffff) * 2 - 1) * amp;
  }
  return a;
}

/** "Speech-like" test signal: a 300 Hz tone with harmonics that switches on and off every 0.4 s. */
function voice(n: number, amp: number): Float32Array {
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const on = Math.floor(i / (0.4 * SR)) % 2 === 1;
    if (!on) continue;
    const t = i / SR;
    a[i] = amp * (Math.sin(2 * Math.PI * 300 * t) * 0.6 + Math.sin(2 * Math.PI * 600 * t) * 0.3 + Math.sin(2 * Math.PI * 900 * t) * 0.1);
  }
  return a;
}

const rms = (a: Float32Array, from = 0, to = a.length) => {
  let s = 0;
  for (let i = from; i < to; i++) s += a[i]! * a[i]!;
  return Math.sqrt(s / Math.max(1, to - from));
};
const add = (a: Float32Array, b: Float32Array) => a.map((v, i) => v + b[i]!);

async function run(input: Float32Array, profile: Float64Array, db: number): Promise<Float32Array> {
  const d = new AlignedDenoiser(profile, db);
  const out = new Float32Array(input.length);
  const raw = async (from: number, n: number): Promise<[Float32Array, Float32Array]> => {
    const a = new Float32Array(n);
    if (from < input.length) a.set(input.subarray(from, Math.min(input.length, from + n)));
    return [a, a];
  };
  for (let pos = 0; pos < input.length; pos += 2000) {
    const n = Math.min(2000, input.length - pos);
    const [l] = await d.next(pos, n, raw);
    out.set(l, pos);
  }
  return out;
}

describe('FFT', () => {
  it('round-trips', () => {
    const f = new Fft(16);
    const re = Float64Array.from({ length: 16 }, (_, i) => Math.sin(i) + i * 0.1);
    const orig = re.slice();
    const im = new Float64Array(16);
    f.run(re, im);
    f.run(re, im, true);
    for (let i = 0; i < 16; i++) expect(re[i]).toBeCloseTo(orig[i]!, 9);
  });
});

describe('noise reduction', () => {
  it('passes a clean signal through unchanged and sample-aligned (no added delay)', async () => {
    const sig = voice(SR, 0.3);
    // A tiny noise floor: the clean voice is far above it, so the gain stays ~1.
    const prof = noiseProfile(noise(SR, 1e-5), noise(SR, 1e-5, 7));
    const out = await run(sig, prof, 15);
    const from = DENOISE_N * 2;
    let err = 0;
    for (let i = from; i < sig.length - DENOISE_N; i++) err = Math.max(err, Math.abs(out[i]! - sig[i]!));
    expect(err).toBeLessThan(0.01);
  });

  it('lowers background noise by about the chosen amount between words', async () => {
    const hiss = noise(SR * 3, 0.03);
    const out = await run(hiss, noiseProfile(hiss, hiss), 15);
    const before = rms(hiss, SR, SR * 2);
    const after = rms(out, SR, SR * 2);
    const db = 20 * Math.log10(after / before);
    expect(db).toBeLessThan(-10);
    expect(db).toBeGreaterThan(-20); // floored, not muted
  });

  it('improves speech-to-noise ratio while keeping the voice level', async () => {
    const n = SR * 4;
    const v = voice(n, 0.3);
    const hiss = noise(n, 0.03);
    const mix = add(v, hiss);
    const out = await run(mix, noiseProfile(mix, mix), 18);
    // Voice segments: 0.4–0.8 s, 1.2–1.6 s …; noise-only: 0–0.4, 0.8–1.2 …
    const seg = (a: Float32Array, k: number) => rms(a, Math.round((k * 0.4 + 0.05) * SR), Math.round((k * 0.4 + 0.35) * SR));
    const voiceIn = seg(mix, 3);
    const voiceOut = seg(out, 3);
    const gapIn = seg(mix, 4);
    const gapOut = seg(out, 4);
    const snrIn = 20 * Math.log10(voiceIn / gapIn);
    const snrOut = 20 * Math.log10(voiceOut / gapOut);
    expect(snrOut - snrIn).toBeGreaterThan(10);
    expect(20 * Math.log10(voiceOut / voiceIn)).toBeGreaterThan(-2); // voice barely touched
  });

  it('re-primes after a jump and stays aligned', async () => {
    const sig = voice(SR * 2, 0.3);
    const prof = noiseProfile(noise(SR, 1e-5), noise(SR, 1e-5, 3));
    const d = new AlignedDenoiser(prof, 12);
    const raw = async (from: number, n: number): Promise<[Float32Array, Float32Array]> => {
      const a = sig.slice(from, from + n);
      const b = new Float32Array(n);
      b.set(a);
      return [b, b];
    };
    await d.next(0, 4000, raw);
    const at = Math.round(1.3 * SR);
    const [l] = await d.next(at, 4000, raw); // seek
    let err = 0;
    for (let i = DENOISE_N; i < 4000; i++) err = Math.max(err, Math.abs(l[i]! - sig[at + i]!));
    expect(err).toBeLessThan(0.01);
  });

  it('has a fixed processing delay', () => {
    expect(SpectralDenoiser.delay).toBe(DENOISE_N - 256);
  });
});
