/**
 * Higher-level timeline edits used by the interactive timeline (Phase 4) and the inspector:
 * multi-clip moves, roll edits, ripple deletes, clipboard, markers, transitions, keyframes,
 * snapping. Pure functions over Project, like `ops.ts`; every result passes `checkIntegrity`.
 */
import { createClip, createTrack } from '@/project/schema/factory';
import type { Clip, Easing, Keyframe, Marker, Project, TextContent, Track } from '@/project/schema/types';
import { createId } from '@/utils/id';
import { frameDuration, quantizeToFrame, secondsToFlicks, type Flicks } from '@/utils/time';
import { clipEnd, overlaps, splitClip, TimelineError, trackAccepts, trimClipEnd, trimClipStart } from './ops';
import { assetSourceDuration } from '@/project/schema/factory';

const snapFrame = (p: Project, t: Flicks, mode: 'floor' | 'round' | 'ceil' = 'round') => quantizeToFrame(t, p.settings.frameRate, mode);
const getClip = (p: Project, id: string): Clip => {
  const c = p.clips[id];
  if (!c) throw new TimelineError(`Clip ${id} not found.`);
  return c;
};
const touch = (p: Project): Project => ({ ...p, updatedAt: Date.now() });

function kindOk(p: Project, clip: Clip, track: Track): boolean {
  if (clip.assetId) {
    const asset = p.assets.find((a) => a.id === clip.assetId);
    return !asset || trackAccepts(track.kind, asset.kind);
  }
  return clip.text ? track.kind === 'text' || track.kind === 'overlay' : true;
}

function rebuildTrackOrder(p: Project, clips: Record<string, Clip>): Track[] {
  const byTrack = new Map<string, string[]>();
  for (const c of Object.values(clips)) {
    const list = byTrack.get(c.trackId) ?? [];
    list.push(c.id);
    byTrack.set(c.trackId, list);
  }
  return p.tracks.map((t) => ({ ...t, clipIds: (byTrack.get(t.id) ?? []).sort((a, b) => clips[a]!.start - clips[b]!.start) }));
}

/** Drop transitions whose clips are gone or no longer adjacent on one track. */
function pruneTransitions(p: Project): Project {
  let changed = false;
  const transitions: Project['transitions'] = {};
  for (const [id, tr] of Object.entries(p.transitions)) {
    const a = p.clips[tr.fromClipId];
    const b = p.clips[tr.toClipId];
    if (a && b && a.trackId === b.trackId && clipEnd(a) === b.start) transitions[id] = tr;
    else changed = true;
  }
  return changed ? { ...p, transitions } : p;
}

// ── moving ────────────────────────────────────────────────────────────────

/**
 * Move several clips together by `delta` (flicks) and `trackDelta` rows (in the track list order).
 * All-or-nothing: throws if any clip would overlap, leave the timeline, or land on an incompatible
 * or locked track.
 */
export function moveClips(p: Project, ids: readonly string[], delta: Flicks, trackDelta = 0): Project {
  if (ids.length === 0 || (delta === 0 && trackDelta === 0)) return p;
  const moving = new Set(ids);
  const d = snapFrame(p, delta);
  const clips = { ...p.clips };
  const minStart = Math.min(...ids.map((id) => getClip(p, id).start));
  const shift = Math.max(d, -minStart);
  for (const id of ids) {
    const c = getClip(p, id);
    const fromIdx = p.tracks.findIndex((t) => t.id === c.trackId);
    if (p.tracks[fromIdx]!.locked) throw new TimelineError(`Track ${p.tracks[fromIdx]!.name} is locked.`);
    const to = p.tracks[fromIdx + trackDelta];
    if (!to) throw new TimelineError('There is no track there.');
    if (to.locked) throw new TimelineError(`Track ${to.name} is locked.`);
    if (!kindOk(p, c, to)) throw new TimelineError(`That clip cannot go on a ${to.kind} track.`);
    clips[id] = { ...c, start: c.start + shift, trackId: to.id };
  }
  // Overlap check against clips that are not moving, and among the moved clips themselves.
  const byTrack = new Map<string, Clip[]>();
  for (const c of Object.values(clips)) {
    const list = byTrack.get(c.trackId) ?? [];
    list.push(c);
    byTrack.set(c.trackId, list);
  }
  for (const list of byTrack.values()) {
    if (!list.some((c) => moving.has(c.id))) continue;
    list.sort((a, b) => a.start - b.start);
    for (let i = 1; i < list.length; i++) if (list[i]!.start < clipEnd(list[i - 1]!)) throw new TimelineError('There is already a clip at that position.');
  }
  return touch(pruneTransitions({ ...p, clips, tracks: rebuildTrackOrder(p, clips) }));
}

/** Largest delta ≤ |wanted| (same sign) that `moveClips` accepts — used while dragging against neighbours. */
export function clampMoveDelta(p: Project, ids: readonly string[], wanted: Flicks, trackDelta = 0): Flicks {
  const tryMove = (d: Flicks) => {
    try {
      moveClips(p, ids, d, trackDelta);
      return true;
    } catch {
      return false;
    }
  };
  if (tryMove(wanted)) return wanted;
  const fd = frameDuration(p.settings.frameRate);
  let lo = 0;
  let hi = Math.round(Math.abs(wanted) / fd);
  const sign = Math.sign(wanted);
  if (!tryMove(0)) return Number.NaN;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (tryMove(sign * mid * fd)) lo = mid;
    else hi = mid - 1;
  }
  return lo === 0 ? 0 : sign * lo * fd;
}

// ── trimming variants ─────────────────────────────────────────────────────

/** Roll edit: move the cut between two adjacent clips, keeping the overall length. */
export function rollEdit(p: Project, leftId: string, newCut: Flicks): Project {
  const left = getClip(p, leftId);
  const track = p.tracks.find((t) => t.id === left.trackId)!;
  const i = track.clipIds.indexOf(leftId);
  const right = track.clipIds[i + 1] ? p.clips[track.clipIds[i + 1]!]! : null;
  if (!right || right.start !== clipEnd(left)) throw new TimelineError('A roll edit needs two touching clips.');
  // Extend the one that grows first, so the other has room.
  const cut = snapFrame(p, newCut);
  if (cut > clipEnd(left)) {
    const q = trimClipStart(p, right.id, cut);
    const actual = q.clips[right.id]!.start;
    return trimClipEnd(q, leftId, actual);
  }
  const q = trimClipEnd(p, leftId, cut);
  return trimClipStart(q, right.id, clipEnd(q.clips[leftId]!));
}

/** Ripple-delete several clips: per track, later clips move left to close each gap. */
export function rippleDeleteClips(p: Project, ids: readonly string[]): Project {
  const remove = new Set(ids);
  const clips = { ...p.clips };
  for (const track of p.tracks) {
    const removed = track.clipIds.filter((id) => remove.has(id)).map((id) => getClip(p, id));
    if (!removed.length) continue;
    if (track.locked) throw new TimelineError(`Track ${track.name} is locked.`);
    for (const id of track.clipIds) {
      if (remove.has(id)) {
        delete clips[id];
        continue;
      }
      const c = clips[id]!;
      const gap = removed.filter((r) => clipEnd(r) <= c.start).reduce((s, r) => s + r.duration, 0);
      if (gap) clips[id] = { ...c, start: c.start - gap };
    }
  }
  return touch(pruneTransitions({ ...p, clips, tracks: rebuildTrackOrder(p, clips) }));
}

/** Split the given clips (or every unlocked clip) at `t`. Returns the new right-hand clip ids. */
export function splitAt(p: Project, t: Flicks, ids?: readonly string[]): [Project, string[]] {
  const at = snapFrame(p, t);
  const targets = (ids && ids.length ? ids.map((id) => getClip(p, id)) : Object.values(p.clips)).filter((c) => {
    const track = p.tracks.find((x) => x.id === c.trackId)!;
    return !track.locked && c.start < at && at < clipEnd(c);
  });
  if (!targets.length) throw new TimelineError('No clip under the playhead to split.');
  let q = p;
  const out: string[] = [];
  for (const c of targets) {
    const [next, rightId] = splitClip(q, c.id, at);
    q = next;
    out.push(rightId);
  }
  return [q, out];
}

/** Change a clip's speed; its timeline duration follows the source span. */
export function setClipSpeed(p: Project, id: string, speed: number): Project {
  const c = getClip(p, id);
  if (!(speed >= 0.05 && speed <= 16)) throw new TimelineError('Speed must be between 0.05× and 16×.');
  const span = c.duration * c.speed;
  const asset = c.assetId ? p.assets.find((a) => a.id === c.assetId) : undefined;
  const srcDur = assetSourceDuration(asset);
  let duration = snapFrame(p, span / speed, 'floor');
  if (Number.isFinite(srcDur)) duration = Math.min(duration, snapFrame(p, (srcDur - c.sourceIn) / speed, 'floor'));
  if (duration <= 0) throw new TimelineError('The clip would be shorter than one frame.');
  if (overlaps(p, c.trackId, c.start, c.start + duration, new Set([id]))) throw new TimelineError('Not enough room after the clip for the slower speed. Move the next clip first.');
  return touch(pruneTransitions({ ...p, clips: { ...p.clips, [id]: { ...c, speed, duration } } }));
}

// ── clipboard ─────────────────────────────────────────────────────────────

export interface ClipboardData {
  clips: Clip[];
  /** Earliest start among the copied clips. */
  origin: Flicks;
}

export function copyClips(p: Project, ids: readonly string[]): ClipboardData {
  const clips = ids.map((id) => getClip(p, id));
  return { clips: structuredClone(clips), origin: Math.min(...clips.map((c) => c.start)) };
}

/**
 * Paste clips with their relative timing at `at`. Each goes to its original track if it is free,
 * otherwise to the nearest compatible free track; a new track is added if none is free.
 */
export function pasteClips(p: Project, data: ClipboardData, at: Flicks): [Project, string[]] {
  const base = snapFrame(p, at);
  let q = p;
  const ids: string[] = [];
  for (const src of data.clips) {
    if (src.assetId && !q.assets.some((a) => a.id === src.assetId)) continue; // asset removed since copying
    const start = base + (src.start - data.origin);
    const fits = (t: Track) => !t.locked && kindOk(q, src, t) && !overlaps(q, t.id, start, start + src.duration);
    const original = q.tracks.find((t) => t.id === src.trackId);
    let track = original && fits(original) ? original : q.tracks.find(fits);
    if (!track) {
      const kind = original?.kind ?? (src.text ? 'text' : 'video');
      const t = createTrack(kind, `${kind[0]!.toUpperCase()}${q.tracks.filter((x) => x.kind === kind).length + 1}`);
      q = { ...q, tracks: kind === 'audio' ? [...q.tracks, t] : [t, ...q.tracks] };
      track = t;
    }
    const clip: Clip = { ...structuredClone(src), id: createId('clp'), trackId: track.id, start, effects: src.effects.map((e) => ({ ...e, id: createId('fx') })) };
    const clips = { ...q.clips, [clip.id]: clip };
    q = { ...q, clips, tracks: rebuildTrackOrder(q, clips) };
    ids.push(clip.id);
  }
  if (!ids.length) throw new TimelineError('Nothing to paste.');
  return [touch(q), ids];
}

// ── audio / text helpers ──────────────────────────────────────────────────

/** Put a video clip's sound on an audio track as its own clip and silence the video clip. */
export function detachAudio(p: Project, clipId: string): [Project, string] {
  const c = getClip(p, clipId);
  const asset = c.assetId ? p.assets.find((a) => a.id === c.assetId) : undefined;
  if (!asset || asset.kind !== 'video' || !asset.info?.audio.length) throw new TimelineError('This clip has no audio to detach.');
  if (c.effects.some((e) => e.type === 'mute-audio' && e.enabled)) throw new TimelineError('The audio is already detached.');
  let q = p;
  let track = q.tracks.find((t) => t.kind === 'audio' && !t.locked && !overlaps(q, t.id, c.start, clipEnd(c)));
  if (!track) {
    track = createTrack('audio', `A${q.tracks.filter((t) => t.kind === 'audio').length + 1}`);
    q = { ...q, tracks: [...q.tracks, track] };
  }
  const audio: Clip = {
    ...createClip({ trackId: track.id, assetId: c.assetId, start: c.start, duration: c.duration, sourceIn: c.sourceIn, name: `${c.name} (audio)` }),
    speed: c.speed,
    reversed: c.reversed,
    audio: { ...c.audio },
    keyframes: c.keyframes.volume ? { volume: c.keyframes.volume } : {},
    effects: c.effects.filter((e) => e.type === 'preserve-pitch').map((e) => ({ ...e, id: createId('fx') })),
  };
  const video: Clip = { ...c, effects: [...c.effects, { id: createId('fx'), type: 'mute-audio', enabled: true, params: {} }] };
  const clips = { ...q.clips, [c.id]: video, [audio.id]: audio };
  return [touch({ ...q, clips, tracks: rebuildTrackOrder(q, clips) }), audio.id];
}

export const DEFAULT_TEXT: TextContent = {
  text: 'Title',
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: 96,
  fontWeight: 700,
  color: '#ffffff',
  background: null,
  align: 'center',
  outline: { color: '#000000', width: 4 },
  shadow: null,
  letterSpacing: 0,
  lineHeight: 1.2,
};

/** Add a text clip on a text/overlay track (a free one is created if needed). */
export function addTextClip(p: Project, start: Flicks, duration: Flicks = secondsToFlicks(3), text = 'Title'): [Project, string] {
  const s = snapFrame(p, start);
  const d = Math.max(frameDuration(p.settings.frameRate), snapFrame(p, duration));
  let q = p;
  let track = q.tracks.find((t) => t.kind === 'text' && !t.locked && !overlaps(q, t.id, s, s + d));
  if (!track) {
    track = createTrack('text', `T${q.tracks.filter((t) => t.kind === 'text').length + 1}`);
    q = { ...q, tracks: [track, ...q.tracks] };
  }
  const clip: Clip = {
    ...createClip({ trackId: track.id, assetId: null, start: s, duration: d, name: text.slice(0, 40) }),
    text: { ...DEFAULT_TEXT, text, fontSize: Math.round(p.settings.height / 11) },
  };
  const clips = { ...q.clips, [clip.id]: clip };
  return [touch({ ...q, clips, tracks: rebuildTrackOrder(q, clips) }), clip.id];
}

/** Apply a partial update to a clip's non-timing fields (timing changes go through the edit ops). */
export function updateClip(p: Project, id: string, patch: Partial<Omit<Clip, 'id' | 'trackId' | 'start' | 'duration' | 'sourceIn' | 'speed'>>): Project {
  const c = getClip(p, id);
  return touch({ ...p, clips: { ...p.clips, [id]: { ...c, ...patch } } });
}

// ── transitions ───────────────────────────────────────────────────────────

/** Add (or replace) a transition at the cut after `fromId`. Duration is limited to the shorter clip. */
export function setTransitionAfter(p: Project, fromId: string, type: string, duration: Flicks): Project {
  const a = getClip(p, fromId);
  const track = p.tracks.find((t) => t.id === a.trackId)!;
  const nextId = track.clipIds[track.clipIds.indexOf(fromId) + 1];
  const b = nextId ? p.clips[nextId] : undefined;
  if (!b || b.start !== clipEnd(a)) throw new TimelineError('Transitions go between two touching clips on the same track.');
  const d = Math.max(frameDuration(p.settings.frameRate) * 2, Math.min(snapFrame(p, duration), a.duration, b.duration));
  const transitions = Object.fromEntries(Object.entries(p.transitions).filter(([, t]) => !(t.fromClipId === a.id && t.toClipId === b.id)));
  const id = createId('trn');
  transitions[id] = { id, type, fromClipId: a.id, toClipId: b.id, duration: d, params: {} };
  return touch({ ...p, transitions });
}

export function removeTransition(p: Project, id: string): Project {
  if (!p.transitions[id]) return p;
  const transitions = { ...p.transitions };
  delete transitions[id];
  return touch({ ...p, transitions });
}

// ── keyframes ─────────────────────────────────────────────────────────────

/** Insert or replace the keyframe of `prop` at `t` (flicks from clip start). */
export function setKeyframe(p: Project, clipId: string, prop: string, t: Flicks, value: number, easing: Easing = 'ease-in-out'): Project {
  const c = getClip(p, clipId);
  const at = Math.max(0, Math.min(c.duration, snapFrame(p, t)));
  const list = (c.keyframes[prop] ?? []).filter((k) => k.t !== at);
  const next: Keyframe[] = [...list, { t: at, value, easing }].sort((a, b) => a.t - b.t);
  return touch({ ...p, clips: { ...p.clips, [clipId]: { ...c, keyframes: { ...c.keyframes, [prop]: next } } } });
}

export function removeKeyframe(p: Project, clipId: string, prop: string, t: Flicks): Project {
  const c = getClip(p, clipId);
  const list = (c.keyframes[prop] ?? []).filter((k) => k.t !== t);
  const keyframes = { ...c.keyframes };
  if (list.length) keyframes[prop] = list;
  else delete keyframes[prop];
  return touch({ ...p, clips: { ...p.clips, [clipId]: { ...c, keyframes } } });
}

// ── markers & range ───────────────────────────────────────────────────────

const MARKER_COLORS = ['#f5a524', '#3fb950', '#58a6ff', '#f778ba', '#a371f7'];

export function addMarker(p: Project, t: Flicks, label?: string): [Project, string] {
  const at = Math.max(0, snapFrame(p, t));
  const existing = p.markers.find((m) => m.t === at);
  if (existing) return [p, existing.id];
  const m: Marker = { id: createId('mrk'), t: at, label: label ?? `Marker ${p.markers.length + 1}`, color: MARKER_COLORS[p.markers.length % MARKER_COLORS.length]! };
  return [touch({ ...p, markers: [...p.markers, m].sort((a, b) => a.t - b.t) }), m.id];
}

export function updateMarker(p: Project, id: string, patch: Partial<Omit<Marker, 'id'>>): Project {
  return touch({ ...p, markers: p.markers.map((m) => (m.id === id ? { ...m, ...patch, t: patch.t != null ? Math.max(0, snapFrame(p, patch.t)) : m.t } : m)).sort((a, b) => a.t - b.t) });
}

export function removeMarker(p: Project, id: string): Project {
  return touch({ ...p, markers: p.markers.filter((m) => m.id !== id) });
}

export function setInOut(p: Project, inPoint: Flicks | null, outPoint: Flicks | null): Project {
  const i = inPoint == null ? null : Math.max(0, snapFrame(p, inPoint));
  const o = outPoint == null ? null : Math.max(0, snapFrame(p, outPoint));
  if (i != null && o != null && o <= i) throw new TimelineError('The out point must be after the in point.');
  return touch({ ...p, inPoint: i, outPoint: o });
}

// ── snapping ──────────────────────────────────────────────────────────────

/** Times worth snapping to: clip edges (except `exclude`), markers, in/out, the playhead and 0. */
export function snapTargets(p: Project, exclude: ReadonlySet<string>, playhead: Flicks | null): Flicks[] {
  const set = new Set<Flicks>([0]);
  for (const c of Object.values(p.clips)) {
    if (exclude.has(c.id)) continue;
    set.add(c.start);
    set.add(clipEnd(c));
  }
  for (const m of p.markers) set.add(m.t);
  if (p.inPoint != null) set.add(p.inPoint);
  if (p.outPoint != null) set.add(p.outPoint);
  if (playhead != null) set.add(playhead);
  return [...set].sort((a, b) => a - b);
}

/**
 * Snap any of `edges` (candidate times that move together) to the nearest target within `threshold`.
 * Returns the correction to apply and the target that was hit.
 */
export function snapDelta(edges: readonly Flicks[], targets: readonly Flicks[], threshold: Flicks): { delta: Flicks; target: Flicks | null } {
  let best: { delta: Flicks; target: Flicks | null } = { delta: 0, target: null };
  let bestDist = threshold + 1;
  for (const e of edges) {
    for (const t of targets) {
      const d = Math.abs(t - e);
      if (d < bestDist) {
        bestDist = d;
        best = { delta: t - e, target: t };
      }
    }
  }
  return bestDist <= threshold ? best : { delta: 0, target: null };
}
