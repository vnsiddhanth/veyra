/**
 * Single-file conversion (trim, transcode, resize, crop, rotate, remux, extract audio).
 * Runs inside the media worker. Built on Mediabunny's Conversion, which stream-copies
 * encoded media when possible and transcodes through WebCodecs otherwise.
 *
 * Every output is re-opened and validated before it is returned. A failed or cancelled
 * conversion never yields a file; partial output is deleted.
 */
import {
  AdtsOutputFormat,
  AudioSampleSink,
  BufferTarget,
  Conversion,
  FlacOutputFormat,
  MkvOutputFormat,
  MovOutputFormat,
  Mp3OutputFormat,
  Mp4OutputFormat,
  OggOutputFormat,
  Output,
  Quality,
  StreamTarget,
  VideoSampleSink,
  WavOutputFormat,
  WebMOutputFormat,
  type AudioCodec,
  type ConversionAudioOptions,
  type ConversionVideoOptions,
  type DiscardedTrack,
  type OutputFormat,
  type StreamTargetChunk,
  type VideoCodec,
} from 'mediabunny';
import { MediaError } from '../core/errors';
import type { ConvertOptions, ConvertResult, OutputContainer, QualityLevel, ValidationCheck } from '../core/types';
import { frameRateOf, mediaRange, openInput, probeMedia } from '../import/probe';
import { createScratchFile, deleteScratchFile } from './output-store';

export const CONTAINER_INFO: Record<OutputContainer, { ext: string; mime: string; audioOnly: boolean }> = {
  mp4: { ext: 'mp4', mime: 'video/mp4', audioOnly: false },
  mov: { ext: 'mov', mime: 'video/quicktime', audioOnly: false },
  webm: { ext: 'webm', mime: 'video/webm', audioOnly: false },
  mkv: { ext: 'mkv', mime: 'video/x-matroska', audioOnly: false },
  m4a: { ext: 'm4a', mime: 'audio/mp4', audioOnly: true },
  ogg: { ext: 'ogg', mime: 'audio/ogg', audioOnly: true },
  wav: { ext: 'wav', mime: 'audio/wav', audioOnly: true },
  adts: { ext: 'aac', mime: 'audio/aac', audioOnly: true },
  flac: { ext: 'flac', mime: 'audio/flac', audioOnly: true },
  mp3: { ext: 'mp3', mime: 'audio/mpeg', audioOnly: true },
};

export function makeFormat(container: OutputContainer): OutputFormat {
  switch (container) {
    case 'mp4':
    case 'm4a':
      // 'in-memory' fast start needs the whole file in RAM; 'reserve' writes the moov at the front without it.
      return new Mp4OutputFormat({ fastStart: false });
    case 'mov':
      return new MovOutputFormat({ fastStart: false });
    case 'webm':
      return new WebMOutputFormat();
    case 'mkv':
      return new MkvOutputFormat();
    case 'ogg':
      return new OggOutputFormat();
    case 'wav':
      return new WavOutputFormat();
    case 'adts':
      return new AdtsOutputFormat();
    case 'flac':
      return new FlacOutputFormat();
    case 'mp3':
      return new Mp3OutputFormat();
  }
}

export const toBitrate = (b: number | QualityLevel | undefined): number | Quality | undefined =>
  b == null ? undefined : typeof b === 'number' ? b : new Quality(b);

const DROP_REASONS: Record<DiscardedTrack['reason'], string> = {
  discarded_by_user: 'removed as requested',
  max_track_count_reached: 'the output format cannot hold more tracks',
  max_track_count_of_type_reached: 'the output format cannot hold more tracks of this type',
  unknown_source_codec: 'its codec is unknown',
  undecodable_source_codec: 'this browser cannot decode its codec',
  no_encodable_target_codec: 'this browser cannot encode any codec this format supports',
  cannot_copy: 'it cannot be copied into this format',
  unknown_maximum_packet_count: 'its size could not be estimated',
};

export function outputFileName(base: string, container: OutputContainer, jobId: string): { scratch: string; display: string } {
  const safe = base.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').trim().slice(0, 120) || 'output';
  const ext = CONTAINER_INFO[container].ext;
  return { scratch: `out_${jobId.replace(/[^a-z0-9_]/gi, '')}__${safe}.${ext}`, display: `${safe}.${ext}` };
}

export async function convertMedia(
  file: Blob,
  options: ConvertOptions,
  jobId: string,
  onProgress: (p: number) => void,
  signal: AbortSignal,
): Promise<ConvertResult> {
  const started = performance.now();
  const meta = CONTAINER_INFO[options.container];
  const names = outputFileName(options.fileName, options.container, jobId);
  const input = openInput(file);
  let scratch = await createScratchFile(names.scratch);
  let conversion: Conversion | null = null;
  const onAbort = () => void conversion?.cancel();
  signal.addEventListener('abort', onAbort);

  try {
    // Times in `options` count from the media's first frame; transport streams start later than 0.
    // A cut-off file is converted up to where its data ends.
    const range = await mediaRange(input);
    const t0 = range.start;
    const sourceDuration = range.end - t0;
    const sourceVideo = await input.getPrimaryVideoTrack();
    const sourceAudio = await input.getPrimaryAudioTrack();
    if (options.trim) {
      const { start, end } = options.trim;
      if (!(start >= 0 && end > start && start < sourceDuration)) throw new MediaError('not-media', 'The trim range is outside the media.');
    }

    // A writable OPFS stream accepts Mediabunny's {type, data, position} chunks as-is.
    const target = scratch
      ? new StreamTarget(scratch.writable as unknown as WritableStream<StreamTargetChunk>, { chunked: true, chunkSize: 16 * 1024 * 1024 })
      : new BufferTarget();
    const output = new Output({ format: makeFormat(options.container), target });

    const v = options.video ?? {};
    const a = options.audio ?? {};
    const videoOptions: ConversionVideoOptions = {
      discard: meta.audioOnly || v.discard === true,
      codec: v.codec as VideoCodec | undefined,
      width: v.width,
      height: v.height,
      fit: v.width && v.height ? (v.fit ?? 'contain') : undefined,
      rotate: v.rotate,
      flip: v.flip,
      crop: v.crop,
      frameRate: v.frameRate,
      bitrate: toBitrate(v.bitrate),
      keyFrameInterval: v.keyFrameInterval,
      forceTranscode: options.copy === 'never' ? true : undefined,
    };
    const audioOptions: ConversionAudioOptions = {
      discard: a.discard === true,
      codec: a.codec as AudioCodec | undefined,
      bitrate: toBitrate(a.bitrate),
      sampleRate: a.sampleRate,
      numberOfChannels: a.numberOfChannels,
      forceTranscode: options.copy === 'never' ? true : undefined,
    };

    conversion = await Conversion.init({
      input,
      output,
      tracks: 'primary',
      video: videoOptions,
      audio: audioOptions,
      trim: options.trim
        ? { start: options.trim.start + t0, end: Math.min(options.trim.end, sourceDuration) + t0 }
        : range.truncated
          ? { start: t0, end: range.end }
          : undefined,
      copy:
        options.copy === 'never'
          ? false
          : options.copy === 'fast'
            ? { mode: 'preferred', boundaryPolicy: 'expand' }
            : { mode: 'preferred', boundaryTolerance: 0 },
      showWarnings: false,
    });

    const dropped = conversion.discardedTracks
      .filter((d) => d.reason !== 'discarded_by_user')
      .map((d) => `${d.track.isVideoTrack() ? 'Video' : 'Audio'} track dropped: ${DROP_REASONS[d.reason]}.`);
    const lostVideo = !!sourceVideo && !videoOptions.discard && conversion.discardedTracks.some((d) => d.track === sourceVideo);
    const lostAudio = !!sourceAudio && !audioOptions.discard && conversion.discardedTracks.some((d) => d.track === sourceAudio);
    if (!conversion.isValid || lostVideo || lostAudio) {
      throw new MediaError(
        'no-encoder',
        dropped[0] ? `${dropped.join(' ')} Try another output format.` : 'This conversion is not possible in this browser. Try another output format.',
      );
    }

    conversion.onProgress = (p) => onProgress(p * 0.95);
    if (signal.aborted) throw new MediaError('cancelled', 'Cancelled.');
    await conversion.execute();
    if (signal.aborted || conversion.state === 'canceled') throw new MediaError('cancelled', 'Cancelled.');

    // Mediabunny closes the stream on finalize, which commits the OPFS file. Wrapping the on-disk
    // File in a new File (for the display name) references its data; nothing is copied into memory.
    let outFile: File;
    if (scratch) {
      outFile = new File([await scratch.handle.getFile()], names.display, { type: meta.mime });
    } else {
      const buf = (target as BufferTarget).buffer;
      if (!buf) throw new MediaError('unknown', 'The converter produced no data.');
      outFile = new File([buf], names.display, { type: meta.mime });
    }

    // Expect the length of the tracks we kept: audio pulled from a video whose soundtrack stops
    // early is legitimately shorter than the video.
    const kept = [!videoOptions.discard ? sourceVideo : null, !audioOptions.discard ? sourceAudio : null].filter((t) => !!t);
    const keptEnds = await Promise.all(kept.map((t) => t!.computeDuration().catch(() => range.end)));
    const keptDuration = keptEnds.length ? Math.min(sourceDuration, Math.max(...keptEnds) - t0) : sourceDuration;
    const expectedDuration = options.trim ? Math.min(options.trim.end, keptDuration) - options.trim.start : keptDuration;
    const fps = sourceVideo ? await frameRateOf(sourceVideo) : undefined;
    const { checks, info } = await validateOutput(outFile, {
      expectVideo: !!sourceVideo && !videoOptions.discard,
      expectAudio: !!sourceAudio && !audioOptions.discard,
      expectedDuration,
      frameDuration: 1 / (v.frameRate ?? fps ?? 30),
      allowExpansion: options.copy === 'fast',
      width: v.width,
      height: v.height,
      videoCodec: v.codec,
      audioCodec: a.codec,
    });
    onProgress(1);
    const failed = checks.filter((c) => !c.ok);
    if (failed.length === 1 && failed[0]!.name === 'Duration' && info.duration < expectedDuration * 0.9) {
      throw new MediaError(
        'corrupt',
        `The source file appears to be damaged or incomplete: only ${info.duration.toFixed(2)} s of the expected ${expectedDuration.toFixed(2)} s could be read. No output was saved.`,
      );
    }
    if (failed.length) {
      throw new MediaError('validation-failed', `The output failed validation: ${failed.map((c) => `${c.name} (${c.detail})`).join('; ')}.`);
    }
    const result: ConvertResult = {
      file: outFile,
      storage: scratch ? 'opfs' : 'memory',
      scratchName: scratch?.name ?? null,
      info,
      checks,
      dropped,
      elapsedMs: Math.round(performance.now() - started),
    };
    scratch = null; // keep the file
    return result;
  } catch (e) {
    if (conversion && conversion.state === 'executing') await conversion.cancel().catch(() => undefined);
    if (e instanceof MediaError) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    if (/cancel/i.test(msg) || signal.aborted) throw new MediaError('cancelled', 'Cancelled.');
    throw new MediaError('unknown', 'The conversion failed.', msg);
  } finally {
    signal.removeEventListener('abort', onAbort);
    input.dispose();
    if (scratch) {
      // Failure or cancel: make sure nothing partial survives.
      await scratch.writable.abort().catch(() => undefined);
      await deleteScratchFile(scratch.name);
    }
  }
}

export interface ValidationExpectations {
  expectVideo: boolean;
  expectAudio: boolean;
  expectedDuration: number;
  frameDuration: number;
  /** Fast (key-frame) trims may legitimately start earlier / end later than requested. */
  allowExpansion: boolean;
  width?: number;
  height?: number;
  videoCodec?: string;
  audioCodec?: string;
}

/**
 * Re-open an output and check it is what we promised: parsable container, expected tracks,
 * duration, size, codec, and that the first and last frames (and the first audio packet) decode.
 */
export async function validateOutput(file: Blob, x: ValidationExpectations): Promise<{ checks: ValidationCheck[]; info: Awaited<ReturnType<typeof probeMedia>> }> {
  const checks: ValidationCheck[] = [];
  let info: Awaited<ReturnType<typeof probeMedia>>;
  try {
    info = await probeMedia(file);
    checks.push({ name: 'Container', ok: true, detail: `${info.container} parses correctly` });
  } catch (e) {
    checks.push({ name: 'Container', ok: false, detail: e instanceof Error ? e.message : String(e) });
    throw new MediaError('validation-failed', 'The output file could not be read back.', String(e));
  }

  const v = info.video[0];
  const a = info.audio[0];
  checks.push({ name: 'Video track', ok: x.expectVideo === !!v, detail: v ? `${v.codec} ${v.displayWidth}×${v.displayHeight}` : x.expectVideo ? 'missing' : 'none (as expected)' });
  checks.push({ name: 'Audio track', ok: x.expectAudio === !!a, detail: a ? `${a.codec} ${a.sampleRate} Hz, ${a.channels} ch` : x.expectAudio ? 'missing' : 'none (as expected)' });

  // Audio codecs pad by up to ~2 packets (AAC priming), hence the extra 50 ms.
  const tol = x.frameDuration + 0.05;
  const d = info.duration;
  const durOk = x.allowExpansion ? d >= x.expectedDuration - tol : Math.abs(d - x.expectedDuration) <= tol;
  checks.push({
    name: 'Duration',
    ok: durOk,
    detail: `${d.toFixed(3)} s (expected ${x.expectedDuration.toFixed(3)} s${x.allowExpansion && d > x.expectedDuration + tol ? ', widened to the nearest key frames' : ''})`,
  });

  if (v && x.width && x.height) {
    checks.push({ name: 'Resolution', ok: v.displayWidth === x.width && v.displayHeight === x.height, detail: `${v.displayWidth}×${v.displayHeight} (requested ${x.width}×${x.height})` });
  }
  if (v && x.videoCodec) checks.push({ name: 'Video codec', ok: v.codec === x.videoCodec, detail: `${v.codec} (requested ${x.videoCodec})` });
  if (a && x.audioCodec) checks.push({ name: 'Audio codec', ok: a.codec === x.audioCodec, detail: `${a.codec} (requested ${x.audioCodec})` });

  // Decode checks: first and last video frame, first audio sample.
  const input = openInput(file);
  try {
    const vt = await input.getPrimaryVideoTrack();
    if (vt && (await vt.canDecode())) {
      const sink = new VideoSampleSink(vt);
      const first = await vt.getFirstTimestamp();
      const end = await vt.computeDuration();
      const s1 = await sink.getSample(first);
      const s2 = await sink.getSample(Math.max(first, end - 1e-3));
      checks.push({ name: 'Video decodes', ok: !!s1 && !!s2, detail: s1 && s2 ? `first frame @ ${s1.timestamp.toFixed(3)} s, last @ ${s2.timestamp.toFixed(3)} s` : 'a frame could not be decoded' });
      s1?.close();
      s2?.close();
    }
    const at = await input.getPrimaryAudioTrack();
    if (at && (await at.canDecode())) {
      // Read the first decoded sample from the stream. A timestamp lookup can miss for codecs whose
      // first packet starts before zero (Opus pre-skip).
      const sink = new AudioSampleSink(at);
      let detail = 'no audio could be decoded';
      let ok = false;
      for await (const s of sink.samples()) {
        ok = s.numberOfFrames > 0;
        detail = `${s.numberOfChannels} ch @ ${s.sampleRate} Hz`;
        s.close();
        break;
      }
      checks.push({ name: 'Audio decodes', ok, detail });
    }
  } finally {
    input.dispose();
  }
  return { checks, info };
}
