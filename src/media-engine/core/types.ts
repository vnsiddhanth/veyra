/** Data contracts produced by the media engine. Plain, structured-clone-safe objects only. */

export type MediaKind = 'video' | 'audio' | 'image' | 'subtitle';

export interface VideoTrackInfo {
  id: number;
  codec: string | null; // mediabunny codec id: avc, hevc, vp9, av1, vp8, prores
  codecString: string | null; // full WebCodecs string, e.g. avc1.64001f
  codedWidth: number;
  codedHeight: number;
  displayWidth: number;
  displayHeight: number;
  rotation: number;
  pixelAspectRatio: { num: number; den: number };
  frameRate: {
    bestGuess: number;
    average: number;
    min: number;
    max: number;
    isConstant: boolean;
  } | null;
  bitrate: number | null;
  hdr: boolean;
  canBeTransparent: boolean;
  decodable: boolean;
  languageCode: string;
  name: string | null;
  duration: number;
}

export interface AudioTrackInfo {
  id: number;
  codec: string | null;
  codecString: string | null;
  channels: number;
  sampleRate: number;
  bitrate: number | null;
  decodable: boolean;
  languageCode: string;
  name: string | null;
  duration: number;
}

export interface MediaTags {
  title?: string;
  artist?: string;
  album?: string;
  comment?: string;
  date?: string;
}

export interface MediaInfo {
  kind: MediaKind;
  container: string; // e.g. "MP4", "WebM", "PNG"
  mimeType: string;
  size: number;
  /** Seconds. 0 for still images. */
  duration: number;
  /** Whether duration came from container metadata or a packet scan. */
  durationSource: 'metadata' | 'computed' | 'none';
  bitrate: number | null;
  video: VideoTrackInfo[];
  audio: AudioTrackInfo[];
  /** For images: pixel size. For video: primary video track display size. */
  width: number;
  height: number;
  tags: MediaTags;
  warnings: string[];
}

export interface ThumbnailOptions {
  count: number;
  width: number;
  /** Seconds; defaults to the full duration. */
  start?: number;
  end?: number;
}

export interface Thumbnail {
  timestamp: number;
  blob: Blob;
  width: number;
  height: number;
}

// ── Conversion / export ────────────────────────────────────────────────────

export type OutputContainer = 'mp4' | 'mov' | 'webm' | 'mkv' | 'm4a' | 'ogg' | 'wav' | 'adts' | 'flac' | 'mp3';
export type QualityLevel = 'very-low' | 'low' | 'medium' | 'high' | 'very-high';

/**
 * How encoded media may be reused instead of re-encoded.
 * - 'accurate': copy only when the result is frame-exact; otherwise re-encode (default)
 * - 'fast': always copy when possible, expanding cuts outward to the nearest key frame
 * - 'never': always re-encode
 */
export type CopyPolicy = 'accurate' | 'fast' | 'never';

export interface ConvertVideoOptions {
  discard?: boolean;
  codec?: string;
  width?: number;
  height?: number;
  fit?: 'fill' | 'contain' | 'cover';
  rotate?: 0 | 90 | 180 | 270;
  flip?: boolean;
  crop?: { left: number; top: number; width: number; height: number };
  frameRate?: number;
  /** Bits per second, or a quality level scaled by Mediabunny to resolution/codec. */
  bitrate?: number | QualityLevel;
  keyFrameInterval?: number;
}

export interface ConvertAudioOptions {
  discard?: boolean;
  codec?: string;
  bitrate?: number | QualityLevel;
  sampleRate?: number;
  numberOfChannels?: number;
}

export interface ConvertOptions {
  container: OutputContainer;
  /** Seconds, relative to the start of the source. */
  trim?: { start: number; end: number };
  video?: ConvertVideoOptions;
  audio?: ConvertAudioOptions;
  copy?: CopyPolicy;
  /** Base name for the output file (extension is added). */
  fileName: string;
}

export interface ValidationCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface ConvertResult {
  /** The output. Backed by OPFS (on disk) when available, otherwise memory. */
  file: File;
  storage: 'opfs' | 'memory';
  /** OPFS scratch entry to delete when the result is dismissed (null for memory outputs). */
  scratchName: string | null;
  info: MediaInfo;
  checks: ValidationCheck[];
  /** Tracks the conversion dropped, with a human-readable reason. */
  dropped: string[];
  elapsedMs: number;
}

export interface FrameOptions {
  /** Seconds. */
  timestamp: number;
  format: 'png' | 'jpeg' | 'webp';
  quality?: number;
  /** Output width; height follows the display aspect ratio. Omit for full resolution. */
  width?: number;
}

export interface FrameResult {
  blob: Blob;
  width: number;
  height: number;
  /** Timestamp of the decoded frame actually shown at the requested time. */
  frameTimestamp: number;
}

export interface WaveformData {
  /** Peak amplitude per bucket, 0–255 (max over all channels). */
  peaks: Uint8Array;
  peaksPerSecond: number;
  duration: number;
}

// ── Batch / image outputs ──────────────────────────────────────────────────

/** A produced file that is not an audio/video container (GIF, ZIP of frames). */
export interface FileResult {
  file: File;
  storage: 'opfs' | 'memory';
  scratchName: string | null;
  checks: ValidationCheck[];
  summary: string;
  elapsedMs: number;
}

export interface GifOptions {
  /** Seconds; defaults to the whole source (capped by `maxFrames`). */
  start?: number;
  end?: number;
  fps: number;
  width: number;
  /** 2–256 colours per frame. */
  colors: number;
  /** 0 = loop forever, -1 = play once. */
  repeat: number;
  /** Playback speed multiplier. */
  speed?: number;
  fileName: string;
}

export interface FramesOptions {
  start: number;
  end: number;
  /** 'interval': one frame every `interval` seconds; 'all': every frame; 'count': `count` evenly spaced frames. */
  mode: 'interval' | 'all' | 'count';
  interval?: number;
  count?: number;
  format: 'png' | 'jpeg' | 'webp';
  quality?: number;
  width?: number;
  fileName: string;
}

export interface GifImagesOptions {
  width: number;
  height: number;
  /** Milliseconds each image is shown. */
  delay: number;
  colors: number;
  repeat: number;
  background: string;
  fileName: string;
}
