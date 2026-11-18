/**
 * Media worker: all demuxing, decoding and encoding runs here, off the main thread.
 * Each job has its own AbortController; handlers poll the signal between async steps.
 */
import { MediaError } from '../core/errors';
import { probeMedia } from '../import/probe';
import { generateThumbnails } from '../import/thumbnails';
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
) => Promise<JobOutput<K>>;

const handlers: { [K in JobType]: Handler<K> } = {
  probe: (input, _progress, signal) => probeMedia(input.file, signal),
  thumbnails: (input, progress, signal) => generateThumbnails(input.file, input.options, progress, signal),
};

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
    const handler = handlers[msg.type] as Handler<JobType>;
    const output = await handler(msg.input, (p) => post({ kind: 'progress', jobId: msg.jobId, progress: p }), controller.signal);
    post({ kind: 'done', jobId: msg.jobId, output });
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
