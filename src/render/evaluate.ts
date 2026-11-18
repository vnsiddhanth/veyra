/**
 * Pure timeline evaluation shared by preview and export: which clips are visible or audible at a
 * time, which source time each one shows, and the value of every animatable property.
 * No DOM, no media — fully unit-testable.
 */
import { assetSourceDuration } from '@/project/schema/factory';
import type { Asset, Clip, Easing, Keyframe, Project, Track, Transition } from '@/project/schema/types';
import { clipEnd } from '@/timeline/model/ops';
import { flicksToSeconds, frameDuration, type Flicks } from '@/utils/time';

// ── keyframes ─────────────────────────────────────────────────────────────

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

/** Animatable clip properties and their static fallback. */
export const ANIMATABLE = ['opacity', 'x', 'y', 'scale', 'rotation', 'volume'] as const;
export type AnimatableProp = (typeof ANIMATABLE)[number];

export function staticValue(clip: Clip, prop: AnimatableProp): number {
  switch (prop) {
    case 'opacity':
      return clip.opacity;
    case 'x':
      return clip.transform.x;
    case 'y':
      return clip.transform.y;
    case 'scale':
      return clip.transform.scaleX;
    case 'rotation':
      return clip.transform.rotation;
    case 'volume':
      return clip.audio.gain;
  }
}

export function propAt(clip: Clip, prop: AnimatableProp, local: Flicks): number {
  return evalKeyframes(clip.keyframes[prop], local, staticValue(clip, prop));
}

// ── source time ───────────────────────────────────────────────────────────

/**
 * Source time (seconds) a clip shows at timeline time `t`. May fall outside the clip's own range
 * during transitions; callers clamp to the media. Reversed clips play their source span backwards.
 */
export function sourceTimeAt(clip: Clip, t: Flicks, frame: Flicks): number {
  const local = t - clip.start;
  const span = clip.duration * clip.speed;
  if (!clip.reversed) return flicksToSeconds(clip.sourceIn + local * clip.speed);
  // The last timeline frame of a reversed clip shows the first source frame.
  return flicksToSeconds(clip.sourceIn + span - (local + frame) * clip.speed);
}

export function clampSource(seconds: number, asset: Asset | undefined): number {
  const dur = assetSourceDuration(asset);
  if (!Number.isFinite(dur)) return Math.max(0, seconds);
  // Stay strictly inside the media so the last frame is still found.
  return Math.max(0, Math.min(flicksToSeconds(dur) - 1e-4, seconds));
}

// ── transitions ───────────────────────────────────────────────────────────

/** Transition window: centred on the cut between the two clips. */
export function transitionWindow(p: Project, tr: Transition): { start: Flicks; end: Flicks } | null {
  const to = p.clips[tr.toClipId];
  const from = p.clips[tr.fromClipId];
  if (!to || !from) return null;
  const cut = to.start;
  const half = Math.floor(tr.duration / 2);
  return { start: cut - half, end: cut - half + tr.duration };
}

export function transitionsByClip(p: Project): Map<string, Transition[]> {
  const map = new Map<string, Transition[]>();
  for (const tr of Object.values(p.transitions)) {
    for (const id of [tr.fromClipId, tr.toClipId]) {
      const list = map.get(id) ?? [];
      list.push(tr);
      map.set(id, list);
    }
  }
  return map;
}

// ── frame resolution ──────────────────────────────────────────────────────

export interface ResolvedLayer {
  clip: Clip;
  asset: Asset | undefined;
  track: Track;
  /** Seconds into the source (video/image/subtitle); 0 for generated clips. */
  sourceTime: number;
  /** Flicks from clip start, used for keyframes and text animation. */
  local: Flicks;
  opacity: number;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  transition: { type: string; progress: number; role: 'from' | 'to'; params: Transition['params'] } | null;
}

const VISUAL_TRACKS = new Set(['video', 'overlay', 'text']);

/** Visual layers at time `t`, bottom first (compositing order). */
export function resolveFrame(p: Project, t: Flicks, byClip = transitionsByClip(p)): ResolvedLayer[] {
  const frame = frameDuration(p.settings.frameRate);
  const assets = new Map(p.assets.map((a) => [a.id, a]));
  const layers: ResolvedLayer[] = [];
  for (let i = p.tracks.length - 1; i >= 0; i--) {
    const track = p.tracks[i]!;
    if (track.hidden || !VISUAL_TRACKS.has(track.kind)) continue;
    const onTrack: ResolvedLayer[] = [];
    for (const id of track.clipIds) {
      const clip = p.clips[id]!;
      const asset = clip.assetId ? assets.get(clip.assetId) : undefined;
      if (asset && asset.kind === 'audio') continue;
      let transition: ResolvedLayer['transition'] = null;
      const inside = clip.start <= t && t < clipEnd(clip);
      if (!inside) {
        // Outside the clip's own range it is visible only as part of a transition.
        const tr = (byClip.get(id) ?? []).find((x) => {
          const w = transitionWindow(p, x);
          return w && t >= w.start && t < w.end && ((x.fromClipId === id && t >= clipEnd(clip)) || (x.toClipId === id && t < clip.start));
        });
        if (!tr) continue;
        const w = transitionWindow(p, tr)!;
        transition = { type: tr.type, progress: (t - w.start) / (w.end - w.start), role: tr.fromClipId === id ? 'from' : 'to', params: tr.params };
      } else {
        const tr = (byClip.get(id) ?? []).find((x) => {
          const w = transitionWindow(p, x);
          return w && t >= w.start && t < w.end;
        });
        if (tr) {
          const w = transitionWindow(p, tr)!;
          transition = { type: tr.type, progress: (t - w.start) / (w.end - w.start), role: tr.fromClipId === id ? 'from' : 'to', params: tr.params };
        }
      }
      const local = Math.max(0, Math.min(clip.duration - 1, t - clip.start));
      const src = asset && asset.kind !== 'image' ? clampSource(sourceTimeAt(clip, t, frame), asset) : 0;
      onTrack.push({
        clip,
        asset,
        track,
        sourceTime: src,
        local,
        opacity: Math.max(0, Math.min(1, propAt(clip, 'opacity', local))),
        x: propAt(clip, 'x', local),
        y: propAt(clip, 'y', local),
        scale: propAt(clip, 'scale', local),
        rotation: propAt(clip, 'rotation', local),
        transition,
      });
    }
    // Outgoing clip below incoming clip.
    onTrack.sort((a, b) => (a.transition?.role === 'to' ? 1 : 0) - (b.transition?.role === 'to' ? 1 : 0) || a.clip.start - b.clip.start);
    layers.push(...onTrack);
  }
  return layers;
}

// ── audio resolution ──────────────────────────────────────────────────────

export interface AudioSourceClip {
  clip: Clip;
  asset: Asset;
  track: Track;
}

/** Every clip that produces sound: clips on audio tracks, and video clips with audio on visual tracks. */
export function audibleClips(p: Project): AudioSourceClip[] {
  const assets = new Map(p.assets.map((a) => [a.id, a]));
  const out: AudioSourceClip[] = [];
  for (const track of p.tracks) {
    if (track.muted || track.kind === 'text') continue;
    for (const id of track.clipIds) {
      const clip = p.clips[id]!;
      const asset = clip.assetId ? assets.get(clip.assetId) : undefined;
      if (!asset?.info || asset.info.audio.length === 0) continue;
      if (clip.audio.gain <= 0 && !clip.keyframes.volume?.length) continue;
      if (clip.effects.some((e) => e.type === 'mute-audio' && e.enabled)) continue;
      out.push({ clip, asset, track });
    }
  }
  return out;
}

/** Linear gain of a clip at local time `local` including fades and the keyframed volume. */
export function clipGainAt(clip: Clip, local: Flicks): number {
  let g = propAt(clip, 'volume', local);
  const { fadeIn, fadeOut } = clip.audio;
  if (fadeIn > 0 && local < fadeIn) g *= local / fadeIn;
  if (fadeOut > 0 && local > clip.duration - fadeOut) g *= Math.max(0, (clip.duration - local) / fadeOut);
  return Math.max(0, g);
}

/** Active subtitle cue text for a subtitle-asset clip. */
export function subtitleTextAt(asset: Asset | undefined, sourceSeconds: number): string | null {
  const cues = asset?.subtitles;
  if (!cues) return null;
  const cue = cues.find((c) => sourceSeconds >= c.start && sourceSeconds < c.end);
  return cue ? cue.text : null;
}
