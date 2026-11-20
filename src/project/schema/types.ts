import type { MediaInfo, MediaKind } from '@/media-engine/core/types';
import type { SubtitleCue } from '@/media-engine/subtitles/parse';
import type { Flicks, Rational } from '@/utils/time';

export const SCHEMA_VERSION = 1;

export interface ProjectSettings {
  width: number;
  height: number;
  frameRate: Rational;
  sampleRate: number;
  background: string; // hex color
}

export interface AssetFolder {
  id: string;
  name: string;
}

export interface Asset {
  id: string;
  kind: MediaKind;
  name: string;
  /** Original file name, used for relinking. */
  fileName: string;
  size: number;
  lastModified: number;
  /** size + lastModified + hash of head/tail bytes. Used to verify relinks and key caches. */
  fingerprint: string;
  mimeType: string;
  /** Present for video/audio/image. */
  info: MediaInfo | null;
  /** Present for subtitle assets (parsed text is small, so it is stored in the project). */
  subtitles: SubtitleCue[] | null;
  folderId: string | null;
  addedAt: number;
}

export type TrackKind = 'video' | 'audio' | 'text' | 'overlay';

export interface Track {
  id: string;
  kind: TrackKind;
  name: string;
  locked: boolean;
  muted: boolean;
  hidden: boolean;
  /** Only solo'd tracks are heard when any track is solo'd. */
  solo: boolean;
  /** Linear track gain (mixer fader). */
  volume: number;
  /** Clip ids ordered by start time. Clips never overlap within a track. */
  clipIds: string[];
}

export interface Transform {
  x: number; // px offset from canvas center
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number; // degrees
  flipH: boolean;
  flipV: boolean;
  crop: { left: number; top: number; right: number; bottom: number }; // fractions 0..1
}

export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten' | 'add';

export interface EffectInstance {
  id: string;
  type: string;
  enabled: boolean;
  params: Record<string, number | string | boolean>;
}

export type Easing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'hold' | 'bezier';

export interface Keyframe {
  /** Offset from clip start, in flicks. */
  t: Flicks;
  value: number;
  easing: Easing;
  bezier?: [number, number, number, number];
}

export interface ClipAudio {
  gain: number; // linear
  pan: number; // -1..1
  fadeIn: Flicks;
  fadeOut: Flicks;
}

export interface TextContent {
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  background: string | null;
  align: 'left' | 'center' | 'right';
  outline: { color: string; width: number } | null;
  shadow: { color: string; blur: number; x: number; y: number } | null;
  letterSpacing: number;
  lineHeight: number;
}

export interface Clip {
  id: string;
  trackId: string;
  /** null for generated clips (text, color). */
  assetId: string | null;
  /** Timeline position. */
  start: Flicks;
  /** Timeline duration. */
  duration: Flicks;
  /** Offset into the source media (source time, not timeline time). */
  sourceIn: Flicks;
  speed: number;
  reversed: boolean;
  transform: Transform;
  opacity: number;
  blendMode: BlendMode;
  effects: EffectInstance[];
  keyframes: Record<string, Keyframe[]>;
  audio: ClipAudio;
  text: TextContent | null;
  name: string;
}

export interface Transition {
  id: string;
  type: string;
  /** Clip ids of the outgoing/incoming clips (adjacent on the same track). */
  fromClipId: string;
  toClipId: string;
  duration: Flicks;
  params: Record<string, number | string | boolean>;
}

export interface Marker {
  id: string;
  t: Flicks;
  label: string;
  color: string;
}

export interface ExportPreferences {
  container: 'mp4' | 'webm' | 'mov' | 'mkv' | 'm4a' | 'wav' | 'flac' | 'ogg';
  videoCodec: string | null;
  audioCodec: string | null;
  width: number | null;
  height: number | null;
  quality: 'small' | 'balanced' | 'high' | 'max' | 'custom';
  videoBitrate: number | null;
  audioBitrate: number | null;
  fileName: string | null;
  /** Normalise loudness to this LUFS target on export; null = leave the mix as it is. */
  loudness?: number | null;
}

export interface Project {
  schemaVersion: number;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  settings: ProjectSettings;
  folders: AssetFolder[];
  assets: Asset[];
  tracks: Track[];
  clips: Record<string, Clip>;
  transitions: Record<string, Transition>;
  markers: Marker[];
  inPoint: Flicks | null;
  outPoint: Flicks | null;
  exportPrefs: ExportPreferences;
}

/** Lightweight listing entry, stored separately so the project list loads fast. */
export interface ProjectSummary {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  width: number;
  height: number;
  assetCount: number;
  thumbnailAssetId: string | null;
}
