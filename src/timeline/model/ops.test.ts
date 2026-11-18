import { describe, expect, it } from 'vitest';
import type { Keyframe } from '@/project/schema/types';
import { checkIntegrity } from '@/project/schema/validate';
import { makeProject, trackId } from '@/test/fixtures';
import { frameDuration, secondsToFlicks } from '@/utils/time';
import {
  TimelineError,
  addTrack,
  clipEnd,
  clipsAt,
  insertClip,
  moveClip,
  moveTrack,
  projectDuration,
  removeClips,
  removeTrack,
  renameTrack,
  rippleDelete,
  setTrackFlags,
  slipClip,
  splitClip,
  trimClipEnd,
  trimClipStart,
} from './ops';

const S = secondsToFlicks;
const FD = frameDuration({ num: 30, den: 1 });

describe('insertClip', () => {
  it('inserts a full-length video clip snapped to the frame grid', () => {
    const p0 = makeProject();
    const [p, id] = insertClip(p0, { trackId: trackId(p0, 'V1'), assetId: 'vid', start: S(1) + 5 });
    const c = p.clips[id]!;
    expect(c.start).toBe(S(1));
    expect(c.duration).toBe(S(10));
    expect(p0.clips[id]).toBeUndefined(); // the input project is untouched
    checkIntegrity(p);
  });

  it('gives stills a default duration', () => {
    const p0 = makeProject();
    const [p, id] = insertClip(p0, { trackId: trackId(p0, 'V1'), assetId: 'img', start: 0 });
    expect(p.clips[id]!.duration).toBe(S(5));
  });

  it('rejects overlaps, wrong track kinds and locked tracks', () => {
    const p0 = makeProject();
    const v1 = trackId(p0, 'V1');
    const [p] = insertClip(p0, { trackId: v1, assetId: 'vid', start: 0 });
    expect(() => insertClip(p, { trackId: v1, assetId: 'img', start: S(5) })).toThrow(TimelineError);
    expect(() => insertClip(p, { trackId: trackId(p, 'A1'), assetId: 'img', start: 0 })).toThrow(/cannot go/);
    const locked = setTrackFlags(p, trackId(p, 'V2'), { locked: true });
    expect(() => insertClip(locked, { trackId: trackId(p, 'V2'), assetId: 'img', start: 0 })).toThrow(/locked/);
  });

  it('clamps duration to the remaining source', () => {
    const p0 = makeProject();
    const [p, id] = insertClip(p0, { trackId: trackId(p0, 'A1'), assetId: 'aud', start: 0, sourceIn: S(1), duration: S(100) });
    expect(p.clips[id]!.duration).toBe(S(3));
  });

  it('keeps clip ids sorted by start', () => {
    const p0 = makeProject();
    const v1 = trackId(p0, 'V1');
    let [p] = insertClip(p0, { trackId: v1, assetId: 'img', start: S(20) });
    [p] = insertClip(p, { trackId: v1, assetId: 'img', start: 0 });
    const starts = p.tracks.find((t) => t.id === v1)!.clipIds.map((id) => p.clips[id]!.start);
    expect(starts).toEqual([0, S(20)]);
  });
});

describe('moveClip', () => {
  it('moves within and across tracks', () => {
    const p0 = makeProject();
    const [p1, id] = insertClip(p0, { trackId: trackId(p0, 'V1'), assetId: 'img', start: 0 });
    const p2 = moveClip(p1, id, S(3));
    expect(p2.clips[id]!.start).toBe(S(3));
    const p3 = moveClip(p2, id, S(3), trackId(p2, 'V2'));
    expect(p3.clips[id]!.trackId).toBe(trackId(p3, 'V2'));
    expect(p3.tracks.find((t) => t.name === 'V1')!.clipIds).not.toContain(id);
    checkIntegrity(p3);
  });

  it('rejects moves onto occupied ranges', () => {
    const p0 = makeProject();
    const v1 = trackId(p0, 'V1');
    const [p1, a] = insertClip(p0, { trackId: v1, assetId: 'img', start: 0 });
    const [p] = insertClip(p1, { trackId: v1, assetId: 'img', start: S(10) });
    expect(() => moveClip(p, a, S(8))).toThrow(TimelineError);
    expect(() => moveClip(p, a, S(5))).not.toThrow(); // [5,10) touches but does not overlap
  });

  it('never moves before zero', () => {
    const p0 = makeProject();
    const [p, id] = insertClip(p0, { trackId: trackId(p0, 'V1'), assetId: 'img', start: S(2) });
    expect(moveClip(p, id, -S(5)).clips[id]!.start).toBe(0);
  });
});

describe('trimming', () => {
  it('trims the end within neighbours and never below one frame', () => {
    const p0 = makeProject();
    const v1 = trackId(p0, 'V1');
    const [p1, a] = insertClip(p0, { trackId: v1, assetId: 'vid', start: 0, duration: S(4) });
    const [p] = insertClip(p1, { trackId: v1, assetId: 'img', start: S(6) });
    expect(trimClipEnd(p, a, S(5)).clips[a]!.duration).toBe(S(5));
    expect(trimClipEnd(p, a, S(9)).clips[a]!.duration).toBe(S(6));
    expect(trimClipEnd(p, a, -S(1)).clips[a]!.duration).toBe(FD);
  });

  it('trims the end no further than the source allows', () => {
    const p0 = makeProject();
    const [p, a] = insertClip(p0, { trackId: trackId(p0, 'V1'), assetId: 'vid', start: 0, duration: S(4) });
    expect(trimClipEnd(p, a, S(60)).clips[a]!.duration).toBe(S(10));
  });

  it('trims the start and advances sourceIn', () => {
    const p0 = makeProject();
    const [p, a] = insertClip(p0, { trackId: trackId(p0, 'V1'), assetId: 'vid', start: S(2), duration: S(4), sourceIn: S(1) });
    const t = trimClipStart(p, a, S(3)).clips[a]!;
    expect([t.start, t.duration, t.sourceIn]).toEqual([S(3), S(3), S(2)]);
    // Extending the head is limited by the source available before sourceIn (1 s).
    const e = trimClipStart(p, a, 0).clips[a]!;
    expect([e.start, e.sourceIn, clipEnd(e)]).toEqual([S(1), 0, S(6)]);
  });
});

describe('splitClip', () => {
  it('splits into two contiguous clips with consistent source offsets and keyframes', () => {
    const p0 = makeProject();
    const [p1, a] = insertClip(p0, { trackId: trackId(p0, 'V1'), assetId: 'vid', start: S(1), duration: S(6), sourceIn: S(2) });
    const kf: Keyframe[] = [
      { t: 0, value: 0, easing: 'linear' },
      { t: S(5), value: 1, easing: 'linear' },
    ];
    const withKf = { ...p1, clips: { ...p1.clips, [a]: { ...p1.clips[a]!, keyframes: { opacity: kf } } } };
    const [p, b] = splitClip(withKf, a, S(4));
    const L = p.clips[a]!;
    const R = p.clips[b]!;
    expect([L.start, L.duration]).toEqual([S(1), S(3)]);
    expect([R.start, R.duration, R.sourceIn]).toEqual([S(4), S(3), S(5)]);
    expect(L.keyframes.opacity).toHaveLength(1);
    expect(R.keyframes.opacity![0]!.t).toBe(S(2));
    checkIntegrity(p);
  });

  it('rejects split points at or outside the edges', () => {
    const p0 = makeProject();
    const [p, a] = insertClip(p0, { trackId: trackId(p0, 'V1'), assetId: 'img', start: S(1) });
    expect(() => splitClip(p, a, S(1))).toThrow();
    expect(() => splitClip(p, a, S(6))).toThrow();
  });

  it('accounts for speed when computing the right half sourceIn', () => {
    const p0 = makeProject();
    const [p1, a] = insertClip(p0, { trackId: trackId(p0, 'V1'), assetId: 'vid', start: 0, duration: S(4) });
    const fast = { ...p1, clips: { ...p1.clips, [a]: { ...p1.clips[a]!, speed: 2 } } };
    const [p, b] = splitClip(fast, a, S(1));
    expect(p.clips[b]!.sourceIn).toBe(S(2));
  });
});

describe('delete, ripple, slip', () => {
  it('ripple delete closes the gap', () => {
    const p0 = makeProject();
    const v1 = trackId(p0, 'V1');
    const [p1, a] = insertClip(p0, { trackId: v1, assetId: 'img', start: 0 });
    const [p2, b] = insertClip(p1, { trackId: v1, assetId: 'img', start: S(5) });
    const p = rippleDelete(p2, a);
    expect(p.clips[a]).toBeUndefined();
    expect(p.clips[b]!.start).toBe(0);
    checkIntegrity(p);
  });

  it('removes clips and their transitions', () => {
    const p0 = makeProject();
    const v1 = trackId(p0, 'V1');
    const [p1, a] = insertClip(p0, { trackId: v1, assetId: 'img', start: 0 });
    const [p2, b] = insertClip(p1, { trackId: v1, assetId: 'img', start: S(5) });
    const withTr = { ...p2, transitions: { tr1: { id: 'tr1', type: 'dissolve', fromClipId: a, toClipId: b, duration: S(1), params: {} } } };
    const p = removeClips(withTr, [a]);
    expect(p.transitions).toEqual({});
    checkIntegrity(p);
  });

  it('slips within source bounds', () => {
    const p0 = makeProject();
    const [p, a] = insertClip(p0, { trackId: trackId(p0, 'V1'), assetId: 'vid', start: 0, duration: S(4) });
    expect(slipClip(p, a, S(3)).clips[a]!.sourceIn).toBe(S(3));
    expect(slipClip(p, a, S(30)).clips[a]!.sourceIn).toBe(S(6));
    expect(slipClip(p, a, -S(30)).clips[a]!.sourceIn).toBe(0);
  });
});

describe('tracks and queries', () => {
  it('adds, renames, reorders and removes tracks', () => {
    let p = makeProject();
    p = addTrack(p, 'video', 0);
    expect(p.tracks[0]!.name).toBe('V3');
    p = renameTrack(p, p.tracks[0]!.id, '  B-roll ');
    expect(p.tracks[0]!.name).toBe('B-roll');
    p = moveTrack(p, p.tracks[0]!.id, 99);
    expect(p.tracks[p.tracks.length - 1]!.name).toBe('B-roll');
    const [p2] = insertClip(p, { trackId: trackId(p, 'V1'), assetId: 'img', start: 0 });
    const p3 = removeTrack(p2, trackId(p2, 'V1'));
    expect(Object.keys(p3.clips)).toHaveLength(0);
    checkIntegrity(p3);
  });

  it('reports duration and the composited clip stack at a time', () => {
    const p0 = makeProject();
    const [p1] = insertClip(p0, { trackId: trackId(p0, 'V1'), assetId: 'vid', start: 0 });
    const [p, top] = insertClip(p1, { trackId: trackId(p1, 'V2'), assetId: 'img', start: S(2) });
    expect(projectDuration(p)).toBe(S(10));
    const stack = clipsAt(p, S(3));
    expect(stack.map((c) => c.id).at(-1)).toBe(top); // top track is composited last
    expect(clipsAt(setTrackFlags(p, trackId(p, 'V2'), { hidden: true }), S(3))).toHaveLength(1);
  });
});
