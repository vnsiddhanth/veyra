/**
 * Timeline timebase: integer "flicks" — 705,600,000 per second.
 *
 * A flick divides evenly into the frame duration of every common video frame rate
 * (including the NTSC 1000/1001 family) and the sample period of every common audio
 * sample rate. Representing all timeline positions as integers in this unit removes
 * floating-point drift from edit math. Seconds are only used at the media-engine boundary.
 */
export const FLICKS_PER_SECOND = 705_600_000;

/** Integer number of flicks. Branded only by convention to keep arithmetic ergonomic. */
export type Flicks = number;

/** A rational number, used for frame rates (e.g. 30000/1001). */
export interface Rational {
  num: number;
  den: number;
}

export const COMMON_FRAME_RATES: ReadonlyArray<{ label: string; rate: Rational }> = [
  { label: '23.976', rate: { num: 24000, den: 1001 } },
  { label: '24', rate: { num: 24, den: 1 } },
  { label: '25', rate: { num: 25, den: 1 } },
  { label: '29.97', rate: { num: 30000, den: 1001 } },
  { label: '30', rate: { num: 30, den: 1 } },
  { label: '50', rate: { num: 50, den: 1 } },
  { label: '59.94', rate: { num: 60000, den: 1001 } },
  { label: '60', rate: { num: 60, den: 1 } },
];

export function rateToNumber(rate: Rational): number {
  return rate.num / rate.den;
}

export function secondsToFlicks(seconds: number): Flicks {
  return Math.round(seconds * FLICKS_PER_SECOND);
}

export function flicksToSeconds(flicks: Flicks): number {
  return flicks / FLICKS_PER_SECOND;
}

/** Duration of one frame in flicks. Exact (integer) for every rate in COMMON_FRAME_RATES. */
export function frameDuration(rate: Rational): Flicks {
  return Math.round((FLICKS_PER_SECOND * rate.den) / rate.num);
}

export function framesToFlicks(frames: number, rate: Rational): Flicks {
  // Multiply before dividing to stay exact for large frame counts.
  return Math.round((frames * FLICKS_PER_SECOND * rate.den) / rate.num);
}

/** Frame index containing time `t` (floor). */
export function flicksToFrames(t: Flicks, rate: Rational): number {
  return Math.floor((t * rate.num) / (FLICKS_PER_SECOND * rate.den) + 1e-9);
}

export type QuantizeMode = 'floor' | 'round' | 'ceil';

/** Snap a time to the nearest frame boundary of `rate`. */
export function quantizeToFrame(t: Flicks, rate: Rational, mode: QuantizeMode = 'round'): Flicks {
  const exact = (t * rate.num) / (FLICKS_PER_SECOND * rate.den);
  const frames = mode === 'floor' ? Math.floor(exact + 1e-9) : mode === 'ceil' ? Math.ceil(exact - 1e-9) : Math.round(exact);
  return framesToFlicks(frames, rate);
}

/**
 * Best-effort conversion of a measured fps (e.g. 29.97002997) to a rational.
 * Recognises the NTSC family; otherwise rounds to 3 decimals.
 */
export function fpsToRational(fps: number): Rational {
  if (!Number.isFinite(fps) || fps <= 0) return { num: 30, den: 1 };
  for (const base of [24, 30, 60, 120, 240]) {
    if (Math.abs(fps - (base * 1000) / 1001) < 0.005) return { num: base * 1000, den: 1001 };
  }
  const rounded = Math.round(fps);
  if (Math.abs(fps - rounded) < 0.005) return { num: rounded, den: 1 };
  return { num: Math.round(fps * 1000), den: 1000 };
}

/**
 * SMPTE timecode. Uses drop-frame notation (`;`) for 29.97 and 59.94.
 */
export function formatTimecode(t: Flicks, rate: Rational): string {
  const negative = t < 0;
  let frame = flicksToFrames(Math.abs(t), rate);
  const fpsNominal = Math.round(rate.num / rate.den);
  const dropFrame = rate.den === 1001 && (fpsNominal === 30 || fpsNominal === 60);
  if (dropFrame) {
    // Standard drop-frame algorithm: skip frame numbers 0,1 (or 0-3 at 60) each minute except every 10th.
    const drop = fpsNominal === 30 ? 2 : 4;
    const framesPer10Min = fpsNominal * 600 - drop * 9;
    const framesPerMin = fpsNominal * 60 - drop;
    const d = Math.floor(frame / framesPer10Min);
    const m = frame % framesPer10Min;
    frame += drop * 9 * d + (m > drop ? drop * Math.floor((m - drop) / framesPerMin) : 0);
  }
  const ff = frame % fpsNominal;
  const totalSeconds = Math.floor(frame / fpsNominal);
  const ss = totalSeconds % 60;
  const mm = Math.floor(totalSeconds / 60) % 60;
  const hh = Math.floor(totalSeconds / 3600);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${negative ? '-' : ''}${p(hh)}:${p(mm)}:${p(ss)}${dropFrame ? ';' : ':'}${p(ff)}`;
}
