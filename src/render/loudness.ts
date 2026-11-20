/**
 * Loudness measurement and normalisation for export.
 *
 * - LoudnessMeter: integrated loudness per ITU-R BS.1770-4 / EBU R128 (K-weighting, 400 ms blocks
 *   with 75 % overlap, absolute gate −70 LUFS, relative gate −10 LU). Stereo, channel weights 1.
 * - PeakLimiter: look-ahead limiter that keeps sample peaks under a ceiling without adding delay
 *   (it reads ahead from its source). Gain falls smoothly before a peak and recovers afterwards.
 */

export const LOUDNESS_TARGETS = [
  { lufs: -14, label: '−14 LUFS · YouTube, Spotify, most streaming' },
  { lufs: -16, label: '−16 LUFS · Apple Music, podcasts' },
  { lufs: -23, label: '−23 LUFS · EBU R128 broadcast, many festivals' },
  { lufs: -24, label: '−24 LUFS · US broadcast (ATSC A/85)' },
] as const;

class Biquad {
  private z1 = 0;
  private z2 = 0;
  constructor(
    private b0: number,
    private b1: number,
    private b2: number,
    private a1: number,
    private a2: number,
  ) {}
  run(x: number): number {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
}

/** The two K-weighting stages for any sample rate (coefficients as in libebur128). */
function kWeighting(fs: number): [Biquad, Biquad] {
  let f0 = 1681.974450955533;
  const G = 3.999843853973347;
  let Q = 0.7071752369554196;
  let K = Math.tan((Math.PI * f0) / fs);
  const Vh = 10 ** (G / 20);
  const Vb = Vh ** 0.4996667741545416;
  let a0 = 1 + K / Q + K * K;
  const shelf = new Biquad((Vh + (Vb * K) / Q + K * K) / a0, (2 * (K * K - Vh)) / a0, (Vh - (Vb * K) / Q + K * K) / a0, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0);
  f0 = 38.13547087602444;
  Q = 0.5003270373238773;
  K = Math.tan((Math.PI * f0) / fs);
  a0 = 1 + K / Q + K * K;
  const hp = new Biquad(1, -2, 1, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0);
  return [shelf, hp];
}

const toLufs = (meanSquare: number) => -0.691 + 10 * Math.log10(meanSquare);

export class LoudnessMeter {
  private readonly filters: [Biquad, Biquad][];
  private readonly hop: number;
  private acc = 0;
  private n = 0;
  /** Mean square (summed over channels) of each 100 ms hop. */
  private readonly hops: number[] = [];
  private peak = 0;

  constructor(readonly sampleRate: number) {
    this.filters = [kWeighting(sampleRate), kWeighting(sampleRate)];
    this.hop = Math.round(sampleRate / 10);
  }

  add(left: Float32Array, right: Float32Array, frames = left.length): void {
    const [fl, fr] = this.filters;
    for (let i = 0; i < frames; i++) {
      const l = left[i]!;
      const r = right[i]!;
      this.peak = Math.max(this.peak, Math.abs(l), Math.abs(r));
      const kl = fl![1].run(fl![0].run(l));
      const kr = fr![1].run(fr![0].run(r));
      this.acc += kl * kl + kr * kr;
      if (++this.n === this.hop) {
        this.hops.push(this.acc / this.hop);
        this.acc = 0;
        this.n = 0;
      }
    }
  }

  /** Integrated loudness in LUFS, or −Infinity for silence. */
  integrated(): number {
    const blocks: number[] = [];
    for (let i = 0; i + 4 <= this.hops.length; i++) blocks.push((this.hops[i]! + this.hops[i + 1]! + this.hops[i + 2]! + this.hops[i + 3]!) / 4);
    const abs = blocks.filter((z) => toLufs(z) > -70);
    if (!abs.length) return -Infinity;
    const rel = toLufs(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
    const gated = abs.filter((z) => toLufs(z) > rel);
    return toLufs(gated.reduce((a, b) => a + b, 0) / gated.length);
  }

  /** Highest absolute sample value seen, in dBFS. */
  samplePeakDb(): number {
    return this.peak > 0 ? 20 * Math.log10(this.peak) : -Infinity;
  }
}

type Pull = (frames: number) => Promise<[Float32Array, Float32Array]>;

/**
 * Applies `gainDb` and limits sample peaks to `ceilingDb`, reading ahead from `pull` so the output
 * stays sample-aligned with the input. Gain reduction ramps in over the look-ahead window (no clicks)
 * and recovers with a release time.
 */
export class PeakLimiter {
  private readonly look: number;
  private readonly ceiling: number;
  private readonly gain: number;
  private readonly releaseCoef: number;
  private bufL = new Float32Array(0);
  private bufR = new Float32Array(0);
  private len = 0;
  private g = 1;
  /** Number of output samples whose gain was reduced (for reporting). */
  limited = 0;

  constructor(
    private readonly pull: Pull,
    sampleRate: number,
    gainDb: number,
    ceilingDb = -1,
    lookaheadMs = 5,
    releaseMs = 80,
  ) {
    this.look = Math.max(1, Math.round((lookaheadMs / 1000) * sampleRate));
    this.ceiling = 10 ** (ceilingDb / 20);
    this.gain = 10 ** (gainDb / 20);
    this.releaseCoef = Math.exp(-1 / ((releaseMs / 1000) * sampleRate));
  }

  private async fill(need: number) {
    while (this.len < need) {
      const [l, r] = await this.pull(Math.max(2048, need - this.len));
      const n = l.length;
      if (this.bufL.length < this.len + n) {
        const cap = Math.max(this.len + n, this.bufL.length * 2);
        const nl = new Float32Array(cap);
        const nr = new Float32Array(cap);
        nl.set(this.bufL.subarray(0, this.len));
        nr.set(this.bufR.subarray(0, this.len));
        this.bufL = nl;
        this.bufR = nr;
      }
      for (let i = 0; i < n; i++) {
        this.bufL[this.len + i] = l[i]! * this.gain;
        this.bufR[this.len + i] = r[i]! * this.gain;
      }
      this.len += n;
    }
  }

  async next(frames: number): Promise<[Float32Array, Float32Array]> {
    const L = this.look;
    await this.fill(frames + L);
    const outL = new Float32Array(frames);
    const outR = new Float32Array(frames);
    for (let i = 0; i < frames; i++) {
      // Gain needed so that every sample up to L ahead fits, ramped linearly over the distance to it.
      let target = 1;
      for (let k = 0; k <= L; k++) {
        const p = Math.max(Math.abs(this.bufL[i + k]!), Math.abs(this.bufR[i + k]!));
        if (p > this.ceiling) {
          const need = this.ceiling / p;
          // Reach `need` by sample i+k: allowed gain now is between current g and need.
          const ramp = need + ((this.g - need) * k) / (L + 1);
          if (ramp < target) target = ramp;
        }
      }
      // Attack follows the ramp immediately; release recovers towards the target exponentially.
      this.g = target < this.g ? target : this.g + (target - this.g) * (1 - this.releaseCoef);
      if (this.g < 0.9999) this.limited++;
      let l = this.bufL[i]! * this.g;
      let r = this.bufR[i]! * this.g;
      // Hard guard for anything the ramp could not anticipate (first samples).
      if (l > this.ceiling) l = this.ceiling;
      else if (l < -this.ceiling) l = -this.ceiling;
      if (r > this.ceiling) r = this.ceiling;
      else if (r < -this.ceiling) r = -this.ceiling;
      outL[i] = l;
      outR[i] = r;
    }
    this.bufL.copyWithin(0, frames, this.len);
    this.bufR.copyWithin(0, frames, this.len);
    this.len -= frames;
    return [outL, outR];
  }
}
