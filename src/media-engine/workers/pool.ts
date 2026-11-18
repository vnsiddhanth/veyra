import { MediaError } from '../core/errors';
import { JobController, type Job } from '../core/job';
import type { FromWorker, JobInput, JobOutput, JobType, ToWorker } from './protocol';

export type Priority = 'interactive' | 'background';

interface QueuedJob {
  controller: JobController<unknown>;
  type: JobType;
  input: JobInput<JobType>;
  priority: Priority;
}

interface Slot {
  worker: Worker;
  current: QueuedJob | null;
}

let jobCounter = 0;

/**
 * Lazily spawned pool of module workers with a two-level priority FIFO queue.
 * - Workers are created on first use (no cost on pages that never process media).
 * - Cancelling a queued job removes it; cancelling a running job signals the worker.
 * - A crashed worker is replaced and its job is rejected with 'worker-crashed'.
 */
export class WorkerPool {
  private slots: Slot[] = [];
  private queue: QueuedJob[] = [];
  private readonly size: number;
  private readonly factory: () => Worker;

  constructor(factory: () => Worker, size?: number) {
    this.factory = factory;
    const hc = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 2 : 2;
    this.size = size ?? Math.max(1, Math.min(4, hc - 1));
  }

  run<K extends JobType>(type: K, input: JobInput<K>, priority: Priority = 'interactive'): Job<JobOutput<K>> {
    const controller = new JobController<JobOutput<K>>(`job_${++jobCounter}`);
    const queued: QueuedJob = { controller: controller as JobController<unknown>, type, input, priority };
    controller.setCancelHandler(() => this.cancel(queued));
    if (priority === 'interactive') {
      const idx = this.queue.findIndex((q) => q.priority === 'background');
      if (idx === -1) this.queue.push(queued);
      else this.queue.splice(idx, 0, queued);
    } else {
      this.queue.push(queued);
    }
    this.pump();
    return controller;
  }

  private cancel(job: QueuedJob): void {
    const qi = this.queue.indexOf(job);
    if (qi >= 0) {
      this.queue.splice(qi, 1);
      return;
    }
    const slot = this.slots.find((s) => s.current === job);
    if (slot) {
      const msg: ToWorker = { kind: 'cancel', jobId: job.controller.id };
      slot.worker.postMessage(msg);
      // The slot frees itself when the worker reports the cancellation error.
    }
  }

  private spawn(): Slot {
    const slot: Slot = { worker: this.factory(), current: null };
    slot.worker.onmessage = (e: MessageEvent<FromWorker>) => this.handle(slot, e.data);
    slot.worker.onerror = (e) => {
      e.preventDefault();
      const job = slot.current;
      slot.worker.terminate();
      this.slots = this.slots.filter((s) => s !== slot);
      job?.controller.reject(new MediaError('worker-crashed', 'The processing worker stopped unexpectedly.', e.message));
      this.pump();
    };
    this.slots.push(slot);
    return slot;
  }

  private handle(slot: Slot, msg: FromWorker): void {
    const job = slot.current;
    if (!job || job.controller.id !== msg.jobId) return;
    if (msg.kind === 'progress') {
      job.controller.progress(msg.progress);
      return;
    }
    if (msg.kind === 'done') job.controller.resolve(msg.output);
    else job.controller.reject(msg.error);
    slot.current = null;
    this.pump();
  }

  private pump(): void {
    while (this.queue.length > 0) {
      let slot = this.slots.find((s) => s.current === null);
      if (!slot && this.slots.length < this.size) slot = this.spawn();
      if (!slot) return;
      const job = this.queue.shift()!;
      slot.current = job;
      const msg: ToWorker = { kind: 'run', jobId: job.controller.id, type: job.type, input: job.input };
      slot.worker.postMessage(msg);
    }
  }

  terminate(): void {
    for (const s of this.slots) {
      s.worker.terminate();
      s.current?.controller.reject(new MediaError('cancelled', 'Cancelled.'));
    }
    this.slots = [];
    for (const q of this.queue) q.controller.reject(new MediaError('cancelled', 'Cancelled.'));
    this.queue = [];
  }
}
