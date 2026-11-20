/**
 * Timeline hand-off to other editors.
 *
 * - FCPXML 1.9 (DaVinci Resolve, Final Cut Pro): the lowest video track is the primary storyline
 *   (clips, gaps, cross dissolves); every other track becomes connected clips on its own lane
 *   (video/text above, audio below). Titles, markers, clip volume and audio/video enables carry over.
 * - CMX 3600 EDL (Resolve, Premiere, Avid, …): the primary video track with its sound, dissolves,
 *   and the first audio track.
 *
 * Browsers do not expose file paths, so media is referenced by file name inside an optional folder
 * the user types; the other editor relinks by name otherwise. Anything that cannot be represented
 * (effects, grades, keyframes, speed changes, transforms) is listed in `notes`.
 */
import type { Asset, Clip, Project, Track, Transition } from '@/project/schema/types';
import { clipEnd, projectDuration } from '@/timeline/model/ops';
import { fpsToRational, type Flicks, type Rational } from '@/utils/time';

const FPS = 705_600_000;

export interface HandoffOptions {
  /** Folder that holds the original media on the user's computer, e.g. "D:\Footage" or "/Users/me/Film". */
  mediaFolder?: string;
}

export interface HandoffResult {
  text: string;
  notes: string[];
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** Frames (rounded) at `rate` for a flicks value. */
const frames = (t: Flicks, rate: Rational) => Math.round((t * rate.num) / (FPS * rate.den));

/** FCPXML rational time string on the frame grid of `rate`. */
function rt(t: Flicks, rate: Rational): string {
  const num = frames(t, rate) * rate.den;
  const den = rate.num;
  if (num === 0) return '0s';
  const g = gcd(Math.abs(num), den);
  return den / g === 1 ? `${num / g}s` : `${num / g}/${den / g}s`;
}
function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}

/** file:// URL for a media file name, inside `folder` when given. */
export function mediaUrl(fileName: string, folder?: string): string {
  const enc = (seg: string) => encodeURIComponent(seg).replace(/%3A/gi, ':');
  const f = (folder ?? '').trim().replace(/\\/g, '/').replace(/\/+$/, '');
  if (!f) return `file:///${enc(fileName)}`;
  const parts = f.split('/').filter(Boolean).map(enc);
  return `file:///${parts.join('/')}/${enc(fileName)}`;
}

function hexToFcpColor(hex: string): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex);
  if (!m) return '1 1 1 1';
  return `${(parseInt(m[1]!, 16) / 255).toFixed(4)} ${(parseInt(m[2]!, 16) / 255).toFixed(4)} ${(parseInt(m[3]!, 16) / 255).toFixed(4)} 1`;
}

const isMutedClip = (c: Clip) => c.effects.some((e) => e.enabled && e.type === 'mute-audio');

/** Summarise what does not transfer, per category, with counts. */
function lossNotes(p: Project, exported: Clip[]): string[] {
  const notes: string[] = [];
  const count = (pred: (c: Clip) => boolean) => exported.filter(pred).length;
  const n = (k: number, what: string) => k && notes.push(`${k} clip${k === 1 ? '' : 's'}: ${what}`);
  n(count((c) => c.effects.some((e) => e.enabled && !['mute-audio', 'text-animation', 'credits-roll', 'preserve-pitch'].includes(e.type))), 'effects or colour grades are not carried over — reapply them in the other editor');
  n(count((c) => Object.keys(c.keyframes).length > 0), 'keyframed animation is not carried over');
  n(count((c) => c.speed !== 1 || c.reversed), 'speed changes, reverse or freeze frames are exported at normal speed — redo the retime');
  n(
    count((c) => {
      const t = c.transform;
      return t.x !== 0 || t.y !== 0 || t.scaleX !== 1 || t.scaleY !== 1 || t.rotation !== 0 || t.flipH || t.flipV || t.crop.left + t.crop.top + t.crop.right + t.crop.bottom > 0;
    }),
    'position, scale, rotation or crop are not carried over',
  );
  n(count((c) => c.opacity < 1 || c.blendMode !== 'normal'), 'opacity or blend modes are not carried over');
  n(count((c) => c.audio.fadeIn > 0 || c.audio.fadeOut > 0 || c.audio.pan !== 0), 'audio fades and pan are not carried over');
  n(count((c) => !!c.text && c.effects.some((e) => e.enabled && (e.type === 'text-animation' || e.type === 'credits-roll'))), 'title animations (including credits rolls) become static titles');
  const subs = exported.filter((c) => p.assets.find((a) => a.id === c.assetId)?.kind === 'subtitle').length;
  if (subs) notes.push(`${subs} subtitle clip${subs === 1 ? '' : 's'} not included — export them as SRT with the subtitle tools`);
  return notes;
}

// ── FCPXML ────────────────────────────────────────────────────────────────

export function toFcpxml(p: Project, opts: HandoffOptions = {}): HandoffResult {
  const rate = p.settings.frameRate;
  const t = (x: Flicks) => rt(x, rate);
  const notes: string[] = [];
  const total = projectDuration(p);
  if (total <= 0) throw new Error('The timeline is empty.');

  const videoish = (tr: Track) => tr.kind === 'video' || tr.kind === 'overlay' || tr.kind === 'text';
  // Tracks are ordered top to bottom; the lowest video track is the primary storyline.
  const primary = [...p.tracks].reverse().find((tr) => tr.kind === 'video') ?? null;
  const above = p.tracks.filter((tr) => videoish(tr) && tr !== primary).reverse(); // nearest first
  const audioTracks = p.tracks.filter((tr) => tr.kind === 'audio');
  const laneOf = new Map<string, number>();
  above.forEach((tr, i) => laneOf.set(tr.id, i + 1));
  audioTracks.forEach((tr, i) => laneOf.set(tr.id, -(i + 1)));

  // Resources.
  const res: string[] = [];
  let rid = 1;
  const seqFormat = `r${rid++}`;
  res.push(`<format id="${seqFormat}" frameDuration="${rate.den}/${rate.num}s" width="${p.settings.width}" height="${p.settings.height}"/>`);
  const assetRef = new Map<string, string>();
  const used = new Set(Object.values(p.clips).map((c) => c.assetId).filter((x): x is string => !!x));
  for (const a of p.assets) {
    if (!used.has(a.id) || !a.info || a.kind === 'subtitle') continue;
    const id = `r${rid++}`;
    let fmt = '';
    if (a.kind === 'video' || a.kind === 'image') {
      const fid = `r${rid++}`;
      const v = a.info.video[0];
      const fr = a.kind === 'video' && v?.frameRate?.bestGuess ? fpsToRational(v.frameRate.bestGuess) : null;
      res.push(`<format id="${fid}"${fr ? ` frameDuration="${fr.den}/${fr.num}s"` : ''} width="${a.info.width}" height="${a.info.height}"/>`);
      fmt = ` format="${fid}"`;
    }
    const au = a.info.audio[0];
    const dur = a.kind === 'image' ? '0s' : t(Math.round(a.info.duration * FPS));
    res.push(
      `<asset id="${id}" name="${esc(a.name)}" start="0s" duration="${dur}"${a.info.video.length || a.kind === 'image' ? ' hasVideo="1"' : ''}${fmt}${
        au ? ` hasAudio="1" audioSources="1" audioChannels="${au.channels}" audioRate="${au.sampleRate}"` : ''
      }>\n        <media-rep kind="original-media" src="${esc(mediaUrl(a.fileName, opts.mediaFolder))}"/>\n      </asset>`,
    );
    assetRef.set(a.id, id);
  }
  const dissolve = `r${rid++}`;
  res.push(`<effect id="${dissolve}" name="Cross Dissolve" uid="FxPlug:4731E73A-8DAC-4113-9A30-AE85B1761265"/>`);
  const titleFx = `r${rid++}`;
  res.push(`<effect id="${titleFx}" name="Basic Title" uid=".../Titles.localized/Bumper:Opener.localized/Basic Title.localized/Basic Title.moti"/>`);

  const asset = (c: Clip): Asset | undefined => (c.assetId ? p.assets.find((a) => a.id === c.assetId) : undefined);
  let tsId = 0;
  const exported: Clip[] = [];

  /** One clip element. `lane` is set for connected clips; `offset` is in the parent's local time. */
  const clipXml = (c: Clip, track: Track, offset: string, lane: number | null, children = ''): string | null => {
    const a = asset(c);
    const laneAttr = lane != null ? ` lane="${lane}"` : '';
    const enabled = track.hidden || track.muted ? ' enabled="0"' : '';
    exported.push(c);
    if (c.text && !a) {
      const ts = `ts${++tsId}`;
      const tx = c.text;
      return `<title ref="${titleFx}"${laneAttr} offset="${offset}" duration="${t(c.duration)}" start="0s" name="${esc(c.name)}"${enabled}>
          <text><text-style ref="${ts}">${esc(tx.text)}</text-style></text>
          <text-style-def id="${ts}"><text-style font="${esc(tx.fontFamily.split(',')[0]!.replace(/['"]/g, '').trim() || 'Helvetica')}" fontSize="${Math.round(tx.fontSize)}" fontColor="${hexToFcpColor(tx.color)}" bold="${tx.fontWeight >= 600 ? 1 : 0}" alignment="${tx.align}"/></text-style-def>${children}
        </title>`;
    }
    if (!a) return null;
    const ref = assetRef.get(a.id);
    if (!ref) return null;
    if (a.kind === 'image') return `<video ref="${ref}"${laneAttr} offset="${offset}" duration="${t(c.duration)}" start="0s" name="${esc(c.name)}"${enabled}>${children}</video>`;
    const hasAudio = (a.info?.audio.length ?? 0) > 0;
    const hasVideo = (a.info?.video.length ?? 0) > 0;
    const srcEnable = track.kind === 'audio' && hasVideo ? ' srcEnable="audio"' : hasVideo && hasAudio && isMutedClip(c) ? ' srcEnable="video"' : '';
    const gain = c.audio.gain * (track.volume ?? 1);
    const vol = hasAudio && Math.abs(gain - 1) > 1e-3 ? `\n          <adjust-volume amount="${gain > 0 ? (20 * Math.log10(gain)).toFixed(1) : '-96'}dB"/>` : '';
    return `<asset-clip ref="${ref}"${laneAttr} offset="${offset}" duration="${t(c.duration)}" start="${t(c.sourceIn)}" name="${esc(c.name)}"${srcEnable}${enabled} tcFormat="NDF">${vol}${children}
        </asset-clip>`;
  };

  // Primary storyline: clips, gaps and dissolves on the frame grid.
  interface Item {
    start: Flicks;
    end: Flicks;
    localStart: Flicks;
    clip: Clip | null;
    children: string[];
  }
  const items: Item[] = [];
  let pos: Flicks = 0;
  const primaryClips = primary ? primary.clipIds.map((id) => p.clips[id]!).filter((c) => asset(c)?.kind !== 'subtitle') : [];
  for (const c of primaryClips) {
    if (c.start > pos) items.push({ start: pos, end: c.start, localStart: 0, clip: null, children: [] });
    items.push({ start: c.start, end: clipEnd(c), localStart: c.sourceIn, clip: c, children: [] });
    pos = clipEnd(c);
  }
  if (pos < total) items.push({ start: pos, end: total, localStart: 0, clip: null, children: [] });

  const anchorFor = (at: Flicks): Item => items.find((it) => at >= it.start && at < it.end) ?? items[items.length - 1]!;
  const local = (it: Item, at: Flicks) => t(it.localStart + (at - it.start));

  // Connected clips on other tracks.
  for (const tr of p.tracks) {
    if (tr === primary) continue;
    const lane = laneOf.get(tr.id);
    if (lane == null) continue;
    for (const id of tr.clipIds) {
      const c = p.clips[id]!;
      if (asset(c)?.kind === 'subtitle') {
        exported.push(c);
        continue;
      }
      const it = anchorFor(c.start);
      const xml = clipXml(c, tr, local(it, c.start), lane);
      if (xml) it.children.push(xml);
    }
    const trans = Object.values(p.transitions).filter((x) => p.clips[x.fromClipId]?.trackId === tr.id);
    if (trans.length) notes.push(`${trans.length} transition${trans.length === 1 ? '' : 's'} on ${tr.name} not carried over (only the main video track's transitions are).`);
  }
  // Markers.
  for (const m of p.markers) {
    const it = anchorFor(m.t);
    it.children.push(`<marker start="${local(it, m.t)}" duration="${rt(Math.round((FPS * rate.den) / rate.num), rate)}" value="${esc(m.label || 'Marker')}"/>`);
  }

  // Spine with dissolves between adjacent primary clips.
  const transitionsAfter = new Map<string, Transition>();
  for (const tr of Object.values(p.transitions)) if (primary && p.clips[tr.fromClipId]?.trackId === primary.id) transitionsAfter.set(tr.fromClipId, tr);
  const spine: string[] = [];
  for (const it of items) {
    const kids = it.children.length ? `\n          ${it.children.join('\n          ')}` : '';
    if (!it.clip) {
      spine.push(`<gap name="Gap" offset="${t(it.start)}" duration="${t(it.end - it.start)}" start="0s">${kids}\n        </gap>`);
      continue;
    }
    const xml = clipXml(it.clip, primary!, t(it.start), null, kids);
    if (xml) spine.push(xml);
    else spine.push(`<gap name="Gap" offset="${t(it.start)}" duration="${t(it.end - it.start)}" start="0s">${kids}\n        </gap>`);
    const tr = transitionsAfter.get(it.clip.id);
    if (tr) {
      if (tr.type !== 'crossfade' && tr.type !== 'fade') notes.push(`“${tr.type}” transition exported as a cross dissolve.`);
      spine.push(`<transition name="Cross Dissolve" offset="${t(it.end - tr.duration / 2)}" duration="${t(tr.duration)}"><filter-video ref="${dissolve}" name="Cross Dissolve"/></transition>`);
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.9">
  <resources>
    ${res.join('\n    ')}
  </resources>
  <library>
    <event name="${esc(p.name)}">
      <project name="${esc(p.name)}">
        <sequence format="${seqFormat}" duration="${t(total)}" tcStart="0s" tcFormat="NDF" audioLayout="stereo" audioRate="${p.settings.sampleRate >= 48000 ? '48k' : '44.1k'}">
          <spine>
        ${spine.join('\n        ')}
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>
`;
  return { text: xml, notes: [...lossNotes(p, exported), ...notes] };
}

// ── EDL (CMX 3600) ───────────────────────────────────────────────────────

function tc(f: number, fps: number): string {
  const n = Math.max(0, f);
  const ff = n % fps;
  const s = Math.floor(n / fps);
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}:${pad(ff)}`;
}

export function toEdl(p: Project): HandoffResult {
  const rate = p.settings.frameRate;
  const fps = Math.round(rate.num / rate.den);
  const fr = (x: Flicks) => frames(x, rate);
  const rec0 = 3600 * fps; // record timecode starts at 01:00:00:00
  const notes: string[] = [];
  const primary = [...p.tracks].reverse().find((tr) => tr.kind === 'video') ?? null;
  const a1 = p.tracks.find((tr) => tr.kind === 'audio') ?? null;
  const lines: string[] = [`TITLE: ${p.name.replace(/[^\x20-\x7e]/g, '').slice(0, 70) || 'Veyra timeline'}`, 'FCM: NON-DROP FRAME', ''];
  let ev = 0;
  const num = () => String(++ev).padStart(3, '0');
  const reel = 'AX      ';
  const asset = (c: Clip) => (c.assetId ? p.assets.find((a) => a.id === c.assetId) : undefined);
  const exported: Clip[] = [];

  const event = (n: string, ch: string, type: string, srcIn: number, srcOut: number, recIn: number, recOut: number) =>
    `${n}  ${reel} ${ch.padEnd(5)} ${type.padEnd(8)} ${tc(srcIn, fps)} ${tc(srcOut, fps)} ${tc(rec0 + recIn, fps)} ${tc(rec0 + recOut, fps)}`;

  if (primary) {
    const clips = primary.clipIds.map((id) => p.clips[id]!).filter((c) => {
      const a = asset(c);
      return a && (a.kind === 'video' || a.kind === 'image');
    });
    const trans = new Map(Object.values(p.transitions).filter((x) => p.clips[x.fromClipId]?.trackId === primary.id).map((x) => [x.toClipId, x]));
    const outTrans = new Map(Object.values(p.transitions).filter((x) => p.clips[x.fromClipId]?.trackId === primary.id).map((x) => [x.fromClipId, x]));
    for (const c of clips) {
      exported.push(c);
      const a = asset(c)!;
      const ch = a.kind === 'video' && (a.info?.audio.length ?? 0) > 0 && !isMutedClip(c) ? 'B' : 'V';
      const out = outTrans.get(c.id);
      const inT = trans.get(c.id);
      const recIn = fr(c.start) - (inT ? Math.round(fr(inT.duration) / 2) : 0);
      const recOut = fr(clipEnd(c)) - (out ? Math.round(fr(out.duration) / 2) : 0);
      const srcIn = fr(c.sourceIn) - (inT ? Math.round(fr(inT.duration) / 2) : 0);
      const srcOut = srcIn + (recOut - recIn);
      const name = `* FROM CLIP NAME: ${a.fileName}`;
      if (inT) {
        const prev = p.clips[inT.fromClipId]!;
        const pa = asset(prev);
        const pSrc = fr(prev.sourceIn) + (recIn - fr(prev.start));
        const n = num();
        lines.push(event(n, ch, 'C', pSrc, pSrc, recIn, recIn));
        lines.push(event(n, ch, `D    ${String(Math.round(fr(inT.duration))).padStart(3, '0')}`, srcIn, srcOut, recIn, recOut));
        lines.push(`* FROM CLIP NAME: ${pa?.fileName ?? prev.name}`);
        lines.push(`* TO CLIP NAME: ${a.fileName}`);
      } else {
        lines.push(event(num(), ch, 'C', srcIn, srcOut, recIn, recOut));
        lines.push(name);
      }
      lines.push('');
    }
  }
  if (a1) {
    for (const id of a1.clipIds) {
      const c = p.clips[id]!;
      const a = asset(c);
      if (!a || (a.info?.audio.length ?? 0) === 0) continue;
      exported.push(c);
      lines.push(event(num(), 'A', 'C', fr(c.sourceIn), fr(c.sourceIn + c.duration), fr(c.start), fr(clipEnd(c))));
      lines.push(`* FROM CLIP NAME: ${a.fileName}`, '');
    }
  }
  const others = p.tracks.filter((tr) => tr !== primary && tr !== a1 && tr.clipIds.length);
  if (others.length) notes.push(`EDL holds one video and one audio track; ${others.map((x) => x.name).join(', ')} not included — use FCPXML for every track.`);
  notes.push('EDL assumes each file’s own timecode starts at 00:00:00:00 and matches media by file name.');
  return { text: lines.join('\r\n') + '\r\n', notes: [...lossNotes(p, exported), ...notes] };
}
