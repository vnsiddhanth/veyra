import { createId } from '@/utils/id';
import { secondsToFlicks, type Flicks, type Rational } from '@/utils/time';
import {
  SCHEMA_VERSION,
  type Asset,
  type Clip,
  type Project,
  type ProjectSettings,
  type ProjectSummary,
  type Track,
  type TrackKind,
  type Transform,
} from './types';

export const DEFAULT_SETTINGS: ProjectSettings = {
  width: 1920,
  height: 1080,
  frameRate: { num: 30, den: 1 },
  sampleRate: 48000,
  background: '#000000',
};

export function createTrack(kind: TrackKind, name: string): Track {
  return { id: createId('trk'), kind, name, locked: false, muted: false, hidden: false, clipIds: [] };
}

export function createProject(name = 'Untitled project', settings: Partial<ProjectSettings> = {}): Project {
  const now = Date.now();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: createId('prj'),
    name,
    createdAt: now,
    updatedAt: now,
    settings: { ...DEFAULT_SETTINGS, ...settings },
    folders: [],
    assets: [],
    tracks: [createTrack('text', 'T1'), createTrack('video', 'V2'), createTrack('video', 'V1'), createTrack('audio', 'A1'), createTrack('audio', 'A2')],
    clips: {},
    transitions: {},
    markers: [],
    inPoint: null,
    outPoint: null,
    exportPrefs: {
      container: 'mp4',
      videoCodec: null,
      audioCodec: null,
      width: null,
      height: null,
      quality: 'balanced',
      videoBitrate: null,
      audioBitrate: null,
      fileName: null,
    },
  };
}

export function identityTransform(): Transform {
  return { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, flipH: false, flipV: false, crop: { left: 0, top: 0, right: 0, bottom: 0 } };
}

/** Default duration for stills and text when placed on the timeline. */
export const DEFAULT_STILL_DURATION: Flicks = secondsToFlicks(5);

export function createClip(params: {
  trackId: string;
  assetId: string | null;
  start: Flicks;
  duration: Flicks;
  sourceIn?: Flicks;
  name: string;
}): Clip {
  return {
    id: createId('clp'),
    trackId: params.trackId,
    assetId: params.assetId,
    start: params.start,
    duration: params.duration,
    sourceIn: params.sourceIn ?? 0,
    speed: 1,
    reversed: false,
    transform: identityTransform(),
    opacity: 1,
    blendMode: 'normal',
    effects: [],
    keyframes: {},
    audio: { gain: 1, pan: 0, fadeIn: 0, fadeOut: 0 },
    text: null,
    name: params.name,
  };
}

export function summarize(p: Project): ProjectSummary {
  const thumb = p.assets.find((a) => a.kind === 'video' || a.kind === 'image');
  return {
    id: p.id,
    name: p.name,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    width: p.settings.width,
    height: p.settings.height,
    assetCount: p.assets.length,
    thumbnailAssetId: thumb?.id ?? null,
  };
}

/** Source duration of an asset in flicks; Infinity for stills/generated media. */
export function assetSourceDuration(asset: Asset | undefined): Flicks {
  if (!asset || !asset.info || asset.kind === 'image') return Number.POSITIVE_INFINITY;
  return secondsToFlicks(asset.info.duration);
}

export function settingsFromMedia(width: number, height: number, frameRate: Rational): Partial<ProjectSettings> {
  // Keep even dimensions: most encoders (H.264 4:2:0) require them.
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  return { width: even(width), height: even(height), frameRate };
}
