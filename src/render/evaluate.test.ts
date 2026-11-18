import { describe, expect, it } from 'vitest';
import { makeProject, trackId } from '@/test/fixtures';
import { insertClip } from '@/timeline/model/ops';
import { framesToFlicks, secondsToFlicks } from '@/utils/time';
import { audibleClips, clipGainAt, cubicBezier, evalKeyframes, resolveFrame, sourceTimeAt, subtitleTextAt } from './evaluate';
import { cssFilter } from './effects';

const rate = { num: 30, den: 1 };
const f = (n: number) => framesToFlicks(n, rate);

describe('keyframes', () => {
  it('holds before the first and after the last keyframe', () => {
    const kf = [
      { t: f(10), value: 2, easing: 'linear' as const },
      { t: f(20), value: 4, easing: 'linear' as const },
    ];
    expect(evalKeyframes(kf, 0, 9)).toBe(2);
    expect(evalKeyframes(kf, f(30), 9)).toBe(4);
    expect(evalKeyframes(kf, f(15), 9)).toBeCloseTo(3);
  });
  it('uses the static value with no keyframes', () => {
    expect(evalKeyframes(undefined, 5, 7)).toBe(7);
  });
  it('hold easing steps at the next keyframe', () => {
    const kf = [
      { t: 0, value: 0, easing: 'hold' as const },
      { t: f(10), value: 1, easing: 'linear' as const },
    ];
    expect(evalKeyframes(kf, f(9), 0)).toBe(0);
    expect(evalKeyframes(kf, f(10), 0)).toBe(1);
  });
  it('ease-in-out is symmetric and monotonic', () => {
    const e = [0.42, 0, 0.58, 1] as [number, number, number, number];
    expect(cubicBezier(0.5, e)).toBeCloseTo(0.5, 3);
    expect(cubicBezier(0.25, e)).toBeLessThan(0.25);
    expect(cubicBezier(0.75, e)).toBeGreaterThan(0.75);
  });
});

describe('source time', () => {
  it('maps forward clips through speed and sourceIn', () => {
    const p = makeProject();
    const [q, id] = insertClip(p, { trackId: trackId(p, 'V1'), assetId: 'vid', start: secondsToFlicks(2), sourceIn: secondsToFlicks(1), duration: secondsToFlicks(3) });
    const clip = { ...q.clips[id]!, speed: 2 };
    expect(sourceTimeAt(clip, secondsToFlicks(2), f(1))).toBeCloseTo(1);
    expect(sourceTimeAt(clip, secondsToFlicks(3), f(1))).toBeCloseTo(3);
  });
  it('reversed clips show the source span backwards, last frame = first source frame', () => {
    const p = makeProject();
    const [q, id] = insertClip(p, { trackId: trackId(p, 'V1'), assetId: 'vid', start: 0, duration: secondsToFlicks(2) });
    const clip = { ...q.clips[id]!, reversed: true };
    expect(sourceTimeAt(clip, 0, f(1))).toBeCloseTo(2 - 1 / 30);
    expect(sourceTimeAt(clip, f(59), f(1))).toBeCloseTo(0);
  });
});

describe('resolveFrame', () => {
  it('orders layers bottom → top and skips hidden tracks', () => {
    const p0 = makeProject();
    const [p1] = insertClip(p0, { trackId: trackId(p0, 'V1'), assetId: 'vid', start: 0 });
    const [p2] = insertClip(p1, { trackId: trackId(p1, 'V2'), assetId: 'img', start: 0, duration: secondsToFlicks(2) });
    const layers = resolveFrame(p2, secondsToFlicks(1));
    expect(layers.map((l) => l.asset?.id)).toEqual(['vid', 'img']);
    const hidden = { ...p2, tracks: p2.tracks.map((t) => (t.name === 'V2' ? { ...t, hidden: true } : t)) };
    expect(resolveFrame(hidden, secondsToFlicks(1)).map((l) => l.asset?.id)).toEqual(['vid']);
  });

  it('shows both clips of a transition with progress centred on the cut', () => {
    const p0 = makeProject();
    const v1 = trackId(p0, 'V1');
    const [p1, a] = insertClip(p0, { trackId: v1, assetId: 'vid', start: 0, duration: secondsToFlicks(2), sourceIn: 0 });
    const [p2, b] = insertClip(p1, { trackId: v1, assetId: 'vid', start: secondsToFlicks(2), duration: secondsToFlicks(2), sourceIn: secondsToFlicks(5) });
    const p = { ...p2, transitions: { t1: { id: 't1', type: 'crossfade', fromClipId: a, toClipId: b, duration: secondsToFlicks(1), params: {} } } };
    // At the cut: halfway.
    const mid = resolveFrame(p, secondsToFlicks(2));
    expect(mid).toHaveLength(2);
    expect(mid[0]!.clip.id).toBe(a);
    expect(mid[1]!.transition).toMatchObject({ role: 'to', progress: 0.5 });
    // The outgoing clip continues past its end into its source handle.
    expect(mid[0]!.sourceTime).toBeCloseTo(2);
    // The incoming clip shows its pre-roll before its own start.
    const before = resolveFrame(p, secondsToFlicks(1.75));
    expect(before.find((l) => l.clip.id === b)!.sourceTime).toBeCloseTo(4.75);
    // Outside the window only one clip.
    expect(resolveFrame(p, secondsToFlicks(1.4))).toHaveLength(1);
  });

  it('applies keyframed opacity', () => {
    const p0 = makeProject();
    const [p1, id] = insertClip(p0, { trackId: trackId(p0, 'V1'), assetId: 'vid', start: 0, duration: secondsToFlicks(2) });
    const c = p1.clips[id]!;
    const p = {
      ...p1,
      clips: {
        [id]: {
          ...c,
          keyframes: {
            opacity: [
              { t: 0, value: 0, easing: 'linear' as const },
              { t: secondsToFlicks(1), value: 1, easing: 'linear' as const },
            ],
          },
        },
      },
    };
    expect(resolveFrame(p, secondsToFlicks(0.5))[0]!.opacity).toBeCloseTo(0.5);
  });
});

describe('audio', () => {
  it('video clips with audio on visual tracks are audible; muted tracks are not', () => {
    const p0 = makeProject();
    const assets = p0.assets.map((a) => (a.id === 'vid' ? { ...a, info: { ...a.info!, audio: [{ id: 2, codec: 'aac', codecString: 'mp4a.40.2', channels: 2, sampleRate: 48000, bitrate: null, decodable: true, languageCode: 'und', name: null, duration: 10 }] } } : a));
    const [p1] = insertClip({ ...p0, assets }, { trackId: trackId(p0, 'V1'), assetId: 'vid', start: 0 });
    expect(audibleClips(p1)).toHaveLength(1);
    const muted = { ...p1, tracks: p1.tracks.map((t) => (t.name === 'V1' ? { ...t, muted: true } : t)) };
    expect(audibleClips(muted)).toHaveLength(0);
  });
  it('gain envelope includes fades', () => {
    const p0 = makeProject();
    const [p1, id] = insertClip(p0, { trackId: trackId(p0, 'A1'), assetId: 'aud', start: 0, duration: secondsToFlicks(4) });
    const clip = { ...p1.clips[id]!, audio: { gain: 1, pan: 0, fadeIn: secondsToFlicks(1), fadeOut: secondsToFlicks(1) } };
    expect(clipGainAt(clip, secondsToFlicks(0.5))).toBeCloseTo(0.5);
    expect(clipGainAt(clip, secondsToFlicks(2))).toBeCloseTo(1);
    expect(clipGainAt(clip, secondsToFlicks(3.75))).toBeCloseTo(0.25);
  });
});

describe('subtitles and filters', () => {
  it('finds the active cue', () => {
    const asset = { subtitles: [{ start: 1, end: 2, text: 'Hello' }] } as never;
    expect(subtitleTextAt(asset, 1.5)).toBe('Hello');
    expect(subtitleTextAt(asset, 2)).toBeNull();
  });
  it('builds canvas filter strings and scales blur radius', () => {
    expect(cssFilter([], 1)).toBe('none');
    expect(
      cssFilter(
        [
          { id: '1', type: 'brightness', enabled: true, params: { amount: 0.2 } },
          { id: '2', type: 'blur', enabled: true, params: { radius: 10 } },
          { id: '3', type: 'sepia', enabled: false, params: { amount: 1 } },
        ],
        0.5,
      ),
    ).toBe('brightness(1.2) blur(5.00px)');
  });
});
