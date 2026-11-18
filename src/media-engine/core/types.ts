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
