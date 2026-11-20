/**
 * Dialogue noise reduction: STFT spectral noise suppression.
 *
 * - Analysis/synthesis with a square-root Hann window, N = 1024, hop = 256 (75 % overlap), so an
 *   untouched signal is reconstructed exactly.
 * - The noise profile is a per-frequency noise power learned from the clip itself (a low percentile
 *   of each bin's power over its first seconds: the level the bin falls back to between words).
 * - Per frame, a decision-directed Wiener gain (Ephraim–Malah style a-priori SNR) is computed from
 *   the summed L+R power, smoothed across neighbouring bins, floored at −`reductionDb` and applied
 *   identically to both channels (the stereo image does not move).
 *
 * `process()` has a fixed delay of N − hop samples; `AlignedDenoiser` hides it by reading ahead.
 */

export const DENOISE_N = 1024;
export const DENOISE_HOP = 256;
const BINS = DENOISE_N / 2 + 1;

/** In-place radix-2 complex FFT (inverse when `inv`). */
export class Fft {
  private readonly cos: Float64Array;
  private readonly sin: Float64Array;
  private readonly rev: Uint32Array;
  constructor(readonly n: number) {
    this.cos = new Float64Array(n / 2);
    this.sin = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i++) {
      this.cos[i] = Math.cos((2 * Math.PI * i) / n);
      this.sin[i] = Math.sin((2 * Math.PI * i) / n);
    }
    this.rev = new Uint32Array(n);
    const bits = Math.log2(n);
    for (let i = 0; i < n; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
      this.rev[i] = r;
    }
  }
  run(re: Float64Array, im: Float64Array, inv = false): void {
    const n = this.n;
    for (let i = 0; i < n; i++) {
      const j = this.rev[i]!;
      if (j > i) {
        let t = re[i]!;
        re[i] = re[j]!;
        re[j] = t;
        t = im[i]!;
        im[i] = im[j]!;
        im[j] = t;
      }
    }
    const sgn = inv ? 1 : -1;
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1;
      const step = n / size;
      for (let start = 0; start < n; start += size) {
        for (let k = 0; k < half; k++) {
          const c = this.cos[k * step]!;
          const s = sgn * this.sin[k * step]!;
          const a = start + k;
          const b = a + half;
          const tr = re[b]! * c - im[b]! * s;
          const ti = re[b]! * s + im[b]! * c;
          re[b] = re[a]! - tr;
          im[b] = im[a]! - ti;
          re[a] = re[a]! + tr;
          im[a] = im[a]! + ti;
        }
      }
    }
    if (inv) for (let i = 0; i < n; i++) {
      re[i] = re[i]! / n;
      im[i] = im[i]! / n;
    }
  }
}

const sqrtHann = (() => {
  const w = new Float64Array(DENOISE_N);
  for (let i = 0; i < DENOISE_N; i++) w[i] = Math.sqrt(0.5 - 0.5 * Math.cos((2 * Math.PI * i) / DENOISE_N));
  return w;
})();
// sqrt-Hann analysis × synthesis = Hann; Hann at 75 % overlap sums to 2.
const OLA_NORM = 0.5;

/** Per-bin noise power: the `pct` percentile of each bin's L+R power over the frames of a sample. */
export function noiseProfile(left: Float32Array, right: Float32Array, pct = 0.2): Float64Array {
  const fft = new Fft(DENOISE_N);
  const re = new Float64Array(DENOISE_N);
  const im = new Float64Array(DENOISE_N);
  const frames: Float64Array[] = [];
  for (let pos = 0; pos + DENOISE_N <= left.length; pos += DENOISE_HOP) {
    const pw = new Float64Array(BINS);
    for (const ch of [left, right]) {
      for (let i = 0; i < DENOISE_N; i++) {
        re[i] = ch[pos + i]! * sqrtHann[i]!;
        im[i] = 0;
      }
      fft.run(re, im);
      for (let k = 0; k < BINS; k++) pw[k] = pw[k]! + re[k]! * re[k]! + im[k]! * im[k]!;
    }
    frames.push(pw);
  }
  const out = new Float64Array(BINS);
  if (!frames.length) return out;
  const col = new Float64Array(frames.length);
  // A noise bin's power is exponentially distributed, so its p-th percentile is −ln(1−p) × the mean.
  const toMean = 1 / -Math.log(1 - pct);
  for (let k = 0; k < BINS; k++) {
    for (let f = 0; f < frames.length; f++) col[f] = frames[f]![k]!;
    col.sort();
    out[k] = col[Math.min(frames.length - 1, Math.floor(pct * frames.length))]! * toMean;
  }
  return out;
}

export class SpectralDenoiser {
  private readonly fft = new Fft(DENOISE_N);
  private readonly inL = new Float64Array(DENOISE_N);
  private readonly inR = new Float64Array(DENOISE_N);
  private readonly olaL = new Float64Array(DENOISE_N);
  private readonly olaR = new Float64Array(DENOISE_N);
  private fill = 0; // samples gathered towards the next hop
  private readonly pendL = new Float64Array(DENOISE_HOP);
  private readonly pendR = new Float64Array(DENOISE_HOP);
  private outL: number[] = [];
  private outR: number[] = [];
  private readonly prevGain = new Float64Array(BINS).fill(1);
  private readonly prevPow = new Float64Array(BINS);
  private readonly floor: number;
  private readonly reL = new Float64Array(DENOISE_N);
  private readonly imL = new Float64Array(DENOISE_N);
  private readonly reR = new Float64Array(DENOISE_N);
  private readonly imR = new Float64Array(DENOISE_N);
  private readonly gain = new Float64Array(BINS);

  /** Delay between input and output, in samples. */
  static readonly delay = DENOISE_N - DENOISE_HOP;

  constructor(
    private readonly noise: Float64Array,
    reductionDb = 15,
  ) {
    this.floor = 10 ** (-Math.max(0, reductionDb) / 20);
  }

  /** Feed samples; processed samples become available through `read`. */
  push(l: Float32Array, r: Float32Array, n = l.length): void {
    for (let i = 0; i < n; i++) {
      this.pendL[this.fill] = l[i]!;
      this.pendR[this.fill] = r[i]!;
      if (++this.fill === DENOISE_HOP) {
        this.fill = 0;
        this.frame();
      }
    }
  }

  available(): number {
    return this.outL.length;
  }

  read(n: number): [Float32Array, Float32Array] {
    const l = Float32Array.from(this.outL.splice(0, n));
    const r = Float32Array.from(this.outR.splice(0, n));
    return [l, r];
  }

  private frame() {
    const N = DENOISE_N;
    const H = DENOISE_HOP;
    this.inL.copyWithin(0, H);
    this.inR.copyWithin(0, H);
    this.inL.set(this.pendL, N - H);
    this.inR.set(this.pendR, N - H);
    const { reL, imL, reR, imR, gain } = this;
    for (let i = 0; i < N; i++) {
      reL[i] = this.inL[i]! * sqrtHann[i]!;
      reR[i] = this.inR[i]! * sqrtHann[i]!;
      imL[i] = 0;
      imR[i] = 0;
    }
    this.fft.run(reL, imL);
    this.fft.run(reR, imR);
    // Decision-directed a-priori SNR → Wiener gain, per bin.
    for (let k = 0; k < BINS; k++) {
      const p = reL[k]! * reL[k]! + imL[k]! * imL[k]! + reR[k]! * reR[k]! + imR[k]! * imR[k]!;
      const nk = Math.max(this.noise[k]!, 1e-12);
      const post = p / nk;
      const prio = 0.96 * ((this.prevGain[k]! * this.prevGain[k]! * this.prevPow[k]!) / nk) + 0.04 * Math.max(post - 1, 0);
      gain[k] = prio / (1 + prio);
      this.prevPow[k] = p;
    }
    // Smooth across neighbouring bins (less "musical noise"), then floor and remember.
    let prev = gain[0]!;
    for (let k = 0; k < BINS; k++) {
      const cur = gain[k]!;
      const next = k + 1 < BINS ? gain[k + 1]! : cur;
      const g = Math.max(this.floor, (prev + 2 * cur + next) / 4);
      prev = cur;
      this.prevGain[k] = g;
      gain[k] = g;
    }
    for (let k = 0; k < BINS; k++) {
      const g = gain[k]!;
      reL[k] = reL[k]! * g;
      imL[k] = imL[k]! * g;
      reR[k] = reR[k]! * g;
      imR[k] = imR[k]! * g;
      if (k > 0 && k < N / 2) {
        // Keep the spectrum Hermitian so the inverse is real.
        reL[N - k] = reL[k]!;
        imL[N - k] = -imL[k]!;
        reR[N - k] = reR[k]!;
        imR[N - k] = -imR[k]!;
      }
    }
    this.fft.run(reL, imL, true);
    this.fft.run(reR, imR, true);
    for (let i = 0; i < N; i++) {
      this.olaL[i] = this.olaL[i]! + reL[i]! * sqrtHann[i]! * OLA_NORM;
      this.olaR[i] = this.olaR[i]! + reR[i]! * sqrtHann[i]! * OLA_NORM;
    }
    for (let i = 0; i < H; i++) {
      this.outL.push(this.olaL[i]!);
      this.outR.push(this.olaR[i]!);
    }
    this.olaL.copyWithin(0, H);
    this.olaR.copyWithin(0, H);
    this.olaL.fill(0, N - H);
    this.olaR.fill(0, N - H);
  }
}

/**
 * Zero-latency wrapper: output block k is the processed input of the same timeline span. It pulls
 * input from `raw(offset, n)` (stream sample offset relative to `start`) DENOISE_N samples ahead.
 * Call `next(start, n)` with contiguous spans; a jump re-primes it.
 */
export class AlignedDenoiser {
  private d: SpectralDenoiser | null = null;
  private expect = Number.NaN;
  private fed = 0;

  constructor(
    private readonly noise: Float64Array,
    private readonly reductionDb: number,
  ) {}

  /** `start` and `n` in samples; `raw(from, n)` returns that many input samples starting at sample `from`. */
  async next(start: number, n: number, raw: (from: number, n: number) => Promise<[Float32Array, Float32Array]>): Promise<[Float32Array, Float32Array]> {
    if (!this.d || start !== this.expect) {
      this.d = new SpectralDenoiser(this.noise, this.reductionDb);
      // Prime with N samples from `start`, then drop the outputs that belong to time before `start`.
      const [l, r] = await raw(start, DENOISE_N);
      this.d.push(l, r);
      this.d.read(SpectralDenoiser.delay);
      this.fed = start + DENOISE_N;
    }
    const [l, r] = await raw(this.fed, n);
    this.d.push(l, r);
    this.fed += n;
    this.expect = start + n;
    return this.d.read(n);
  }
}
