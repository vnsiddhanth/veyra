/**
 * Probing with Mediabunny. Runs inside the media worker (but has no worker-only dependencies,
 * so it can also run on the main thread in a pinch).
 */
import {
  ALL_FORMATS,
  BlobSource,
  EncodedPacketSink,
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

/**
 * Where the media's timeline starts. Transport streams begin at their first PTS (often 1.4 s or
 * hours in); tools treat that point as 0. Small negative starts (AAC priming) are not an offset.
 */
export async function mediaStart(input: Input): Promise<number> {
  const t = await safe(() => input.getFirstTimestamp(), 0);
  return Number.isFinite(t) && t > 0.001 ? t : 0;
}

/**
 * Where the media's data actually ends, in source seconds. A file cut off mid-copy (camera power
 * loss, interrupted download) keeps its MP4 index, so packets past the cut are listed but their
 * bytes are missing. `end` is the last readable point; `indexedEnd` what the index claims.
 */
export async function mediaRange(input: Input): Promise<{ start: number; end: number; indexedEnd: number; truncated: boolean }> {
  const start = await mediaStart(input);
  const indexedEnd = await safe(() => input.computeDuration(), 0);
  const mime = await safe(() => input.getMimeType(), '');
  if (!/mp4|quicktime/.test(mime)) return { start, end: indexedEnd, indexedEnd, truncated: false };
  let end = 0;
  let truncated = false;
  for (const t of await safe(() => input.getTracks(), [])) {
    const sink = new EncodedPacketSink(t);
    const dur = await safe(() => t.computeDuration(), 0);
    const readable = async (ts: number) => !!(await safe(() => sink.getPacket(ts), null));
    if (dur <= 0 || (await readable(dur - 1e-6))) {
      end = Math.max(end, dur);
      continue;
    }
    truncated = true;
    // Binary search for the last readable packet time (to ~1 ms).
    let lo = await safe(() => t.getFirstTimestamp(), 0);
    let hi = dur;
    if (!(await readable(lo))) continue;
    while (hi - lo > 1e-3) {
      const mid = (lo + hi) / 2;
      if (await readable(mid)) lo = mid;
      else hi = mid;
    }
    const last = await safe(() => sink.getPacket(lo), null);
    end = Math.max(end, last ? last.timestamp + last.duration : lo);
  }
  return truncated ? { start, end: Math.min(end, indexedEnd), indexedEnd, truncated } : { start, end: indexedEnd, indexedEnd, truncated };
}

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

/** Rates outside this are measurement artefacts, not real video. */
const MAX_FPS = 240;

/**
 * Frame rate of a video track, safe to build a timeline on. A file with one or two frames has no
 * spacing to measure, and the raw estimate comes back as the container timebase (e.g. 15 360 fps),
 * which would make a 2 s render 30 000 frames long.
 */
export async function frameRateOf(track: InputVideoTrack, targetPacketCount = 120): Promise<number> {
  const m = await safe(() => track.computeFrameRateMetrics({ targetPacketCount }), null);
  if (m && m.probedPacketCount >= 3 && m.bestGuessFrameRate > 0 && m.bestGuessFrameRate <= MAX_FPS) return m.bestGuessFrameRate;
  const s = await safe(() => track.computePacketStats(targetPacketCount), null);
  if (s && s.packetCount >= 2 && s.averagePacketRate > 0 && s.averagePacketRate <= MAX_FPS) return s.averagePacketRate;
  return 30;
}

async function describeVideo(track: InputVideoTrack, warnings: string[]): Promise<VideoTrackInfo> {
  const frameRate = await safe(async () => {
    const m = await track.computeFrameRateMetrics({ targetPacketCount: 600 });
    if (m.probedPacketCount < 3 || !(m.bestGuessFrameRate > 0 && m.bestGuessFrameRate <= MAX_FPS)) {
      const fps = await frameRateOf(track, 600);
      return { bestGuess: fps, average: fps, min: fps, max: fps, isConstant: true };
    }
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
    const range = await mediaRange(input);
    const startTime = range.start;
    const metaDuration = await safe(() => input.getDurationFromMetadata(), null);
    if (range.truncated) {
      duration = Math.max(0, range.end - startTime);
      durationSource = 'computed';
      warnings.push(`This file is incomplete: only the first ${duration.toFixed(2)} s of ${(range.indexedEnd - startTime).toFixed(2)} s is present (it was probably cut off while copying or recording). Only that part will be used.`);
      for (const t of video) t.duration = Math.min(t.duration, duration + startTime);
      for (const t of audio) t.duration = Math.min(t.duration, duration + startTime);
    } else if (metaDuration != null && metaDuration > 0) {
      duration = Math.max(0, metaDuration - startTime);
      durationSource = 'metadata';
    } else {
      duration = Math.max(0, (await safe(() => input.computeDuration(), 0)) - startTime);
      durationSource = duration > 0 ? 'computed' : 'none';
    }
    if (startTime > 0) {
      for (const t of video) t.duration = Math.max(0, t.duration - startTime);
      for (const t of audio) t.duration = Math.max(0, t.duration - startTime);
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
      startTime,
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
