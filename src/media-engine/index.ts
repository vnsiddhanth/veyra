/**
 * Media engine facade. UI code talks only to this module.
 */
import { MediaError } from './core/errors';
import { JobController, type Job } from './core/job';
import type { MediaInfo, Thumbnail, ThumbnailOptions } from './core/types';
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
};
