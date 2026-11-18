/**
 * Probing with Mediabunny. Runs inside the media worker (but has no worker-only dependencies,
 * so it can also run on the main thread in a pinch).
 */
import {
  ALL_FORMATS,
  BlobSource,
  Input,
  UnsupportedInputFormatError,
  type InputAudioTrack,
  type InputVideoTrack,
} from 'mediabunny';
import { MediaError } from '../core/errors';
import type { AudioTrackInfo, MediaInfo, MediaTags, VideoTrackInfo } from '../core/types';

export function openInput(file: Blob): Input<BlobSource> {
  return new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
}

function formatName(mime: string, fallback: string): string {
  if (mime.includes('mp4')) return 'MP4';
  if (mime.includes('quicktime')) return 'QuickTime';
  if (mime.includes('webm')) return 'WebM';
  if (mime.includes('matroska')) return 'Matroska';
  if (mime.includes('mpeg') && mime.startsWith('audio')) return 'MP3';
  if (mime.includes('wav')) return 'WAVE';
  if (mime.includes('ogg')) return 'Ogg';
  if (mime.includes('flac')) return 'FLAC';
  if (mime.includes('aac')) return 'ADTS';
  if (mime.includes('mp2t')) return 'MPEG-TS';
  return fallback;
}

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

async function describeVideo(track: InputVideoTrack, warnings: string[]): Promise<VideoTrackInfo> {
  const frameRate = await safe(async () => {
    const m = await track.computeFrameRateMetrics({ targetPacketCount: 600 });
    return {
      bestGuess: m.bestGuessFrameRate,
      average: m.averageFrameRate,
      min: m.minFrameRate,
      max: m.maxFrameRate,
      isConstant: m.frameRateIsConstant,
    };
  }, null);
  if (frameRate && !frameRate.isConstant) {
    warnings.push('Variable frame rate detected. Frames are placed by timestamp, so timing stays accurate.');
  }
  const decodable = await safe(() => track.canDecode(), false);
  if (!decodable) {
    warnings.push(`This browser cannot decode the ${track.codec ?? 'unknown'} video codec natively.`);
  }
  const duration = await safe(() => track.computeDuration(), 0);
  return {
    id: track.id,
    codec: track.codec,
    codecString: await safe(() => track.getCodecParameterString(), null),
    codedWidth: track.codedWidth,
    codedHeight: track.codedHeight,
    displayWidth: track.displayWidth,
    displayHeight: track.displayHeight,
    rotation: track.rotation,
    pixelAspectRatio: track.pixelAspectRatio,
    frameRate,
    bitrate: await safe(() => track.getAverageBitrate(), null),
    hdr: await safe(() => track.hasHighDynamicRange(), false),
    canBeTransparent: await safe(() => track.canBeTransparent(), false),
    decodable,
    languageCode: track.languageCode,
    name: track.name,
    duration,
  };
}

async function describeAudio(track: InputAudioTrack, warnings: string[]): Promise<AudioTrackInfo> {
  const decodable = await safe(() => track.canDecode(), false);
  if (!decodable) warnings.push(`This browser cannot decode the ${track.codec ?? 'unknown'} audio codec natively.`);
  return {
    id: track.id,
    codec: track.codec,
    codecString: await safe(() => track.getCodecParameterString(), null),
    channels: track.numberOfChannels,
    sampleRate: track.sampleRate,
    bitrate: await safe(() => track.getAverageBitrate(), null),
    decodable,
    languageCode: track.languageCode,
    name: track.name,
    duration: await safe(() => track.computeDuration(), 0),
  };
}

export async function probeMedia(file: Blob, signal?: AbortSignal): Promise<MediaInfo> {
  const input = openInput(file);
  const check = () => {
    if (signal?.aborted) throw new MediaError('cancelled', 'Cancelled.');
  };
  try {
    let mimeType: string;
    try {
      mimeType = await input.getMimeType();
    } catch (e) {
      if (e instanceof UnsupportedInputFormatError) {
        throw new MediaError(
          'unsupported-container',
          'This container format is not supported by the built-in media pipeline.',
          e.message,
        );
      }
      throw new MediaError('corrupt', 'The file could not be read. It may be damaged or incomplete.', String(e));
    }
    check();
    const warnings: string[] = [];
    const videoTracks = await input.getVideoTracks();
    const audioTracks = await input.getAudioTracks();
    if (videoTracks.length === 0 && audioTracks.length === 0) {
      throw new MediaError('no-tracks', 'No audio or video tracks were found in this file.');
    }
    check();
    const video: VideoTrackInfo[] = [];
    for (const t of videoTracks) {
      video.push(await describeVideo(t, warnings));
      check();
    }
    const audio: AudioTrackInfo[] = [];
    for (const t of audioTracks) {
      audio.push(await describeAudio(t, warnings));
      check();
    }

    let duration = 0;
    let durationSource: MediaInfo['durationSource'] = 'none';
    const metaDuration = await safe(() => input.getDurationFromMetadata(), null);
    if (metaDuration != null && metaDuration > 0) {
      duration = metaDuration;
      durationSource = 'metadata';
    } else {
      duration = await safe(() => input.computeDuration(), 0);
      durationSource = duration > 0 ? 'computed' : 'none';
    }

    const rawTags = await safe(() => input.getMetadataTags(), {});
    const tags: MediaTags = {};
    if (rawTags.title) tags.title = rawTags.title;
    if (rawTags.artist) tags.artist = rawTags.artist;
    if (rawTags.album) tags.album = rawTags.album;
    if (rawTags.comment) tags.comment = rawTags.comment;
    if (rawTags.date) tags.date = rawTags.date.toISOString();

    const primary = video[0];
    return {
      kind: video.length > 0 ? 'video' : 'audio',
      container: formatName(mimeType, mimeType),
      mimeType,
      size: file.size,
      duration,
      durationSource,
      bitrate: duration > 0 ? Math.round((file.size * 8) / duration) : null,
      video,
      audio,
      width: primary?.displayWidth ?? 0,
      height: primary?.displayHeight ?? 0,
      tags,
      warnings,
    };
  } finally {
    input.dispose();
  }
}
