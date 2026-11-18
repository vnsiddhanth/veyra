/**
 * Timeline export. Renders every output frame through the compositor, mixes audio with the
 * AudioMixer, encodes with WebCodecs via Mediabunny and writes to OPFS (or memory). The output
 * is re-opened and validated before it is returned. Runs inside the media worker.
 *
 * Standalone tools that combine media (merge, speed, reverse, replace/add audio, overlays,
 * images → video) build a small Project and render it through this same path.
 */
import {
  AudioSample,
  AudioSampleSource,
  BufferTarget,
  CanvasSource,
  Output,
  StreamTarget,
  canEncodeAudio,
  canEncodeVideo,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
  type AudioCodec,
  type StreamTargetChunk,
  type VideoCodec,
} from 'mediabunny';
import { MediaError } from '@/media-engine/core/errors';
import type { ConvertResult, OutputContainer, QualityLevel } from '@/media-engine/core/types';
import { CONTAINER_INFO, makeFormat, outputFileName, toBitrate, validateOutput } from '@/media-engine/encode/convert';
import { createScratchFile, deleteScratchFile } from '@/media-engine/encode/output-store';
import type { Project } from '@/project/schema/types';
import { projectDuration } from '@/timeline/model/ops';
import { flicksToFrames, flicksToSeconds, framesToFlicks, rateToNumber, type Flicks } from '@/utils/time';
import { AudioMixer } from './audio-mix';
import { Compositor, type LayerImage } from './compositor';
import { audibleClips, resolveFrame, transitionsByClip } from './evaluate';
import { MediaPool } from './sources';

export interface RenderSettings {
  container: Extract<OutputContainer, 'mp4' | 'webm' | 'mov' | 'mkv' | 'm4a' | 'ogg' | 'wav' | 'flac' | 'adts'>;
  videoCodec?: string | null;
  audioCodec?: string | null;
  /** Output size; defaults to the project size. Height follows the project aspect when only width is set. */
  width?: number | null;
  height?: number | null;
  videoBitrate?: number | QualityLevel | null;
  audioBitrate?: number | QualityLevel | null;
  /** Timeline range to export; defaults to in/out points, else the whole timeline. */
  range?: { start: Flicks; end: Flicks } | null;
  includeAudio?: boolean;
  keyFrameInterval?: number;
  fileName: string;
}

export interface RenderInput {
  project: Project;
  /** Asset id → source file. */
  files: Record<string, Blob>;
  settings: RenderSettings;
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

export async function renderProject(input: RenderInput, jobId: string, onProgress: (p: number) => void, signal: AbortSignal): Promise<ConvertResult> {
  const started = performance.now();
  const { project: p, settings: s } = input;
  const meta = CONTAINER_INFO[s.container];
  const rate = p.settings.frameRate;
  const fps = rateToNumber(rate);

  const range = s.range ?? (p.inPoint != null && p.outPoint != null && p.outPoint > p.inPoint ? { start: p.inPoint, end: p.outPoint } : { start: 0, end: projectDuration(p) });
  const f0 = flicksToFrames(range.start, rate);
  const f1 = Math.max(f0, Math.ceil((range.end * rate.num) / (705_600_000 * rate.den) - 1e-9));
  const frameCount = f1 - f0;
  if (frameCount <= 0) throw new MediaError('not-media', 'The timeline is empty. Add a clip before exporting.');
  const duration = frameCount / fps;

  const wantVideo = !meta.audioOnly;
  const wantAudio = s.includeAudio !== false && audibleClips(p).length > 0;
  if (!wantVideo && !wantAudio) throw new MediaError('no-tracks', 'There is no audio on the timeline to export.');

  const W = even(s.width ?? (s.height ? (s.height * p.settings.width) / p.settings.height : p.settings.width));
  const H = even(s.height ?? (W * p.settings.height) / p.settings.width);

  const format = makeFormat(s.container);
  let videoCodec: VideoCodec | null = null;
  if (wantVideo) {
    const req = s.videoCodec as VideoCodec | undefined;
    videoCodec = req && format.getSupportedVideoCodecs().includes(req) && (await canEncodeVideo(req, { width: W, height: H })) ? req : await getFirstEncodableVideoCodec(format.getSupportedVideoCodecs(), { width: W, height: H });
    if (!videoCodec) throw new MediaError('no-encoder', `This browser cannot encode video for ${s.container.toUpperCase()} at ${W}×${H}. Try another format or a smaller size.`);
  }
  let audioCodec: AudioCodec | null = null;
  if (wantAudio) {
    const req = s.audioCodec as AudioCodec | undefined;
    const opts = { numberOfChannels: 2, sampleRate: p.settings.sampleRate };
    audioCodec = req && format.getSupportedAudioCodecs().includes(req) && (await canEncodeAudio(req, opts)) ? req : await getFirstEncodableAudioCodec(format.getSupportedAudioCodecs(), opts);
    if (!audioCodec) throw new MediaError('no-encoder', `This browser cannot encode audio for ${s.container.toUpperCase()}. Try WebM (Opus) or WAV.`);
  }

  const names = outputFileName(s.fileName, s.container, jobId);
  let scratch = await createScratchFile(names.scratch);
  const target = scratch
    ? new StreamTarget(scratch.writable as unknown as WritableStream<StreamTargetChunk>, { chunked: true, chunkSize: 16 * 1024 * 1024 })
    : new BufferTarget();
  const output = new Output({ format, target });
  const pool = new MediaPool(new Map(Object.entries(input.files)), W / p.settings.width);
  let mixer: AudioMixer | null = null;
  let compositor: Compositor | null = null;

  try {
    let videoSource: CanvasSource | null = null;
    if (videoCodec) {
      const canvas = new OffscreenCanvas(W, H);
      compositor = new Compositor(canvas);
      videoSource = new CanvasSource(canvas, {
        codec: videoCodec,
        bitrate: toBitrate(s.videoBitrate ?? 'high'),
        keyFrameInterval: s.keyFrameInterval ?? 2,
        latencyMode: 'quality',
      });
      output.addVideoTrack(videoSource, { frameRate: fps });
    }
    let audioSource: AudioSampleSource | null = null;
    if (audioCodec) {
      audioSource = new AudioSampleSource({ codec: audioCodec, bitrate: toBitrate(s.audioBitrate ?? 'high') });
      output.addAudioTrack(audioSource);
      mixer = new AudioMixer(p, pool, p.settings.sampleRate, flicksToSeconds(framesToFlicks(f0, rate)));
    }
    await output.start();

    const byClip = transitionsByClip(p);
    const sr = p.settings.sampleRate;
    const totalAudio = Math.round(duration * sr);
    let audioDone = 0;
    const BLOCK = 2048;

    const pumpAudio = async (untilSeconds: number) => {
      if (!mixer || !audioSource) return;
      const until = Math.min(totalAudio, Math.round(untilSeconds * sr));
      while (audioDone < until) {
        const n = Math.min(BLOCK, totalAudio - audioDone);
        const [l, r] = await mixer.next(n);
        const data = new Float32Array(n * 2);
        data.set(l.subarray(0, n), 0);
        data.set(r.subarray(0, n), n);
        const sample = new AudioSample({ data, format: 'f32-planar', numberOfChannels: 2, sampleRate: sr, timestamp: audioDone / sr });
        await audioSource.add(sample);
        sample.close();
        audioDone += n;
      }
    };

    for (let f = f0; f < f1; f++) {
      if (signal.aborted) throw new MediaError('cancelled', 'Cancelled.');
      const i = f - f0;
      if (videoSource && compositor) {
        const t = framesToFlicks(f, rate);
        const layers = resolveFrame(p, t, byClip);
        const images = new Map<string, LayerImage>();
        for (const layer of layers) {
          if (!layer.clip.assetId || layer.asset?.kind === 'subtitle') continue;
          const img = await pool.imageFor(p, layer.clip, layer.asset, f);
          if (img) images.set(layer.clip.id, img);
        }
        compositor.render(p, layers, images, f);
        await videoSource.add(i / fps, 1 / fps);
      }
      await pumpAudio((i + 1) / fps);
      if ((i & 3) === 0) onProgress((i / frameCount) * 0.95);
    }
    await pumpAudio(duration);
    if (signal.aborted) throw new MediaError('cancelled', 'Cancelled.');
    await output.finalize();

    let outFile: File;
    if (scratch) outFile = new File([await scratch.handle.getFile()], names.display, { type: meta.mime });
    else {
      const buf = (target as BufferTarget).buffer;
      if (!buf) throw new MediaError('unknown', 'The renderer produced no data.');
      outFile = new File([buf], names.display, { type: meta.mime });
    }

    const { checks, info } = await validateOutput(outFile, {
      expectVideo: !!videoCodec,
      expectAudio: !!audioCodec,
      expectedDuration: duration,
      frameDuration: 1 / fps,
      allowExpansion: false,
      width: videoCodec ? W : undefined,
      height: videoCodec ? H : undefined,
      videoCodec: videoCodec ?? undefined,
      audioCodec: audioCodec ?? undefined,
    });
    const failed = checks.filter((c) => !c.ok);
    if (failed.length) throw new MediaError('validation-failed', `The export failed validation: ${failed.map((c) => `${c.name} (${c.detail})`).join('; ')}.`);
    onProgress(1);
    const warnings = [...pool.warnings, ...(mixer?.warnings ?? []), ...[...(compositor?.skipped ?? [])].map((t) => `Effect “${t}” needs WebGL2, which is unavailable here; it was not applied.`)];
    const result: ConvertResult = {
      file: outFile,
      storage: scratch ? 'opfs' : 'memory',
      scratchName: scratch?.name ?? null,
      info,
      checks,
      dropped: warnings,
      elapsedMs: Math.round(performance.now() - started),
    };
    scratch = null;
    return result;
  } catch (e) {
    await output.cancel().catch(() => undefined);
    if (e instanceof MediaError) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    if (signal.aborted) throw new MediaError('cancelled', 'Cancelled.');
    throw new MediaError('unknown', 'The export failed.', msg);
  } finally {
    mixer?.close();
    compositor?.dispose();
    pool.dispose();
    if (scratch) {
      await scratch.writable.abort().catch(() => undefined);
      await deleteScratchFile(scratch.name);
    }
  }
}
