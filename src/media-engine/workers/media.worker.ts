/**
 * Media worker: all demuxing, decoding and encoding runs here, off the main thread.
 * Each job has its own AbortController; handlers poll the signal between async steps.
 */
import { MediaError } from '../core/errors';
import { probeMedia } from '../import/probe';
import { generateThumbnails } from '../import/thumbnails';
import { convertMedia } from '../encode/convert';
import { sweepScratchFiles } from '../encode/output-store';
import { computeWaveform, extractFrame } from '../decode/frames';
import { extractFramesZip, imagesToGif, videoToGif } from '../encode/images';
import { renderProject } from '@/render/render-project';
import { addSoftSubtitles } from '../encode/subtitles-mux';
import { canEncodeAudio } from 'mediabunny';
import { registerMp3Encoder } from '@mediabunny/mp3-encoder';
import type { FromWorker, JobInput, JobOutput, JobType, ToWorker } from './protocol';

// Minimal typing for the dedicated worker scope (the DOM and WebWorker libs conflict in one program).
declare const self: {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<ToWorker>) => void) | null;
};

const controllers = new Map<string, AbortController>();

type Handler<K extends JobType> = (
  input: JobInput<K>,
  progress: (p: number) => void,
  signal: AbortSignal,
  jobId: string,
) => Promise<JobOutput<K>>;

const handlers: { [K in JobType]: Handler<K> } = {
  probe: (input, _progress, signal) => probeMedia(input.file, signal),
  thumbnails: (input, progress, signal) => generateThumbnails(input.file, input.options, progress, signal),
  convert: (input, progress, signal, jobId) => convertMedia(input.file, input.options, jobId, progress, signal),
  frame: (input, _progress, signal) => extractFrame(input.file, input.options, signal),
  waveform: (input, progress, signal) => computeWaveform(input.file, input.peaksPerSecond, progress, signal),
  render: (input, progress, signal, jobId) => renderProject(input, jobId, progress, signal),
  gif: (input, progress, signal) => videoToGif(input.file, input.options, progress, signal),
  gifImages: (input, progress, signal) => imagesToGif(input.files, input.options, progress, signal),
  frames: (input, progress, signal, jobId) => extractFramesZip(input.file, input.options, jobId, progress, signal),
  softSubtitles: (input, progress, signal, jobId) => addSoftSubtitles(input.file, input.options, jobId, progress, signal),
};

// MP3 has no WebCodecs encoder in most browsers; register the LAME-based WASM encoder as a fallback.
const encodersReady = canEncodeAudio('mp3').then(
  (ok) => {
    if (!ok) registerMp3Encoder();
  },
  () => registerMp3Encoder(),
);

/** Large typed arrays in results are transferred, not copied. */
function transferablesOf(output: unknown): Transferable[] {
  if (output && typeof output === 'object' && 'peaks' in output && (output as { peaks: unknown }).peaks instanceof Uint8Array) {
    return [(output as { peaks: Uint8Array }).peaks.buffer as ArrayBuffer];
  }
  return [];
}

// Clear outputs abandoned by earlier sessions (older than a day). Best effort.
void sweepScratchFiles();

function post(message: FromWorker, transfer: Transferable[] = []): void {
  self.postMessage(message, transfer);
}

self.onmessage = async (event: MessageEvent<ToWorker>) => {
  const msg = event.data;
  if (msg.kind === 'cancel') {
    controllers.get(msg.jobId)?.abort();
    return;
  }
  const controller = new AbortController();
  controllers.set(msg.jobId, controller);
  try {
    await encodersReady;
    const handler = handlers[msg.type] as Handler<JobType>;
    // Throttle progress messages to ~30/s so a fast job cannot flood the main thread.
    let lastPost = 0;
    const progress = (p: number) => {
      const now = performance.now();
      if (p < 1 && now - lastPost < 33) return;
      lastPost = now;
      post({ kind: 'progress', jobId: msg.jobId, progress: p });
    };
    const output = await handler(msg.input, progress, controller.signal, msg.jobId);
    post({ kind: 'done', jobId: msg.jobId, output }, transferablesOf(output));
  } catch (err) {
    const error =
      err instanceof MediaError
        ? err
        : err instanceof RangeError || (err instanceof DOMException && err.name === 'QuotaExceededError')
          ? new MediaError('out-of-memory', 'The device ran out of memory while processing this file.', String(err))
          : MediaError.from(err);
    post({ kind: 'error', jobId: msg.jobId, error: error.toJSON() });
  } finally {
    controllers.delete(msg.jobId);
  }
};
