/**
 * Timeline audio mixdown, used for export and for preview playback. Runs anywhere (no Web Audio
 * needed, so it works in workers where OfflineAudioContext does not exist).
 *
 * Per clip: decode (AudioSampleSink, forward-streaming), resample to the project rate with the clip
 * speed (linear interpolation; pitch follows speed), apply the gain envelope, pan, EQ and
 * compressor, then sum per track, apply ducking, and sum to stereo with a soft limiter.
 */
import { AudioSampleSink, type AudioSample, type InputAudioTrack } from 'mediabunny';
import type { Clip, EffectInstance, Project } from '@/project/schema/types';
import { clipEnd } from '@/timeline/model/ops';
import { flicksToSeconds, secondsToFlicks } from '@/utils/time';
import { effectNum } from './effects';
import { hasSpeedRamp, rampedSpan, sourceAdvance } from './speed';
import { audibleClips, clipGainAt, type AudioSourceClip } from './evaluate';
import type { MediaPool } from './sources';
import { AlignedDenoiser, noiseProfile } from './denoise';

/** Longest clip span we reverse in memory (stereo 48 kHz float ≈ 23 MB per minute). */
export const MAX_REVERSE_SECONDS = 600;

class Biquad {
  private b0 = 1;
  private b1 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;
  private z1 = [0, 0];
  private z2 = [0, 0];

  constructor(type: 'lowshelf' | 'peaking' | 'highshelf', freq: number, gainDb: number, sampleRate: number, q = 0.9) {
    const A = 10 ** (gainDb / 40);
    const w = (2 * Math.PI * freq) / sampleRate;
    const cos = Math.cos(w);
    const sin = Math.sin(w);
    const alpha = sin / (2 * q);
    let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
    if (type === 'peaking') {
      b0 = 1 + alpha * A;
      b1 = -2 * cos;
      b2 = 1 - alpha * A;
      a0 = 1 + alpha / A;
      a1 = -2 * cos;
      a2 = 1 - alpha / A;
    } else {
      const s = 2 * Math.sqrt(A) * alpha;
      const sign = type === 'lowshelf' ? 1 : -1;
      b0 = A * (A + 1 - sign * (A - 1) * cos + s);
      b1 = 2 * sign * A * (A - 1 - sign * (A + 1) * cos);
      b2 = A * (A + 1 - sign * (A - 1) * cos - s);
      a0 = A + 1 + sign * (A - 1) * cos + s;
      a1 = -2 * sign * (A - 1 + sign * (A + 1) * cos);
      a2 = A + 1 + sign * (A - 1) * cos - s;
    }
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = a1 / a0;
    this.a2 = a2 / a0;
  }

  process(buf: Float32Array, ch: number) {
    let z1 = this.z1[ch]!;
    let z2 = this.z2[ch]!;
    for (let i = 0; i < buf.length; i++) {
      const x = buf[i]!;
      const y = this.b0 * x + z1;
      z1 = this.b1 * x - this.a1 * y + z2;
      z2 = this.b2 * x - this.a2 * y;
      buf[i] = y;
    }
    this.z1[ch] = z1;
    this.z2[ch] = z2;
  }
}

class Compressor {
  private env = 0;
  constructor(
    private readonly thresholdDb: number,
    private readonly ratio: number,
    private readonly makeupDb: number,
    private readonly sampleRate: number,
  ) {}
  process(l: Float32Array, r: Float32Array) {
    const att = Math.exp(-1 / (0.005 * this.sampleRate));
    const rel = Math.exp(-1 / (0.12 * this.sampleRate));
    const makeup = 10 ** (this.makeupDb / 20);
    for (let i = 0; i < l.length; i++) {
      const x = Math.max(Math.abs(l[i]!), Math.abs(r[i]!));
      this.env = x > this.env ? att * this.env + (1 - att) * x : rel * this.env + (1 - rel) * x;
      const db = 20 * Math.log10(this.env + 1e-9);
      const over = db - this.thresholdDb;
      const gain = over > 0 ? 10 ** ((-over * (1 - 1 / this.ratio)) / 20) : 1;
      l[i] = l[i]! * gain * makeup;
      r[i] = r[i]! * gain * makeup;
    }
  }
}

/**
 * WSOLA time-stretch: changes speed without changing pitch. Grains of N samples are overlap-added
 * every N/2 output samples (Hann windows sum to 1); each grain's source position is searched within
 * ±DELTA samples for the best waveform match with the previous grain's natural continuation.
 */
class Wsola {
  static readonly N = 2048;
  static readonly HA = 1024;
  static readonly DELTA = 384;
  private readonly win: Float32Array;
  private tail: [Float32Array, Float32Array] = [new Float32Array(Wsola.HA), new Float32Array(Wsola.HA)];
  private grain = 0; // index of the next grain
  private prevSrc = 0; // source start (samples) of the previous grain
  private outBuf: [number[], number[]] = [[], []];

  constructor(private readonly speed: number) {
    this.win = new Float32Array(Wsola.N);
    for (let i = 0; i < Wsola.N; i++) this.win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / Wsola.N);
  }

  /** Source lookahead (samples) needed beyond the nominal position. */
  static get margin(): number {
    return Wsola.N + Wsola.DELTA * 2;
  }

  /** Produce `n` output samples. `src(i, ch)` reads source sample i (at the output rate) of the clip span. */
  produce(n: number, src: (i: number, ch: number) => number): [Float32Array, Float32Array] {
    const { N, HA, DELTA } = Wsola;
    while (this.outBuf[0].length < n) {
      const ideal = Math.round(this.grain * HA * this.speed);
      let best = ideal;
      if (this.grain > 0) {
        // Natural continuation of the previous grain, compared on a decimated mono signal.
        const nat = this.prevSrc + HA;
        let bestScore = -Infinity;
        for (let d = -DELTA; d <= DELTA; d += 8) {
          const cand = Math.max(0, ideal + d);
          let score = 0;
          for (let i = 0; i < HA; i += 8) score += (src(cand + i, 0) + src(cand + i, 1)) * (src(nat + i, 0) + src(nat + i, 1));
          if (score > bestScore) {
            bestScore = score;
            best = cand;
          }
        }
      }
      this.prevSrc = best;
      for (let ch = 0; ch < 2; ch++) {
        const tail = this.tail[ch]!;
        const out = this.outBuf[ch]!;
        // First half overlaps the previous grain's second half.
        for (let i = 0; i < HA; i++) out.push(tail[i]! + src(best + i, ch) * this.win[i]!);
        for (let i = HA; i < N; i++) tail[i - HA] = src(best + i, ch) * this.win[i]!;
      }
      this.grain++;
    }
    const l = Float32Array.from(this.outBuf[0].splice(0, n));
    const r = Float32Array.from(this.outBuf[1].splice(0, n));
    return [l, r];
  }
}

/** Noise profiles by clip state, so restarting preview does not re-analyse. */
const PROFILE_CACHE = new Map<string, Float64Array>();
const DENOISE_MIN = 4096;

/** Decoded source audio for one clip, read forward through a sliding window. */
class ClipAudioReader {
  private iter: AsyncGenerator<AudioSample> | null = null;
  private chunks: { t0: number; rate: number; data: Float32Array[] }[] = [];
  private exhausted = false;
  /** Whole span decoded up-front (reversed clips). */
  private full: { t0: number; rate: number; data: Float32Array[] } | null = null;
  readonly eq: Biquad[] | null;
  readonly comp: Compressor | null;
  private readonly wsola: Wsola | null;
  /** Dialogue noise reduction (set up by `prepare`). */
  private denoiser: AlignedDenoiser | null = null;
  readonly denoiseDb: number | null;
  /** Source start time (transport streams); reader times count from the first frame. */
  private get offset(): number {
    return this.src.asset?.info?.startTime ?? 0;
  }
  /** Clip-relative output sample where time-stretching started (null until the first block). */
  private stretchOrigin: number | null = null;

  constructor(
    readonly src: AudioSourceClip,
    private readonly track: InputAudioTrack,
    private readonly outRate: number,
    private readonly startSource: number,
    withDenoise = true,
  ) {
    const fx = (type: string) => src.clip.effects.find((e) => e.enabled && e.type === type);
    const eq = fx('eq');
    this.eq = eq
      ? [
          new Biquad('lowshelf', 200, effectNum(eq, 'low', 0), outRate),
          new Biquad('peaking', 1000, effectNum(eq, 'mid', 0), outRate),
          new Biquad('highshelf', 5000, effectNum(eq, 'high', 0), outRate),
        ]
      : null;
    const c = fx('compressor');
    this.comp = c ? new Compressor(effectNum(c, 'threshold', -18), Math.max(1, effectNum(c, 'ratio', 4)), effectNum(c, 'makeup', 0), outRate) : null;
    const pitch = fx('preserve-pitch');
    // Pitch preservation applies to constant speeds; ramps play like a tape (pitch follows speed).
    this.wsola = pitch && !src.clip.reversed && !hasSpeedRamp(src.clip) && Math.abs(src.clip.speed - 1) > 1e-3 ? new Wsola(src.clip.speed) : null;
    const dn = withDenoise ? fx('denoise') : undefined;
    this.denoiseDb = dn ? Math.max(0, Math.min(40, effectNum(dn, 'reduction', 15))) : null;
  }

  /**
   * Learn the clip's noise profile (from its first seconds, so preview and export always agree) and
   * enable noise reduction. Returns a warning when it cannot apply.
   */
  async prepare(): Promise<string | null> {
    if (this.denoiseDb == null) return null;
    if (this.wsola) return `Noise reduction is not applied to ${this.src.clip.name} while “keep pitch” changes its speed.`;
    const clip = this.src.clip;
    const key = JSON.stringify([clip.assetId, clip.sourceIn, clip.duration, clip.speed, clip.reversed, clip.audio, clip.keyframes.volume ?? null, clip.keyframes.speed ?? null, this.outRate]);
    let profile = PROFILE_CACHE.get(key);
    if (!profile) {
      const scratch = new ClipAudioReader(this.src, this.track, this.outRate, flicksToSeconds(clip.sourceIn), false);
      try {
        if (clip.reversed) await scratch.loadReversed(flicksToSeconds(rampedSpan(clip)));
        const cs = flicksToSeconds(clip.start);
        const secs = Math.min(10, flicksToSeconds(clip.duration));
        const total = Math.max(DENOISE_MIN, Math.round(secs * this.outRate));
        const l = new Float32Array(total);
        const r = new Float32Array(total);
        const B = 4096;
        for (let pos = 0; pos < total; pos += B) {
          const n = Math.min(B, total - pos);
          const blk: [Float32Array, Float32Array] = [new Float32Array(n), new Float32Array(n)];
          await scratch.renderRaw(cs + pos / this.outRate, blk);
          l.set(blk[0], pos);
          r.set(blk[1], pos);
        }
        profile = noiseProfile(l, r);
      } finally {
        scratch.close();
      }
      if (PROFILE_CACHE.size > 32) PROFILE_CACHE.clear();
      PROFILE_CACHE.set(key, profile);
    }
    this.denoiser = new AlignedDenoiser(profile, this.denoiseDb);
    return null;
  }

  private static planar(s: AudioSample): Float32Array[] {
    const out: Float32Array[] = [];
    for (let ch = 0; ch < s.numberOfChannels; ch++) {
      const a = new Float32Array(s.numberOfFrames);
      s.copyTo(a, { planeIndex: ch, format: 'f32-planar' });
      out.push(a);
    }
    return out;
  }

  async loadReversed(span: number): Promise<void> {
    const clip = this.src.clip;
    const s0 = flicksToSeconds(clip.sourceIn);
    const s1 = s0 + span;
    const so = this.offset;
    const sink = new AudioSampleSink(this.track);
    const parts: { t: number; rate: number; data: Float32Array[] }[] = [];
    for await (const s of sink.samples(s0 + so, s1 + so)) {
      parts.push({ t: s.timestamp - so, rate: s.sampleRate, data: ClipAudioReader.planar(s) });
      s.close();
    }
    if (!parts.length) return;
    const rate = parts[0]!.rate;
    const chs = Math.max(...parts.map((x) => x.data.length));
    const total = parts.reduce((n, x) => n + x.data[0]!.length, 0);
    const data = Array.from({ length: chs }, () => new Float32Array(total));
    let off = 0;
    for (const part of parts) {
      for (let ch = 0; ch < chs; ch++) data[ch]!.set(part.data[Math.min(ch, part.data.length - 1)]!, off);
      off += part.data[0]!.length;
    }
    this.full = { t0: parts[0]!.t, rate, data };
  }

  private async ensure(until: number): Promise<void> {
    if (this.full) return;
    if (!this.iter) {
      const sink = new AudioSampleSink(this.track);
      this.iter = sink.samples(Math.max(0, this.startSource - 0.05) + this.offset);
    }
    while (!this.exhausted) {
      const last = this.chunks[this.chunks.length - 1];
      if (last && last.t0 + last.data[0]!.length / last.rate >= until) break;
      const r = await this.iter.next();
      if (r.done) {
        this.exhausted = true;
        break;
      }
      const s = r.value;
      this.chunks.push({ t0: s.timestamp - this.offset, rate: s.sampleRate, data: ClipAudioReader.planar(s) });
      s.close();
    }
  }

  private drop(before: number) {
    while (this.chunks.length > 1) {
      const c = this.chunks[0]!;
      if (c.t0 + c.data[0]!.length / c.rate < before - 0.05) this.chunks.shift();
      else break;
    }
  }

  private sampleAt(t: number, ch: number): number {
    const src = this.full ? [this.full] : this.chunks;
    for (const c of src) {
      const pos = (t - c.t0) * c.rate;
      const n = c.data[0]!.length;
      if (pos >= 0 && pos < n) {
        const d = c.data[Math.min(ch, c.data.length - 1)]!;
        const i = Math.floor(pos);
        const f = pos - i;
        return d[i]! * (1 - f) + (i + 1 < n ? d[i + 1]! : d[i]!) * f;
      }
    }
    return 0;
  }

  /** Fill `out` (stereo) for timeline seconds [t0, t0 + n/outRate), with the clip's audio effects. */
  async render(t0: number, out: [Float32Array, Float32Array]): Promise<boolean> {
    const clip = this.src.clip;
    if (this.denoiser) {
      const n = out[0].length;
      const cs = flicksToSeconds(clip.start);
      const ce = flicksToSeconds(clipEnd(clip));
      if (t0 + n / this.outRate <= cs || t0 >= ce) return false;
      const start = Math.round(t0 * this.outRate);
      const [l, r] = await this.denoiser.next(start, n, async (from, count) => {
        const blk: [Float32Array, Float32Array] = [new Float32Array(count), new Float32Array(count)];
        await this.renderRaw(from / this.outRate, blk);
        return blk;
      });
      out[0].set(l);
      out[1].set(r);
    } else if (!(await this.renderRaw(t0, out))) return false;
    if (this.wsola) return true; // the stretched path applies EQ/compression itself
    if (this.eq) for (const f of this.eq) for (let ch = 0; ch < 2; ch++) f.process(out[ch as 0 | 1], ch);
    this.comp?.process(out[0], out[1]);
    return true;
  }

  /** Source audio with gain and pan, before EQ/compression/noise reduction. */
  async renderRaw(t0: number, out: [Float32Array, Float32Array]): Promise<boolean> {
    const clip = this.src.clip;
    const n = out[0].length;
    const cs = flicksToSeconds(clip.start);
    const ce = flicksToSeconds(clipEnd(clip));
    const t1 = t0 + n / this.outRate;
    if (t1 <= cs || t0 >= ce) return false;
    const sIn = flicksToSeconds(clip.sourceIn);
    const span = flicksToSeconds(rampedSpan(clip));
    const ramp = hasSpeedRamp(clip);
    const srcAt = (t: number) => {
      const adv = ramp ? flicksToSeconds(sourceAdvance(clip, secondsToFlicks(t - cs))) : (t - cs) * clip.speed;
      return clip.reversed ? sIn + span - adv : sIn + adv;
    };
    if (!clip.reversed) {
      const margin = this.wsola ? (Wsola.margin / this.outRate) * Math.max(1, clip.speed) + 0.1 : 0.05;
      await this.ensure(srcAt(Math.min(t1, ce)) + margin);
      this.drop(srcAt(Math.max(t0, cs)) - (this.wsola ? (Wsola.margin / this.outRate) * 2 : 0));
    }
    if (this.wsola) return this.renderStretched(t0, out, cs, ce, sIn);
    const pan = Math.max(-1, Math.min(1, clip.audio.pan));
    const lg = Math.cos(((pan + 1) * Math.PI) / 4) * Math.SQRT2;
    const rg = Math.sin(((pan + 1) * Math.PI) / 4) * Math.SQRT2;
    for (let i = 0; i < n; i++) {
      const t = t0 + i / this.outRate;
      if (t < cs || t >= ce) continue;
      // Gain envelope evaluated every 64 samples is smooth enough and keeps this cheap.
      const g = (i & 63) === 0 || i === 0 ? clipGainAt(clip, secondsToFlicks(t - cs)) : NaN;
      if (!Number.isNaN(g)) this.gain = g;
      const st = srcAt(t);
      out[0][i] = this.sampleAt(st, 0) * this.gain * lg;
      out[1][i] = this.sampleAt(st, 1) * this.gain * rg;
    }
    return true;
  }

  private gain = 1;

  /** Pitch-preserving path: WSOLA output for the clip, aligned to the block. */
  private renderStretched(t0: number, out: [Float32Array, Float32Array], cs: number, ce: number, sIn: number): boolean {
    const n = out[0].length;
    const clip = this.src.clip;
    const startSample = Math.round((t0 - cs) * this.outRate);
    // The reader is created at (or before) the clip start for export; for a mid-clip preview start,
    // begin stretching from there.
    if (this.stretchOrigin === null) this.stretchOrigin = Math.max(0, startSample);
    const origin = this.stretchOrigin;
    const src = (i: number, ch: number) => this.sampleAt(sIn + (origin * clip.speed + i) / this.outRate, ch);
    const first = Math.max(0, -startSample); // block may begin before the clip
    const count = n - first;
    const [l, r] = this.wsola!.produce(count, src);
    const pan = Math.max(-1, Math.min(1, clip.audio.pan));
    const lg = Math.cos(((pan + 1) * Math.PI) / 4) * Math.SQRT2;
    const rg = Math.sin(((pan + 1) * Math.PI) / 4) * Math.SQRT2;
    for (let i = 0; i < count; i++) {
      const t = t0 + (first + i) / this.outRate;
      if (t >= ce) break;
      if ((i & 63) === 0) this.gain = clipGainAt(clip, secondsToFlicks(t - cs));
      out[0][first + i] = l[i]! * this.gain * lg;
      out[1][first + i] = r[i]! * this.gain * rg;
    }
    if (this.eq) for (const f of this.eq) for (let ch = 0; ch < 2; ch++) f.process(out[ch as 0 | 1], ch);
    this.comp?.process(out[0], out[1]);
    return true;
  }

  close() {
    void this.iter?.return(undefined);
    this.iter = null;
    this.chunks = [];
    this.full = null;
  }
}

/** Mixes a project's audio in consecutive blocks starting at `startSeconds`. */
export class AudioMixer {
  private readers: ClipAudioReader[] | null = null;
  private time: number;
  readonly warnings = new Set<string>();

  constructor(
    private readonly project: Project,
    private readonly pool: MediaPool,
    readonly sampleRate: number,
    startSeconds = 0,
  ) {
    this.time = startSeconds;
  }

  private async init() {
    const readers: ClipAudioReader[] = [];
    for (const src of audibleClips(this.project)) {
      if (clipEnd(src.clip) <= secondsToFlicks(this.time)) continue;
      if (!this.pool.hasFile(src.asset.id)) {
        this.warnings.add(`Media offline: ${src.asset.name}`);
        continue;
      }
      const input = this.pool.input(src.asset.id)!;
      const track = await input.getPrimaryAudioTrack();
      if (!track || !(await track.canDecode())) {
        this.warnings.add(`Audio of ${src.asset.name} cannot be decoded in this browser.`);
        continue;
      }
      const cs = flicksToSeconds(src.clip.start);
      const startSource = flicksToSeconds(src.clip.sourceIn + sourceAdvance(src.clip, secondsToFlicks(Math.max(0, this.time - cs))));
      const r = new ClipAudioReader(src, track, this.sampleRate, startSource);
      const warn = await r.prepare();
      if (warn) this.warnings.add(warn);
      if (src.clip.reversed) {
        const span = flicksToSeconds(rampedSpan(src.clip));
        if (span > MAX_REVERSE_SECONDS) {
          this.warnings.add(`Reversed audio is limited to ${MAX_REVERSE_SECONDS / 60} minutes per clip; ${src.clip.name} is silent.`);
          continue;
        }
        await r.loadReversed(span);
      }
      readers.push(r);
    }
    this.readers = readers;
  }

  /** Next block of `frames` stereo samples (planar). */
  async next(frames: number): Promise<[Float32Array, Float32Array]> {
    if (!this.readers) await this.init();
    const t0 = this.time;
    const mix: [Float32Array, Float32Array] = [new Float32Array(frames), new Float32Array(frames)];
    const perTrack = new Map<string, [Float32Array, Float32Array]>();
    const tmp: [Float32Array, Float32Array] = [new Float32Array(frames), new Float32Array(frames)];
    const ducked: { r: ClipAudioReader; fx: EffectInstance }[] = [];

    const add = (dst: [Float32Array, Float32Array], src: [Float32Array, Float32Array]) => {
      for (let ch = 0; ch < 2; ch++) {
        const d = dst[ch]!;
        const s = src[ch]!;
        for (let i = 0; i < frames; i++) d[i] = d[i]! + s[i]!;
      }
    };
    for (const r of this.readers!) {
      const duck = r.src.clip.effects.find((e) => e.enabled && e.type === 'ducking');
      if (duck) {
        ducked.push({ r, fx: duck });
        continue;
      }
      tmp[0].fill(0);
      tmp[1].fill(0);
      if (await r.render(t0, tmp)) {
        let acc = perTrack.get(r.src.track.id);
        if (!acc) {
          acc = [new Float32Array(frames), new Float32Array(frames)];
          perTrack.set(r.src.track.id, acc);
        }
        add(acc, tmp);
      }
    }
    for (const [trackId, acc] of perTrack) {
      const vol = this.project.tracks.find((t) => t.id === trackId)?.volume ?? 1;
      if (vol !== 1) for (let ch = 0; ch < 2; ch++) for (let i = 0; i < frames; i++) acc[ch]![i] = acc[ch]![i]! * vol;
      add(mix, acc);
    }

    // Ducking: lower a clip while its side-chain track carries signal above −40 dBFS.
    for (const { r, fx } of ducked) {
      tmp[0].fill(0);
      tmp[1].fill(0);
      if (!(await r.render(t0, tmp))) continue;
      const side = perTrack.get(String(fx.params.sidechainTrackId ?? ''));
      const reduce = 10 ** (effectNum(fx, 'amount', -12) / 20);
      if (side) {
        let env = 0;
        const att = Math.exp(-1 / (0.01 * this.sampleRate));
        const rel = Math.exp(-1 / (0.3 * this.sampleRate));
        for (let i = 0; i < frames; i++) {
          const x = Math.max(Math.abs(side[0][i]!), Math.abs(side[1][i]!));
          env = x > env ? att * env + (1 - att) * x : rel * env + (1 - rel) * x;
          const g = env > 0.01 ? reduce : 1;
          tmp[0][i] = tmp[0][i]! * g;
          tmp[1][i] = tmp[1][i]! * g;
        }
      }
      const vol = r.src.track.volume ?? 1;
      if (vol !== 1) for (let ch = 0; ch < 2; ch++) for (let i = 0; i < frames; i++) tmp[ch]![i] = tmp[ch]![i]! * vol;
      add(mix, tmp);
    }

    // Soft clip above 0 dBFS instead of hard-clipping the encoder input.
    for (let ch = 0; ch < 2; ch++) {
      const d = mix[ch]!;
      for (let i = 0; i < frames; i++) {
        const x = d[i]!;
        if (x > 0.95 || x < -0.95) d[i] = Math.tanh(x);
      }
    }
    this.time += frames / this.sampleRate;
    return mix;
  }

  close() {
    for (const r of this.readers ?? []) r.close();
    this.readers = null;
  }
}

export function isClipAudible(p: Project, clip: Clip): boolean {
  return audibleClips(p).some((c) => c.clip.id === clip.id);
}
