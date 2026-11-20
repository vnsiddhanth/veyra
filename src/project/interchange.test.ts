import { describe, expect, it } from 'vitest';
import { makeProject, trackId } from '@/test/fixtures';
import { addMarker, addTextClip, setTransitionAfter } from '@/timeline/model/edit';
import { insertClip } from '@/timeline/model/ops';
import { secondsToFlicks } from '@/utils/time';
import type { Project } from './schema/types';
import { mediaUrl, toEdl, toFcpxml } from './interchange';

const S = secondsToFlicks;

/** Minimal XML well-formedness check: every open tag is closed in order. */
function wellFormed(xml: string): void {
  const body = xml.replace(/<\?xml[^>]*\?>/, '').replace(/<!DOCTYPE[^>]*>/, '');
  const stack: string[] = [];
  for (const m of body.matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g)) {
    const [, close, name, , self] = m;
    if (self) continue;
    if (close) expect(stack.pop(), `closing ${name}`).toBe(name);
    else stack.push(name!);
  }
  expect(stack).toEqual([]);
  // No raw ampersands or angle brackets left in text.
  expect(body.replace(/&(amp|lt|gt|quot|apos);/g, '')).not.toMatch(/&/);
}

/** V1: A [0,3) gap B [4,7) with a 1 s dissolve? (no: gap) — then C directly after B with a dissolve. */
function timeline(): Project {
  let p = makeProject();
  p = { ...p, name: 'My Film & <Cut>' };
  p.assets = p.assets.map((a) =>
    a.id === 'vid'
      ? { ...a, fileName: 'Scene 1.mp4', info: { ...a.info!, audio: [{ id: 2, codec: 'aac', codecString: 'mp4a.40.2', channels: 2, sampleRate: 48000, bitrate: 128000, decodable: true, languageCode: 'und', name: null, duration: 10 }] } }
      : a.id === 'aud'
        ? { ...a, fileName: 'music.wav', info: { ...a.info!, kind: 'audio', video: [], audio: [{ id: 1, codec: 'pcm-s16', codecString: null, channels: 2, sampleRate: 48000, bitrate: null, decodable: true, languageCode: 'und', name: null, duration: 4 }] } }
        : a,
  );
  const v1 = trackId(p, 'V1');
  let a: string, b: string, c: string;
  [p, a] = insertClip(p, { trackId: v1, assetId: 'vid', start: 0, duration: S(3), sourceIn: S(1) });
  [p, b] = insertClip(p, { trackId: v1, assetId: 'vid', start: S(4), duration: S(2), sourceIn: S(5) });
  [p, c] = insertClip(p, { trackId: v1, assetId: 'vid', start: S(6), duration: S(2), sourceIn: S(2) });
  p = setTransitionAfter(p, b, 'crossfade', S(1));
  [p] = insertClip(p, { trackId: trackId(p, 'V2'), assetId: 'img', start: S(1), duration: S(2) });
  [p] = insertClip(p, { trackId: trackId(p, 'A1'), assetId: 'aud', start: S(0.5), duration: S(3) });
  [p] = addTextClip(p, S(4.5), S(1), 'Title & "quotes"');
  [p] = addMarker(p, S(5), 'Fix <this>');
  p = { ...p, clips: { ...p.clips, [a]: { ...p.clips[a]!, effects: [{ id: 'f', type: 'blur', enabled: true, params: {} }] }, [c]: { ...p.clips[c]!, speed: 2 } } };
  return p;
}

describe('FCPXML hand-off', () => {
  it('produces well-formed FCPXML 1.9 with every element on the frame grid', () => {
    const { text } = toFcpxml(timeline());
    wellFormed(text);
    expect(text).toContain('<fcpxml version="1.9">');
    expect(text).toContain('frameDuration="1/30s" width="1920" height="1080"');
    // Every time value is whole frames at 30 fps: n/30s, or whole seconds.
    for (const [, v] of text.matchAll(/(?:offset|duration|start)="([^"]+)"/g)) expect(v!).toMatch(/^(\d+s|\d+\/(30|15|10|6|5|3|2)s|0s)$/);
  });

  it('lays out the primary storyline with gaps and a centred cross dissolve', () => {
    const { text } = toFcpxml(timeline());
    const spine = text.slice(text.indexOf('<spine>'), text.indexOf('</spine>'));
    // A at 0 (source 1 s), gap 3–4 s, B at 4 s (source 5 s), dissolve centred on the 6 s cut, C at 6 s.
    expect(spine).toMatch(/<asset-clip ref="r\d+" offset="0s" duration="3s" start="1s" name="vid"/);
    expect(spine).toMatch(/<gap name="Gap" offset="3s" duration="1s"/);
    expect(spine).toMatch(/<asset-clip ref="r\d+" offset="4s" duration="2s" start="5s"/);
    expect(spine).toMatch(/<transition name="Cross Dissolve" offset="11\/2s" duration="1s">/);
    expect(spine).toMatch(/<asset-clip ref="r\d+" offset="6s" duration="2s" start="2s"/);
  });

  it('connects other tracks on lanes at the right local time', () => {
    const { text } = toFcpxml(timeline());
    // The image (V2) starts at 1 s, inside clip A whose local time starts at source 1 s → local 2 s.
    expect(text).toMatch(/<video ref="r\d+" lane="1" offset="2s" duration="2s"/);
    // Music on A1 at 0.5 s → lane −1, local 1.5 s inside A.
    expect(text).toMatch(/<asset-clip ref="r\d+" lane="-1" offset="3\/2s" duration="3s" start="0s" name="aud"/);
    // Title at 4.5 s sits in B (local start 5 s) → 5.5 s, with escaped text.
    expect(text).toMatch(/<title ref="r\d+" lane="\d" offset="11\/2s" duration="1s"/);
    expect(text).toContain('Title &amp; &quot;quotes&quot;');
    // Marker at 5 s → inside B, local 6 s.
    expect(text).toContain('<marker start="6s" duration="1/30s" value="Fix &lt;this&gt;"/>');
  });

  it('references media by file name, inside the chosen folder', () => {
    expect(toFcpxml(timeline(), { mediaFolder: 'D:\\Footage\\Day 1' }).text).toContain('src="file:///D:/Footage/Day%201/Scene%201.mp4"');
    expect(toFcpxml(timeline(), { mediaFolder: '/Users/me/Film/' }).text).toContain('src="file:///Users/me/Film/music.wav"');
    expect(mediaUrl('a b.mov')).toBe('file:///a%20b.mov');
  });

  it('lists what does not transfer', () => {
    const { notes } = toFcpxml(timeline());
    expect(notes.join('\n')).toMatch(/effects or colour grades/);
    expect(notes.join('\n')).toMatch(/speed changes/);
  });
});

describe('EDL hand-off', () => {
  it('writes CMX 3600 events with a dissolve and exact timecodes', () => {
    const { text } = toEdl(timeline());
    const lines = text.split('\r\n');
    expect(lines[0]).toBe('TITLE: My Film & <Cut>');
    expect(lines[1]).toBe('FCM: NON-DROP FRAME');
    // A: source 1–4 s → record 01:00:00:00–01:00:03:00, video with sound.
    expect(text).toContain('001  AX       B     C        00:00:01:00 00:00:04:00 01:00:00:00 01:00:03:00');
    // B ends half a second early for the dissolve.
    expect(text).toContain('002  AX       B     C        00:00:05:00 00:00:06:15 01:00:04:00 01:00:05:15');
    // Dissolve into C: 30 frames, starting at 05:15.
    expect(text).toContain('003  AX       B     C        00:00:06:15 00:00:06:15 01:00:05:15 01:00:05:15');
    expect(text).toContain('003  AX       B     D    030 00:00:01:15 00:00:04:00 01:00:05:15 01:00:08:00');
    expect(text).toContain('* FROM CLIP NAME: Scene 1.mp4');
    // Music on A1.
    expect(text).toContain('004  AX       A     C        00:00:00:00 00:00:03:00 01:00:00:15 01:00:03:15');
  });
});
