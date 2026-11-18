/**
 * Validation for untrusted project documents (imported files, storage that may be corrupted).
 *
 * `parseProject` builds a *fresh* object from known fields only. Unknown keys are dropped,
 * `__proto__`/`constructor` keys can never reach our objects, and every value is type-checked.
 * Invalid input throws ProjectValidationError with a path to the offending field.
 */
import type { MediaInfo } from '@/media-engine/core/types';
import type { SubtitleCue } from '@/media-engine/subtitles/parse';
import { DEFAULT_SETTINGS, createProject, identityTransform } from './factory';
import {
  SCHEMA_VERSION,
  type Asset,
  type BlendMode,
  type Clip,
  type Easing,
  type EffectInstance,
  type Keyframe,
  type Marker,
  type Project,
  type TextContent,
  type Track,
  type Transition,
} from './types';

export class ProjectValidationError extends Error {
  constructor(public readonly path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = 'ProjectValidationError';
  }
}

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

function obj(v: unknown, path: string): Obj {
  if (!isObj(v)) throw new ProjectValidationError(path, 'expected an object');
  return v;
}
function str(v: unknown, path: string, max = 10_000): string {
  if (typeof v !== 'string') throw new ProjectValidationError(path, 'expected a string');
  if (v.length > max) throw new ProjectValidationError(path, 'string too long');
  return v;
}
function optStr(v: unknown, path: string): string | null {
  return v == null ? null : str(v, path);
}
function num(v: unknown, path: string, min = -Infinity, max = Infinity): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new ProjectValidationError(path, 'expected a finite number');
  if (v < min || v > max) throw new ProjectValidationError(path, `out of range [${min}, ${max}]`);
  return v;
}
function int(v: unknown, path: string, min = -Infinity, max = Infinity): number {
  const n = num(v, path, min, max);
  if (!Number.isInteger(n)) throw new ProjectValidationError(path, 'expected an integer');
  return n;
}
function bool(v: unknown, path: string): boolean {
  if (typeof v !== 'boolean') throw new ProjectValidationError(path, 'expected a boolean');
  return v;
}
function arr(v: unknown, path: string, max = 100_000): unknown[] {
  if (!Array.isArray(v)) throw new ProjectValidationError(path, 'expected an array');
  if (v.length > max) throw new ProjectValidationError(path, 'array too long');
  return v;
}
function oneOf<T extends string>(v: unknown, path: string, values: readonly T[]): T {
  if (typeof v !== 'string' || !values.includes(v as T)) throw new ProjectValidationError(path, `expected one of ${values.join(', ')}`);
  return v as T;
}
const ID_RE = /^[a-z0-9_-]{1,64}$/i;
function id(v: unknown, path: string): string {
  const s = str(v, path, 64);
  if (!ID_RE.test(s)) throw new ProjectValidationError(path, 'invalid id');
  return s;
}
const COLOR_RE = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;
function color(v: unknown, path: string): string {
  const s = str(v, path, 9);
  if (!COLOR_RE.test(s)) throw new ProjectValidationError(path, 'invalid color');
  return s;
}
function params(v: unknown, path: string): Record<string, number | string | boolean> {
  const o = obj(v, path);
  const out: Record<string, number | string | boolean> = Object.create(null);
  for (const [k, val] of Object.entries(o)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,40}$/.test(k)) throw new ProjectValidationError(`${path}.${k}`, 'invalid key');
    if (typeof val === 'number') out[k] = num(val, `${path}.${k}`);
    else if (typeof val === 'string') out[k] = str(val, `${path}.${k}`, 1000);
    else if (typeof val === 'boolean') out[k] = val;
    else throw new ProjectValidationError(`${path}.${k}`, 'invalid parameter value');
  }
  return { ...out };
}

const KINDS = ['video', 'audio', 'image', 'subtitle'] as const;
const TRACK_KINDS = ['video', 'audio', 'text', 'overlay'] as const;
const BLEND: readonly BlendMode[] = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'add'];
const EASING: readonly Easing[] = ['linear', 'ease-in', 'ease-out', 'ease-in-out', 'hold', 'bezier'];

/**
 * MediaInfo is cached probe output. It is re-derived from the file on relink, so we only need it to be
 * structurally sane, not authoritative. Numbers are checked; strings length-limited.
 */
function mediaInfo(v: unknown, path: string): MediaInfo | null {
  if (v == null) return null;
  const o = obj(v, path);
  const tracks = (a: unknown, p: string) => arr(a, p, 64).map((t, i) => obj(t, `${p}[${i}]`));
  const video = tracks(o.video, `${path}.video`).map((t, i) => {
    const p = `${path}.video[${i}]`;
    const fr = t.frameRate == null ? null : obj(t.frameRate, `${p}.frameRate`);
    const par = obj(t.pixelAspectRatio ?? { num: 1, den: 1 }, `${p}.pixelAspectRatio`);
    return {
      id: int(t.id, `${p}.id`),
      codec: optStr(t.codec, `${p}.codec`),
      codecString: optStr(t.codecString, `${p}.codecString`),
      codedWidth: int(t.codedWidth, `${p}.codedWidth`, 0, 65536),
      codedHeight: int(t.codedHeight, `${p}.codedHeight`, 0, 65536),
      displayWidth: int(t.displayWidth, `${p}.displayWidth`, 0, 65536),
      displayHeight: int(t.displayHeight, `${p}.displayHeight`, 0, 65536),
      rotation: num(t.rotation, `${p}.rotation`),
      pixelAspectRatio: { num: num(par.num, `${p}.par.num`, 1), den: num(par.den, `${p}.par.den`, 1) },
      frameRate: fr
        ? {
            bestGuess: num(fr.bestGuess, `${p}.frameRate.bestGuess`, 0),
            average: num(fr.average, `${p}.frameRate.average`, 0),
            min: num(fr.min, `${p}.frameRate.min`, 0),
            max: num(fr.max, `${p}.frameRate.max`, 0),
            isConstant: bool(fr.isConstant, `${p}.frameRate.isConstant`),
          }
        : null,
      bitrate: t.bitrate == null ? null : num(t.bitrate, `${p}.bitrate`, 0),
      hdr: bool(t.hdr, `${p}.hdr`),
      canBeTransparent: bool(t.canBeTransparent, `${p}.canBeTransparent`),
      decodable: bool(t.decodable, `${p}.decodable`),
      languageCode: str(t.languageCode ?? 'und', `${p}.languageCode`, 32),
      name: optStr(t.name, `${p}.name`),
      duration: num(t.duration, `${p}.duration`, 0),
    };
  });
  const audio = tracks(o.audio, `${path}.audio`).map((t, i) => {
    const p = `${path}.audio[${i}]`;
    return {
      id: int(t.id, `${p}.id`),
      codec: optStr(t.codec, `${p}.codec`),
      codecString: optStr(t.codecString, `${p}.codecString`),
      channels: int(t.channels, `${p}.channels`, 0, 64),
      sampleRate: num(t.sampleRate, `${p}.sampleRate`, 0),
      bitrate: t.bitrate == null ? null : num(t.bitrate, `${p}.bitrate`, 0),
      decodable: bool(t.decodable, `${p}.decodable`),
      languageCode: str(t.languageCode ?? 'und', `${p}.languageCode`, 32),
      name: optStr(t.name, `${p}.name`),
      duration: num(t.duration, `${p}.duration`, 0),
    };
  });
  const tags = isObj(o.tags) ? o.tags : {};
  const tag = (k: string) => (typeof tags[k] === 'string' ? (tags[k] as string).slice(0, 1000) : undefined);
  return {
    kind: oneOf(o.kind, `${path}.kind`, KINDS),
    container: str(o.container, `${path}.container`, 100),
    mimeType: str(o.mimeType, `${path}.mimeType`, 200),
    size: num(o.size, `${path}.size`, 0),
    duration: num(o.duration, `${path}.duration`, 0),
    durationSource: oneOf(o.durationSource, `${path}.durationSource`, ['metadata', 'computed', 'none'] as const),
    bitrate: o.bitrate == null ? null : num(o.bitrate, `${path}.bitrate`, 0),
    video,
    audio,
    width: int(o.width, `${path}.width`, 0, 65536),
    height: int(o.height, `${path}.height`, 0, 65536),
    tags: Object.fromEntries(
      (['title', 'artist', 'album', 'comment', 'date'] as const).flatMap((k) => (tag(k) ? [[k, tag(k)]] : [])),
    ),
    warnings: arr(o.warnings ?? [], `${path}.warnings`, 50).map((w, i) => str(w, `${path}.warnings[${i}]`, 1000)),
  };
}

function cues(v: unknown, path: string): SubtitleCue[] | null {
  if (v == null) return null;
  return arr(v, path, 100_000).map((c, i) => {
    const o = obj(c, `${path}[${i}]`);
    return { start: num(o.start, `${path}[${i}].start`, 0), end: num(o.end, `${path}[${i}].end`, 0), text: str(o.text, `${path}[${i}].text`, 5000) };
  });
}

function asset(v: unknown, path: string): Asset {
  const o = obj(v, path);
  return {
    id: id(o.id, `${path}.id`),
    kind: oneOf(o.kind, `${path}.kind`, KINDS),
    name: str(o.name, `${path}.name`, 500),
    fileName: str(o.fileName, `${path}.fileName`, 500),
    size: num(o.size, `${path}.size`, 0),
    lastModified: num(o.lastModified, `${path}.lastModified`, 0),
    fingerprint: str(o.fingerprint, `${path}.fingerprint`, 200),
    mimeType: str(o.mimeType ?? '', `${path}.mimeType`, 200),
    info: mediaInfo(o.info, `${path}.info`),
    subtitles: cues(o.subtitles, `${path}.subtitles`),
    folderId: o.folderId == null ? null : id(o.folderId, `${path}.folderId`),
    addedAt: num(o.addedAt ?? 0, `${path}.addedAt`, 0),
  };
}

function keyframes(v: unknown, path: string): Record<string, Keyframe[]> {
  const o = obj(v ?? {}, path);
  const out: Record<string, Keyframe[]> = {};
  for (const [prop, list] of Object.entries(o)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_.]{0,60}$/.test(prop)) throw new ProjectValidationError(`${path}.${prop}`, 'invalid property name');
    out[prop] = arr(list, `${path}.${prop}`, 10_000).map((k, i) => {
      const p = `${path}.${prop}[${i}]`;
      const ko = obj(k, p);
      const kf: Keyframe = { t: int(ko.t, `${p}.t`, 0), value: num(ko.value, `${p}.value`), easing: oneOf(ko.easing, `${p}.easing`, EASING) };
      if (ko.bezier != null) {
        const b = arr(ko.bezier, `${p}.bezier`, 4).map((n, j) => num(n, `${p}.bezier[${j}]`));
        if (b.length !== 4) throw new ProjectValidationError(`${p}.bezier`, 'expected 4 numbers');
        kf.bezier = [b[0]!, b[1]!, b[2]!, b[3]!];
      }
      return kf;
    });
  }
  return out;
}

function textContent(v: unknown, path: string): TextContent | null {
  if (v == null) return null;
  const o = obj(v, path);
  const outline = o.outline == null ? null : obj(o.outline, `${path}.outline`);
  const shadow = o.shadow == null ? null : obj(o.shadow, `${path}.shadow`);
  return {
    text: str(o.text, `${path}.text`, 20_000),
    fontFamily: str(o.fontFamily, `${path}.fontFamily`, 200),
    fontSize: num(o.fontSize, `${path}.fontSize`, 1, 2000),
    fontWeight: num(o.fontWeight, `${path}.fontWeight`, 100, 1000),
    color: color(o.color, `${path}.color`),
    background: o.background == null ? null : color(o.background, `${path}.background`),
    align: oneOf(o.align, `${path}.align`, ['left', 'center', 'right'] as const),
    outline: outline ? { color: color(outline.color, `${path}.outline.color`), width: num(outline.width, `${path}.outline.width`, 0, 200) } : null,
    shadow: shadow
      ? {
          color: color(shadow.color, `${path}.shadow.color`),
          blur: num(shadow.blur, `${path}.shadow.blur`, 0, 500),
          x: num(shadow.x, `${path}.shadow.x`),
          y: num(shadow.y, `${path}.shadow.y`),
        }
      : null,
    letterSpacing: num(o.letterSpacing, `${path}.letterSpacing`, -100, 1000),
    lineHeight: num(o.lineHeight, `${path}.lineHeight`, 0.1, 10),
  };
}

function clip(v: unknown, path: string): Clip {
  const o = obj(v, path);
  const t = obj(o.transform ?? identityTransform(), `${path}.transform`);
  const crop = obj(t.crop ?? { left: 0, top: 0, right: 0, bottom: 0 }, `${path}.transform.crop`);
  const a = obj(o.audio ?? {}, `${path}.audio`);
  return {
    id: id(o.id, `${path}.id`),
    trackId: id(o.trackId, `${path}.trackId`),
    assetId: o.assetId == null ? null : id(o.assetId, `${path}.assetId`),
    start: int(o.start, `${path}.start`, 0),
    duration: int(o.duration, `${path}.duration`, 1),
    sourceIn: int(o.sourceIn, `${path}.sourceIn`, 0),
    speed: num(o.speed ?? 1, `${path}.speed`, 0.01, 100),
    reversed: bool(o.reversed ?? false, `${path}.reversed`),
    transform: {
      x: num(t.x, `${path}.transform.x`),
      y: num(t.y, `${path}.transform.y`),
      scaleX: num(t.scaleX, `${path}.transform.scaleX`, -100, 100),
      scaleY: num(t.scaleY, `${path}.transform.scaleY`, -100, 100),
      rotation: num(t.rotation, `${path}.transform.rotation`),
      flipH: bool(t.flipH ?? false, `${path}.transform.flipH`),
      flipV: bool(t.flipV ?? false, `${path}.transform.flipV`),
      crop: {
        left: num(crop.left, `${path}.crop.left`, 0, 1),
        top: num(crop.top, `${path}.crop.top`, 0, 1),
        right: num(crop.right, `${path}.crop.right`, 0, 1),
        bottom: num(crop.bottom, `${path}.crop.bottom`, 0, 1),
      },
    },
    opacity: num(o.opacity ?? 1, `${path}.opacity`, 0, 1),
    blendMode: oneOf(o.blendMode ?? 'normal', `${path}.blendMode`, BLEND),
    effects: arr(o.effects ?? [], `${path}.effects`, 200).map((e, i): EffectInstance => {
      const eo = obj(e, `${path}.effects[${i}]`);
      return {
        id: id(eo.id, `${path}.effects[${i}].id`),
        type: str(eo.type, `${path}.effects[${i}].type`, 64),
        enabled: bool(eo.enabled, `${path}.effects[${i}].enabled`),
        params: params(eo.params ?? {}, `${path}.effects[${i}].params`),
      };
    }),
    keyframes: keyframes(o.keyframes, `${path}.keyframes`),
    audio: {
      gain: num(a.gain ?? 1, `${path}.audio.gain`, 0, 16),
      pan: num(a.pan ?? 0, `${path}.audio.pan`, -1, 1),
      fadeIn: int(a.fadeIn ?? 0, `${path}.audio.fadeIn`, 0),
      fadeOut: int(a.fadeOut ?? 0, `${path}.audio.fadeOut`, 0),
    },
    text: textContent(o.text, `${path}.text`),
    name: str(o.name ?? '', `${path}.name`, 500),
  };
}

function track(v: unknown, path: string): Track {
  const o = obj(v, path);
  return {
    id: id(o.id, `${path}.id`),
    kind: oneOf(o.kind, `${path}.kind`, TRACK_KINDS),
    name: str(o.name, `${path}.name`, 200),
    locked: bool(o.locked ?? false, `${path}.locked`),
    muted: bool(o.muted ?? false, `${path}.muted`),
    hidden: bool(o.hidden ?? false, `${path}.hidden`),
    solo: bool(o.solo ?? false, `${path}.solo`),
    volume: num(o.volume ?? 1, `${path}.volume`, 0, 4),
    clipIds: arr(o.clipIds, `${path}.clipIds`).map((c, i) => id(c, `${path}.clipIds[${i}]`)),
  };
}

export function parseProject(input: unknown): Project {
  const o = obj(input, 'project');
  const version = int(o.schemaVersion, 'project.schemaVersion', 1);
  if (version > SCHEMA_VERSION) {
    throw new ProjectValidationError('project.schemaVersion', `created by a newer version (v${version}); please update`);
  }
  const s = obj(o.settings, 'project.settings');
  const fr = obj(s.frameRate, 'project.settings.frameRate');
  const base = createProject();
  const clipsObj = obj(o.clips ?? {}, 'project.clips');
  const clips: Record<string, Clip> = {};
  for (const [k, c] of Object.entries(clipsObj)) {
    const parsed = clip(c, `project.clips.${k}`);
    if (parsed.id !== k) throw new ProjectValidationError(`project.clips.${k}`, 'key does not match clip id');
    clips[k] = parsed;
  }
  const transObj = obj(o.transitions ?? {}, 'project.transitions');
  const transitions: Record<string, Transition> = {};
  for (const [k, t] of Object.entries(transObj)) {
    const to = obj(t, `project.transitions.${k}`);
    transitions[k] = {
      id: id(to.id, `project.transitions.${k}.id`),
      type: str(to.type, `project.transitions.${k}.type`, 64),
      fromClipId: id(to.fromClipId, `project.transitions.${k}.fromClipId`),
      toClipId: id(to.toClipId, `project.transitions.${k}.toClipId`),
      duration: int(to.duration, `project.transitions.${k}.duration`, 1),
      params: params(to.params ?? {}, `project.transitions.${k}.params`),
    };
  }
  const ep = obj(o.exportPrefs ?? base.exportPrefs, 'project.exportPrefs');
  const project: Project = {
    schemaVersion: SCHEMA_VERSION,
    id: id(o.id, 'project.id'),
    name: str(o.name, 'project.name', 200),
    createdAt: num(o.createdAt, 'project.createdAt', 0),
    updatedAt: num(o.updatedAt, 'project.updatedAt', 0),
    settings: {
      width: int(s.width, 'project.settings.width', 16, 16384),
      height: int(s.height, 'project.settings.height', 16, 16384),
      frameRate: { num: int(fr.num, 'project.settings.frameRate.num', 1, 1_000_000), den: int(fr.den, 'project.settings.frameRate.den', 1, 1_000_000) },
      sampleRate: int(s.sampleRate ?? DEFAULT_SETTINGS.sampleRate, 'project.settings.sampleRate', 8000, 384000),
      background: color(s.background ?? DEFAULT_SETTINGS.background, 'project.settings.background'),
    },
    folders: arr(o.folders ?? [], 'project.folders', 1000).map((f, i) => {
      const fo = obj(f, `project.folders[${i}]`);
      return { id: id(fo.id, `project.folders[${i}].id`), name: str(fo.name, `project.folders[${i}].name`, 200) };
    }),
    assets: arr(o.assets ?? [], 'project.assets', 10_000).map((a, i) => asset(a, `project.assets[${i}]`)),
    tracks: arr(o.tracks ?? [], 'project.tracks', 500).map((t, i) => track(t, `project.tracks[${i}]`)),
    clips,
    transitions,
    markers: arr(o.markers ?? [], 'project.markers', 10_000).map((m, i): Marker => {
      const mo = obj(m, `project.markers[${i}]`);
      return { id: id(mo.id, `project.markers[${i}].id`), t: int(mo.t, `project.markers[${i}].t`, 0), label: str(mo.label, `project.markers[${i}].label`, 500), color: color(mo.color, `project.markers[${i}].color`) };
    }),
    inPoint: o.inPoint == null ? null : int(o.inPoint, 'project.inPoint', 0),
    outPoint: o.outPoint == null ? null : int(o.outPoint, 'project.outPoint', 0),
    exportPrefs: {
      container: oneOf(ep.container ?? 'mp4', 'project.exportPrefs.container', ['mp4', 'webm', 'mov', 'mkv', 'm4a', 'wav', 'flac', 'ogg'] as const),
      videoCodec: optStr(ep.videoCodec, 'project.exportPrefs.videoCodec'),
      audioCodec: optStr(ep.audioCodec, 'project.exportPrefs.audioCodec'),
      width: ep.width == null ? null : int(ep.width, 'project.exportPrefs.width', 16, 16384),
      height: ep.height == null ? null : int(ep.height, 'project.exportPrefs.height', 16, 16384),
      quality: oneOf(ep.quality ?? 'balanced', 'project.exportPrefs.quality', ['small', 'balanced', 'high', 'max', 'custom'] as const),
      videoBitrate: ep.videoBitrate == null ? null : num(ep.videoBitrate, 'project.exportPrefs.videoBitrate', 1),
      audioBitrate: ep.audioBitrate == null ? null : num(ep.audioBitrate, 'project.exportPrefs.audioBitrate', 1),
      fileName: optStr(ep.fileName, 'project.exportPrefs.fileName'),
    },
  };
  checkIntegrity(project);
  return project;
}

/** Referential and timeline invariants. Throws on the first violation. */
export function checkIntegrity(p: Project): void {
  const assetIds = new Set(p.assets.map((a) => a.id));
  const seenClips = new Set<string>();
  const trackIds = new Set<string>();
  for (const t of p.tracks) {
    if (trackIds.has(t.id)) throw new ProjectValidationError(`tracks.${t.id}`, 'duplicate track id');
    trackIds.add(t.id);
    let prevEnd = -1;
    for (const cid of t.clipIds) {
      const c = p.clips[cid];
      if (!c) throw new ProjectValidationError(`tracks.${t.id}`, `references missing clip ${cid}`);
      if (seenClips.has(cid)) throw new ProjectValidationError(`tracks.${t.id}`, `clip ${cid} listed twice`);
      seenClips.add(cid);
      if (c.trackId !== t.id) throw new ProjectValidationError(`clips.${cid}.trackId`, 'does not match owning track');
      if (c.start < prevEnd) throw new ProjectValidationError(`clips.${cid}`, 'overlaps previous clip or is out of order');
      prevEnd = c.start + c.duration;
      if (c.assetId && !assetIds.has(c.assetId)) throw new ProjectValidationError(`clips.${cid}.assetId`, 'references missing asset');
    }
  }
  for (const cid of Object.keys(p.clips)) {
    if (!seenClips.has(cid)) throw new ProjectValidationError(`clips.${cid}`, 'not referenced by any track');
  }
  for (const [tid, tr] of Object.entries(p.transitions)) {
    if (!p.clips[tr.fromClipId] || !p.clips[tr.toClipId]) throw new ProjectValidationError(`transitions.${tid}`, 'references missing clip');
  }
}
