import { describe, expect, it } from 'vitest';
import { checkIntegrity } from '@/project/schema/validate';
import { makeProject, trackId } from '@/test/fixtures';
import { secondsToFlicks } from '@/utils/time';
import {
  addMarker,
  addTextClip,
  clampMoveDelta,
  copyClips,
  detachAudio,
  moveAsset,
  rearrangeClip,
  moveClips,
  pasteClips,
  removeKeyframe,
  rippleDeleteClips,
  rollEdit,
  setClipSpeed,
  setInOut,
  setKeyframe,
  setTransitionAfter,
  snapDelta,
  snapTargets,
  splitAt,
} from './edit';
import { clipEnd, insertClip, TimelineError } from './ops';

const S = secondsToFlicks;

/** V1: A [0,3) B [3,6); V2: image [1,3). */
function base() {
  const p0 = makeProject();
  const v1 = trackId(p0, 'V1');
  const [p1, a] = insertClip(p0, { trackId: v1, assetId: 'vid', start: 0, duration: S(3), sourceIn: S(1) });
  const [p2, b] = insertClip(p1, { trackId: v1, assetId: 'vid', start: S(3), duration: S(3), sourceIn: S(5) });
  const [p3, img] = insertClip(p2, { trackId: trackId(p2, 'V2'), assetId: 'img', start: S(1), duration: S(2) });
  return { p: p3, a, b, img, v1, v2: trackId(p3, 'V2') };
}

describe('moveClips', () => {
  it('moves several clips together across tracks', () => {
    const { p, img } = base();
    const q = moveClips(p, [img], S(5), 1); // V2 → V1 (next row down), to 6 s
    expect(q.clips[img]!.trackId).toBe(trackId(p, 'V1'));
    expect(q.clips[img]!.start).toBe(S(6));
    checkIntegrity(q);
  });
  it('rejects overlaps and clamps drags to the neighbour', () => {
    const { p, b } = base();
    expect(() => moveClips(p, [b], -S(1))).toThrow(TimelineError);
    expect(clampMoveDelta(p, [b], -S(1))).toBe(0);
    expect(clampMoveDelta(p, [b], S(2))).toBe(S(2));
  });
  it('never moves before zero', () => {
    const { p, img } = base();
    expect(moveClips(p, [img], -S(5)).clips[img]!.start).toBe(0);
  });
  it('rejects incompatible tracks', () => {
    const { p, img } = base();
    const a1Index = p.tracks.findIndex((t) => t.name === 'A1');
    const v2Index = p.tracks.findIndex((t) => t.name === 'V2');
    expect(() => moveClips(p, [img], 0, a1Index - v2Index)).toThrow(/cannot go/);
  });
});

describe('roll / ripple / split / speed', () => {
  it('roll edit moves the cut and keeps total length', () => {
    const { p, a, b } = base();
    const q = rollEdit(p, a, S(2));
    expect(clipEnd(q.clips[a]!)).toBe(S(2));
    expect(q.clips[b]!.start).toBe(S(2));
    expect(q.clips[b]!.sourceIn).toBe(S(4));
    expect(clipEnd(q.clips[b]!)).toBe(S(6));
    checkIntegrity(q);
  });
  it('ripple delete closes gaps on the affected track only', () => {
    const { p, a, b, img } = base();
    const q = rippleDeleteClips(p, [a]);
    expect(q.clips[a]).toBeUndefined();
    expect(q.clips[b]!.start).toBe(0);
    expect(q.clips[img]!.start).toBe(S(1));
    checkIntegrity(q);
  });
  it('splits every clip under the playhead', () => {
    const { p, a, img } = base();
    const [q, right] = splitAt(p, S(2));
    expect(right).toHaveLength(2);
    expect(clipEnd(q.clips[a]!)).toBe(S(2));
    expect(clipEnd(q.clips[img]!)).toBe(S(2));
    checkIntegrity(q);
  });
  it('speed change rescales duration and refuses to overlap', () => {
    const { p, a, b } = base();
    expect(() => setClipSpeed(p, a, 0.5)).toThrow(/room/);
    const q = setClipSpeed(p, b, 2);
    expect(q.clips[b]!.duration).toBe(S(1.5));
    expect(q.clips[b]!.speed).toBe(2);
  });
});

describe('clipboard, audio, text', () => {
  it('pastes with relative timing on free tracks', () => {
    const { p, a, img } = base();
    const data = copyClips(p, [a, img]);
    const [q, ids] = pasteClips(p, data, S(10));
    expect(ids).toHaveLength(2);
    expect(q.clips[ids[0]!]!.start).toBe(S(10));
    expect(q.clips[ids[1]!]!.start).toBe(S(11));
    checkIntegrity(q);
  });
  it('detaches audio into an audio clip and mutes the video clip', () => {
    const p0 = makeProject();
    const assets = p0.assets.map((x) => (x.id === 'vid' ? { ...x, info: { ...x.info!, audio: [{ id: 2, codec: 'aac', codecString: null, channels: 2, sampleRate: 48000, bitrate: null, decodable: true, languageCode: 'und', name: null, duration: 10 }] } } : x));
    const [p1, v] = insertClip({ ...p0, assets }, { trackId: trackId(p0, 'V1'), assetId: 'vid', start: 0, duration: S(4) });
    const [q, au] = detachAudio(p1, v);
    expect(q.tracks.find((t) => t.id === q.clips[au]!.trackId)!.kind).toBe('audio');
    expect(q.clips[v]!.effects.some((e) => e.type === 'mute-audio')).toBe(true);
    expect(() => detachAudio(q, v)).toThrow(/already/);
    checkIntegrity(q);
  });
  it('adds text clips on a text track', () => {
    const { p } = base();
    const [q, id] = addTextClip(p, S(1));
    expect(q.clips[id]!.text?.text).toBe('Title');
    checkIntegrity(q);
  });
});

describe('transitions, keyframes, markers, snapping', () => {
  it('adds a transition only between touching clips and caps its length', () => {
    const { p, a, img } = base();
    const q = setTransitionAfter(p, a, 'crossfade', S(10));
    const tr = Object.values(q.transitions)[0]!;
    expect(tr.duration).toBe(S(3));
    expect(() => setTransitionAfter(p, img, 'crossfade', S(1))).toThrow();
    // Moving a clip apart drops the transition.
    const moved = moveClips(q, [Object.values(q.clips).find((c) => c.start === S(3))!.id], S(1));
    expect(Object.keys(moved.transitions)).toHaveLength(0);
  });
  it('stores bezier easing with control x clamped to [0, 1]', () => {
    const { p, a } = base();
    const q = setKeyframe(p, a, 'x', 0, 0, 'bezier', [-0.5, 1.4, 1.2, -0.3]);
    expect(q.clips[a]!.keyframes.x![0]!.bezier).toEqual([0, 1.4, 1, -0.3]);
  });
  it('sets and removes keyframes', () => {
    const { p, a } = base();
    let q = setKeyframe(p, a, 'opacity', S(1), 0.5);
    q = setKeyframe(q, a, 'opacity', 0, 1);
    expect(q.clips[a]!.keyframes.opacity!.map((k) => k.t)).toEqual([0, S(1)]);
    q = removeKeyframe(q, a, 'opacity', 0);
    q = removeKeyframe(q, a, 'opacity', S(1));
    expect(q.clips[a]!.keyframes.opacity).toBeUndefined();
  });
  it('markers are frame-aligned and de-duplicated; in/out validated', () => {
    const { p } = base();
    const [q, id] = addMarker(p, S(2) + 3);
    const [q2, id2] = addMarker(q, S(2));
    expect(id2).toBe(id);
    expect(q2.markers[0]!.t).toBe(S(2));
    expect(() => setInOut(p, S(3), S(2))).toThrow();
  });
  it('snaps a moving range to the nearest edge within the threshold', () => {
    const { p, img } = base();
    const targets = snapTargets(p, new Set([img]), S(4.5));
    expect(snapDelta([S(2.95), S(4.95)], targets, S(0.1))).toEqual({ delta: S(0.05), target: S(3) });
    expect(snapDelta([S(7.5)], targets, S(0.1)).target).toBeNull();
  });
});

describe('moveAsset', () => {
  it('reorders media and is a no-op for the same position', () => {
    const { p } = base();
    const ids = p.assets.map((a) => a.id);
    const q = moveAsset(p, ids[2]!, 0);
    expect(q.assets.map((a) => a.id)).toEqual([ids[2], ids[0], ids[1]]);
    expect(moveAsset(p, ids[0]!, 0)).toBe(p);
  });
});

describe('rearrangeClip', () => {
  /** V1: A [0,3) B [3,6) C [8,10) (2 s gap before C). */
  function three() {
    const { p, a, b, v1 } = base();
    const [q, c] = insertClip(p, { trackId: v1, assetId: 'vid', start: S(8), duration: S(2) });
    return { p: q, a, b, c };
  }
  it('moves the last clip to the front, pushing the others right and keeping the gap', () => {
    const { p, a, b, c } = three();
    const q = rearrangeClip(p, c, a);
    expect([c, a, b].map((id) => q.clips[id]!.start / S(1))).toEqual([0, 2, 5]);
    checkIntegrity(q);
  });
  it('moves the first clip to the end', () => {
    const { p, a, b, c } = three();
    const q = rearrangeClip(p, a, null);
    expect([b, c, a].map((id) => q.clips[id]!.start / S(1))).toEqual([0, 5, 7]);
    checkIntegrity(q);
  });
  it('is a no-op when dropped where it already is', () => {
    const { p, a, b } = three();
    expect(rearrangeClip(p, a, b)).toBe(p);
  });
});
