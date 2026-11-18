/**
 * Pure timeline edit operations. Each takes a Project and returns a new Project
 * (unchanged subtrees are shared), or throws TimelineError without side effects.
 *
 * All times are integer flicks. Operations that accept user-driven times snap them to the
 * project frame grid so that every clip boundary falls on a frame boundary.
 */
import { DEFAULT_STILL_DURATION, assetSourceDuration, createClip, createTrack } from '@/project/schema/factory';
import type { Clip, Project, Track, TrackKind } from '@/project/schema/types';
import { createId } from '@/utils/id';
import { quantizeToFrame, type Flicks } from '@/utils/time';

export class TimelineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimelineError';
  }
}

// ── helpers ────────────────────────────────────────────────────────────────

export const clipEnd = (c: Clip): Flicks => c.start + c.duration;

function getTrack(p: Project, trackId: string): Track {
  const t = p.tracks.find((x) => x.id === trackId);
  if (!t) throw new TimelineError(`Track ${trackId} not found.`);
  return t;
}

function getClip(p: Project, clipId: string): Clip {
  const c = p.clips[clipId];
  if (!c) throw new TimelineError(`Clip ${clipId} not found.`);
  return c;
}

function assertUnlocked(t: Track): void {
  if (t.locked) throw new TimelineError(`Track ${t.name} is locked.`);
}

function snap(p: Project, t: Flicks): Flicks {
  return quantizeToFrame(t, p.settings.frameRate, 'round');
}

/** Source flicks consumed by a clip (timeline duration × speed). */
export function sourceSpan(c: Clip): Flicks {
  return Math.round(c.duration * c.speed);
}

function withTrack(p: Project, track: Track): Project {
  return { ...p, tracks: p.tracks.map((t) => (t.id === track.id ? track : t)), updatedAt: Date.now() };
}

function sortIds(p: Project, ids: string[], extra: Record<string, Clip> = {}): string[] {
  const get = (id: string) => extra[id] ?? p.clips[id]!;
  return [...ids].sort((a, b) => get(a).start - get(b).start);
}

/** True if [start, end) intersects any clip on the track, excluding `ignore`. */
export function overlaps(p: Project, trackId: string, start: Flicks, end: Flicks, ignore: ReadonlySet<string> = new Set()): boolean {
  const t = getTrack(p, trackId);
  return t.clipIds.some((id) => {
    if (ignore.has(id)) return false;
    const c = p.clips[id]!;
    return start < clipEnd(c) && c.start < end;
  });
}

export function projectDuration(p: Project): Flicks {
  let end = 0;
  for (const c of Object.values(p.clips)) end = Math.max(end, clipEnd(c));
  return end;
}

/** Media kinds a track kind accepts. */
export function trackAccepts(kind: TrackKind, assetKind: string): boolean {
  switch (kind) {
    case 'video':
    case 'overlay':
      return assetKind === 'video' || assetKind === 'image';
    case 'audio':
      return assetKind === 'audio' || assetKind === 'video';
    case 'text':
      return assetKind === 'text' || assetKind === 'subtitle';
  }
}

// ── tracks ────────────────────────────────────────────────────────────────

export function addTrack(p: Project, kind: TrackKind, index?: number): Project {
  const count = p.tracks.filter((t) => t.kind === kind).length + 1;
  const prefix = kind === 'video' ? 'V' : kind === 'audio' ? 'A' : kind === 'text' ? 'T' : 'O';
  const track = createTrack(kind, `${prefix}${count}`);
  const tracks = [...p.tracks];
  tracks.splice(index ?? tracks.length, 0, track);
  return { ...p, tracks, updatedAt: Date.now() };
}

export function removeTrack(p: Project, trackId: string): Project {
  const t = getTrack(p, trackId);
  const clips = { ...p.clips };
  const transitions = { ...p.transitions };
  for (const id of t.clipIds) delete clips[id];
  for (const [tid, tr] of Object.entries(transitions)) if (!clips[tr.fromClipId] || !clips[tr.toClipId]) delete transitions[tid];
  return { ...p, tracks: p.tracks.filter((x) => x.id !== trackId), clips, transitions, updatedAt: Date.now() };
}

export function renameTrack(p: Project, trackId: string, name: string): Project {
  const trimmed = name.trim().slice(0, 100);
  if (!trimmed) throw new TimelineError('Track name cannot be empty.');
  return withTrack(p, { ...getTrack(p, trackId), name: trimmed });
}

export function setTrackFlags(p: Project, trackId: string, flags: Partial<Pick<Track, 'locked' | 'muted' | 'hidden'>>): Project {
  return withTrack(p, { ...getTrack(p, trackId), ...flags });
}

export function moveTrack(p: Project, trackId: string, toIndex: number): Project {
  const from = p.tracks.findIndex((t) => t.id === trackId);
  if (from < 0) throw new TimelineError(`Track ${trackId} not found.`);
  const tracks = [...p.tracks];
  const [t] = tracks.splice(from, 1);
  tracks.splice(Math.max(0, Math.min(tracks.length, toIndex)), 0, t!);
  return { ...p, tracks, updatedAt: Date.now() };
}

// ── clips ─────────────────────────────────────────────────────────────────

export interface InsertClipArgs {
  trackId: string;
  assetId: string | null;
  start: Flicks;
  duration?: Flicks;
  sourceIn?: Flicks;
  name?: string;
}

/** Insert a clip. Fails (does not ripple) if the target range is occupied. Returns [project, clipId]. */
export function insertClip(p: Project, args: InsertClipArgs): [Project, string] {
  const track = getTrack(p, args.trackId);
  assertUnlocked(track);
  const asset = args.assetId ? p.assets.find((a) => a.id === args.assetId) : undefined;
  if (args.assetId && !asset) throw new TimelineError('Asset not found.');
  if (asset && !trackAccepts(track.kind, asset.kind)) throw new TimelineError(`A ${asset.kind} file cannot go on a ${track.kind} track.`);
  const start = Math.max(0, snap(p, args.start));
  const sourceIn = Math.max(0, args.sourceIn ?? 0);
  const available = assetSourceDuration(asset) - sourceIn;
  let duration = args.duration ?? (Number.isFinite(available) ? available : DEFAULT_STILL_DURATION);
  if (Number.isFinite(available)) duration = Math.min(duration, available);
  duration = quantizeToFrame(duration, p.settings.frameRate, 'floor');
  if (duration <= 0) throw new TimelineError('The clip would be shorter than one frame.');
  if (overlaps(p, track.id, start, start + duration)) throw new TimelineError('There is already a clip at that position.');
  const clip = createClip({ trackId: track.id, assetId: args.assetId, start, duration, sourceIn, name: args.name ?? asset?.name ?? 'Clip' });
  const clips = { ...p.clips, [clip.id]: clip };
  const next = withTrack({ ...p, clips }, { ...track, clipIds: sortIds({ ...p, clips }, [...track.clipIds, clip.id]) });
  return [next, clip.id];
}

/** Move a clip to a new start (and optionally another track). Rejects overlaps. */
export function moveClip(p: Project, clipId: string, newStart: Flicks, newTrackId?: string): Project {
  const clip = getClip(p, clipId);
  const fromTrack = getTrack(p, clip.trackId);
  const toTrack = getTrack(p, newTrackId ?? clip.trackId);
  assertUnlocked(fromTrack);
  assertUnlocked(toTrack);
  if (clip.assetId) {
    const asset = p.assets.find((a) => a.id === clip.assetId);
    if (asset && !trackAccepts(toTrack.kind, asset.kind)) throw new TimelineError(`A ${asset.kind} clip cannot go on a ${toTrack.kind} track.`);
  } else if (clip.text && toTrack.kind !== 'text' && toTrack.kind !== 'overlay') {
    throw new TimelineError('Text clips go on text or overlay tracks.');
  }
  const start = Math.max(0, snap(p, newStart));
  if (overlaps(p, toTrack.id, start, start + clip.duration, new Set([clipId]))) throw new TimelineError('There is already a clip at that position.');
  const moved: Clip = { ...clip, start, trackId: toTrack.id };
  const clips = { ...p.clips, [clipId]: moved };
  let tracks = p.tracks;
  if (fromTrack.id === toTrack.id) {
    tracks = tracks.map((t) => (t.id === fromTrack.id ? { ...t, clipIds: sortIds({ ...p, clips }, t.clipIds) } : t));
  } else {
    tracks = tracks.map((t) => {
      if (t.id === fromTrack.id) return { ...t, clipIds: t.clipIds.filter((id) => id !== clipId) };
      if (t.id === toTrack.id) return { ...t, clipIds: sortIds({ ...p, clips }, [...t.clipIds, clipId]) };
      return t;
    });
  }
  // Transitions are only valid between adjacent clips on one track; drop any that moving broke.
  const transitions = { ...p.transitions };
  for (const [id, tr] of Object.entries(transitions)) if (tr.fromClipId === clipId || tr.toClipId === clipId) delete transitions[id];
  return { ...p, clips, tracks, transitions, updatedAt: Date.now() };
}

/** Move the clip's in-point to `newStart` (timeline time), keeping its end fixed. */
export function trimClipStart(p: Project, clipId: string, newStart: Flicks): Project {
  const clip = getClip(p, clipId);
  assertUnlocked(getTrack(p, clip.trackId));
  const asset = clip.assetId ? p.assets.find((a) => a.id === clip.assetId) : undefined;
  const end = clipEnd(clip);
  let start = snap(p, newStart);
  // Bounded by source head (cannot reveal media before t=0 of the source).
  const earliestBySource = Number.isFinite(assetSourceDuration(asset)) ? clip.start - Math.floor(clip.sourceIn / clip.speed) : -Infinity;
  // Bounded by the previous clip on the track.
  const track = getTrack(p, clip.trackId);
  const idx = track.clipIds.indexOf(clipId);
  const prev = idx > 0 ? p.clips[track.clipIds[idx - 1]!]! : null;
  const earliest = Math.max(0, earliestBySource, prev ? clipEnd(prev) : 0);
  start = Math.max(start, quantizeToFrame(earliest, p.settings.frameRate, 'ceil'));
  const minDur = quantizeToFrame(1, p.settings.frameRate, 'ceil');
  start = Math.min(start, end - minDur);
  const delta = start - clip.start;
  const updated: Clip = { ...clip, start, duration: end - start, sourceIn: Math.max(0, clip.sourceIn + Math.round(delta * clip.speed)) };
  return { ...p, clips: { ...p.clips, [clipId]: updated }, updatedAt: Date.now() };
}

/** Move the clip's out-point to `newEnd` (timeline time). */
export function trimClipEnd(p: Project, clipId: string, newEnd: Flicks): Project {
  const clip = getClip(p, clipId);
  assertUnlocked(getTrack(p, clip.trackId));
  const asset = clip.assetId ? p.assets.find((a) => a.id === clip.assetId) : undefined;
  let end = snap(p, newEnd);
  const sourceDur = assetSourceDuration(asset);
  const latestBySource = Number.isFinite(sourceDur) ? clip.start + Math.floor((sourceDur - clip.sourceIn) / clip.speed) : Infinity;
  const track = getTrack(p, clip.trackId);
  const idx = track.clipIds.indexOf(clipId);
  const next = idx < track.clipIds.length - 1 ? p.clips[track.clipIds[idx + 1]!]! : null;
  const latest = Math.min(latestBySource, next ? next.start : Infinity);
  if (Number.isFinite(latest)) end = Math.min(end, quantizeToFrame(latest, p.settings.frameRate, 'floor'));
  const minDur = quantizeToFrame(1, p.settings.frameRate, 'ceil');
  end = Math.max(end, clip.start + minDur);
  return { ...p, clips: { ...p.clips, [clipId]: { ...clip, duration: end - clip.start } }, updatedAt: Date.now() };
}

/** Split a clip at timeline time `at`. Returns [project, rightClipId]. */
export function splitClip(p: Project, clipId: string, at: Flicks): [Project, string] {
  const clip = getClip(p, clipId);
  const track = getTrack(p, clip.trackId);
  assertUnlocked(track);
  const t = snap(p, at);
  if (t <= clip.start || t >= clipEnd(clip)) throw new TimelineError('The split point must be inside the clip.');
  const leftDur = t - clip.start;
  const left: Clip = { ...clip, duration: leftDur, keyframes: sliceKeyframes(clip.keyframes, 0, leftDur, 0) };
  const right: Clip = {
    ...clip,
    id: createId('clp'),
    start: t,
    duration: clipEnd(clip) - t,
    sourceIn: clip.sourceIn + Math.round(leftDur * clip.speed),
    keyframes: sliceKeyframes(clip.keyframes, leftDur, clip.duration, leftDur),
    audio: { ...clip.audio, fadeIn: 0 },
    effects: clip.effects.map((e) => ({ ...e, id: createId('fx') })),
  };
  left.audio = { ...clip.audio, fadeOut: 0 };
  const clips = { ...p.clips, [left.id]: left, [right.id]: right };
  const ids = [...track.clipIds];
  ids.splice(ids.indexOf(clipId) + 1, 0, right.id);
  // A transition that started from the original clip now starts from the right half.
  const transitions = Object.fromEntries(
    Object.entries(p.transitions).map(([id, tr]) => [id, tr.fromClipId === clipId ? { ...tr, fromClipId: right.id } : tr]),
  );
  return [{ ...withTrack({ ...p, clips }, { ...track, clipIds: ids }), transitions }, right.id];
}

function sliceKeyframes(kf: Clip['keyframes'], from: Flicks, to: Flicks, shift: Flicks): Clip['keyframes'] {
  const out: Clip['keyframes'] = {};
  for (const [prop, list] of Object.entries(kf)) {
    const kept = list.filter((k) => k.t >= from && k.t <= to).map((k) => ({ ...k, t: k.t - shift }));
    if (kept.length) out[prop] = kept;
  }
  return out;
}

export function removeClips(p: Project, clipIds: readonly string[]): Project {
  const remove = new Set(clipIds);
  for (const id of remove) assertUnlocked(getTrack(p, getClip(p, id).trackId));
  const clips = { ...p.clips };
  for (const id of remove) delete clips[id];
  const transitions = Object.fromEntries(Object.entries(p.transitions).filter(([, t]) => !remove.has(t.fromClipId) && !remove.has(t.toClipId)));
  const tracks = p.tracks.map((t) => (t.clipIds.some((id) => remove.has(id)) ? { ...t, clipIds: t.clipIds.filter((id) => !remove.has(id)) } : t));
  return { ...p, clips, tracks, transitions, updatedAt: Date.now() };
}

/** Delete a clip and close the gap by shifting later clips on the same track left. */
export function rippleDelete(p: Project, clipId: string): Project {
  const clip = getClip(p, clipId);
  const track = getTrack(p, clip.trackId);
  assertUnlocked(track);
  const gap = clip.duration;
  let next = removeClips(p, [clipId]);
  const clips = { ...next.clips };
  for (const id of track.clipIds) {
    const c = clips[id];
    if (c && c.start >= clipEnd(clip)) clips[id] = { ...c, start: c.start - gap };
  }
  next = { ...next, clips };
  return next;
}

/** Slip: shift which part of the source is shown without moving the clip on the timeline. */
export function slipClip(p: Project, clipId: string, deltaSource: Flicks): Project {
  const clip = getClip(p, clipId);
  assertUnlocked(getTrack(p, clip.trackId));
  const asset = clip.assetId ? p.assets.find((a) => a.id === clip.assetId) : undefined;
  const sourceDur = assetSourceDuration(asset);
  if (!Number.isFinite(sourceDur)) throw new TimelineError('Only video and audio clips can be slipped.');
  const maxIn = sourceDur - sourceSpan(clip);
  const sourceIn = Math.max(0, Math.min(maxIn, clip.sourceIn + deltaSource));
  return { ...p, clips: { ...p.clips, [clipId]: { ...clip, sourceIn } }, updatedAt: Date.now() };
}

/** Clips intersecting time t, ordered bottom track → top track for compositing. */
export function clipsAt(p: Project, t: Flicks): Clip[] {
  const out: Clip[] = [];
  for (let i = p.tracks.length - 1; i >= 0; i--) {
    const track = p.tracks[i]!;
    if (track.hidden) continue;
    for (const id of track.clipIds) {
      const c = p.clips[id]!;
      if (c.start <= t && t < clipEnd(c)) out.push(c);
    }
  }
  return out;
}
