/** Typed message protocol between the main thread and media workers. */
import type { SerializedMediaError } from '../core/errors';
import type {
  ConvertOptions,
  ConvertResult,
  FileResult,
  FrameOptions,
  FramesOptions,
  GifImagesOptions,
  GifOptions,
  FrameResult,
  MediaInfo,
  Thumbnail,
  ThumbnailOptions,
  WaveformData,
} from '../core/types';
import type { RenderInput } from '@/render/render-project';
import type { SoftSubtitleOptions } from '../encode/subtitles-mux';

export interface JobMap {
  probe: { input: { file: Blob }; output: MediaInfo };
  thumbnails: { input: { file: Blob; options: ThumbnailOptions }; output: Thumbnail[] };
  convert: { input: { file: Blob; options: ConvertOptions }; output: ConvertResult };
  frame: { input: { file: Blob; options: FrameOptions }; output: FrameResult };
  waveform: { input: { file: Blob; peaksPerSecond: number }; output: WaveformData };
  render: { input: RenderInput; output: ConvertResult };
  gif: { input: { file: Blob; options: GifOptions }; output: FileResult };
  gifImages: { input: { files: Blob[]; options: GifImagesOptions }; output: FileResult };
  frames: { input: { file: Blob; options: FramesOptions }; output: FileResult };
  softSubtitles: { input: { file: Blob; options: SoftSubtitleOptions }; output: ConvertResult };
}

export type JobType = keyof JobMap;
export type JobInput<K extends JobType> = JobMap[K]['input'];
export type JobOutput<K extends JobType> = JobMap[K]['output'];

export type ToWorker =
  | { kind: 'run'; jobId: string; type: JobType; input: JobInput<JobType> }
  | { kind: 'cancel'; jobId: string };

export type FromWorker =
  | { kind: 'progress'; jobId: string; progress: number }
  | { kind: 'done'; jobId: string; output: unknown }
  | { kind: 'error'; jobId: string; error: SerializedMediaError };
