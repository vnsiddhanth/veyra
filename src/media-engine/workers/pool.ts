import { MediaError } from '../core/errors';
import { JobController, type Job } from '../core/job';
import type { FromWorker, JobInput, JobOutput, JobType, ToWorker } from './protocol';

export type Priority = 'interactive' | 'background';

interface QueuedJob {
  controller: JobController<unknown>;
  type: JobType;
  input: JobInput<JobType>;
  priority: Priority;
  /** Times this job's worker died under it. One retry on a fresh worker is allowed. */
  crashes?: number;
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
      console.warn('[veyra] media worker stopped', e.message || '(no message: script load failure or native crash)');
      if (job && !job.controller.isSettled) {
        job.crashes = (job.crashes ?? 0) + 1;
        // Jobs are idempotent (each run writes its own scratch output), so one retry on a fresh worker
        // turns transient failures (script load hiccup, decoder/GPU reset) into success.
        if (job.crashes <= 1) this.queue.unshift(job);
        else job.controller.reject(new MediaError('worker-crashed', 'The processing worker stopped unexpectedly, twice. Try again, or reload the page.', e.message));
      }
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

  /** While paused, background-priority jobs wait (interactive jobs still run). */
  private backgroundPaused = false;

  setBackgroundPaused(paused: boolean): void {
    this.backgroundPaused = paused;
    if (!paused) this.pump();
  }

  private pump(): void {
    while (this.queue.length > 0) {
      const idx = this.backgroundPaused ? this.queue.findIndex((q) => q.priority !== 'background') : 0;
      if (idx < 0) return;
      let slot = this.slots.find((s) => s.current === null);
      if (!slot && this.slots.length < this.size) slot = this.spawn();
      if (!slot) return;
      const job = this.queue.splice(idx, 1)[0]!;
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
