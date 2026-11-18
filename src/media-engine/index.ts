/**
 * Media engine facade. UI code talks only to this module.
 */
import { MediaError } from './core/errors';
import { JobController, type Job } from './core/job';
import type { ConvertOptions, ConvertResult, FileResult, FrameOptions, FrameResult, FramesOptions, GifImagesOptions, GifOptions, MediaInfo, Thumbnail, ThumbnailOptions, WaveformData } from './core/types';
import type { RenderInput } from '@/render/render-project';
import type { SoftSubtitleOptions } from './encode/subtitles-mux';
import type { MotionAnalysis } from './decode/motion';
export type { MotionAnalysis } from './decode/motion';
import type { BenchOptions, BenchResult } from './bench';
export type { BenchResult } from './bench';
import { deleteScratchFile } from './encode/output-store';
import { classifyFile, type Classification } from './import/classify';
import { imageThumbnail, probeImage } from './import/image-probe';
import { WorkerPool, type Priority } from './workers/pool';

export * from './core/types';
export { MediaError } from './core/errors';
export type { Job } from './core/job';
export { classifyFile, ACCEPT_ATTRIBUTE, extensionOf } from './import/classify';

let pool: WorkerPool | null = null;
function getPool(): WorkerPool {
  pool ??= new WorkerPool(
    () => new Worker(new URL('./workers/media.worker.ts', import.meta.url), { type: 'module', name: 'media' }),
  );
  return pool;
}

let localJobs = 0;

/** Wrap a main-thread async function as a Job. */
function localJob<T>(fn: (signal: AbortSignal) => Promise<T>): Job<T> {
  const controller = new JobController<T>(`local_${++localJobs}`);
  const abort = new AbortController();
  controller.setCancelHandler(() => abort.abort());
  fn(abort.signal).then(
    (v) => controller.resolve(v),
    (e) => controller.reject(e),
  );
  return controller;
}

export interface ProbeResult {
  classification: Classification;
  info: MediaInfo;
}

export const mediaEngine = {
  /**
   * Classify and probe any supported file. Video/audio probing happens in a worker;
   * images are probed on the main thread (cheap); subtitles are not probed here.
   */
  probe(file: File, priority: Priority = 'interactive'): Job<ProbeResult> {
    const outer = new JobController<ProbeResult>(`probe_${++localJobs}`);
    let inner: Job<MediaInfo> | null = null;
    outer.setCancelHandler(() => inner?.cancel());
    (async () => {
      const classification = await classifyFile(file);
      if (outer.isSettled) return;
      if (classification.kind === 'unknown' || classification.kind === 'subtitle') {
        throw new MediaError('not-media', classification.reason ?? 'This is not a video, audio or image file.');
      }
      if (classification.kind === 'image') {
        inner = localJob(() => probeImage(file, classification.container));
      } else {
        if (!classification.primaryPipeline) {
          throw new MediaError(
            'unsupported-container',
            `${classification.container ?? 'This'} files are not supported yet. Support through the compatibility converter is planned.`,
          );
        }
        inner = getPool().run('probe', { file }, priority);
      }
      inner.onProgress((p) => outer.progress(p));
      outer.resolve({ classification, info: await inner.result });
    })().catch((e) => outer.reject(e));
    return outer;
  },

  thumbnails(file: File, options: ThumbnailOptions, priority: Priority = 'background'): Job<Thumbnail[]> {
    return getPool().run('thumbnails', { file, options }, priority);
  },

  imageThumbnail(file: File, width: number): Job<Blob | null> {
    return localJob(() => imageThumbnail(file, width));
  },

  /** Trim / transcode / remux one file. The result has been re-opened and validated. */
  convert(file: Blob, options: ConvertOptions): Job<ConvertResult> {
    return getPool().run('convert', { file, options }, 'interactive');
  },

  /** Decode one frame and encode it as an image. */
  extractFrame(file: Blob, options: FrameOptions): Job<FrameResult> {
    return getPool().run('frame', { file, options }, 'interactive');
  },

  /** Peak envelope of the primary audio track, for waveform display. */
  waveform(file: Blob, peaksPerSecond = 50): Job<WaveformData> {
    return getPool().run('waveform', { file, peaksPerSecond }, 'background');
  },

  /** Render a project (timeline export, or a tool's generated composition). Output validated. */
  render(input: RenderInput): Job<ConvertResult> {
    return getPool().run('render', input, 'interactive');
  },

  gif(file: Blob, options: GifOptions): Job<FileResult> {
    return getPool().run('gif', { file, options }, 'interactive');
  },

  gifFromImages(files: Blob[], options: GifImagesOptions): Job<FileResult> {
    return getPool().run('gifImages', { files, options }, 'interactive');
  },

  /** Extract many frames into a ZIP archive. */
  frames(file: Blob, options: FramesOptions): Job<FileResult> {
    return getPool().run('frames', { file, options }, 'interactive');
  },

  /** Measure encode/decode/export speed on this device. */
  benchmark(options: BenchOptions): Job<BenchResult> {
    return getPool().run('benchmark', options, 'interactive');
  },

  /** Estimate frame-to-frame camera shift for stabilisation. */
  analyzeMotion(file: Blob, width = 160): Job<MotionAnalysis> {
    return getPool().run('motion', { file, width }, 'interactive');
  },

  /** Mux a WebVTT track into a copy of the video (no re-encode). */
  softSubtitles(file: Blob, options: SoftSubtitleOptions): Job<ConvertResult> {
    return getPool().run('softSubtitles', { file, options }, 'interactive');
  },

  /** Free the on-disk storage of a conversion result once the user is done with it. */
  async releaseOutput(result: Pick<ConvertResult, 'scratchName'>): Promise<void> {
    if (result.scratchName) await deleteScratchFile(result.scratchName);
  },
};
