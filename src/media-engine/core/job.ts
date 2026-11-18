import { MediaError } from './errors';

export type ProgressListener = (progress: number) => void;

/**
 * A cancellable unit of media work. `result` rejects with MediaError('cancelled') on cancel.
 * Progress values are real (reported by the processing code), in 0..1.
 */
export interface Job<T> {
  readonly id: string;
  readonly result: Promise<T>;
  onProgress(listener: ProgressListener): () => void;
  cancel(): void;
}

/** Helper for building a Job from callbacks. Used by the worker pool and by main-thread jobs. */
export class JobController<T> implements Job<T> {
  readonly id: string;
  readonly result: Promise<T>;
  private listeners = new Set<ProgressListener>();
  private settled = false;
  private resolveFn!: (v: T) => void;
  private rejectFn!: (e: MediaError) => void;
  private cancelHandler: (() => void) | null = null;

  constructor(id: string) {
    this.id = id;
    this.result = new Promise<T>((resolve, reject) => {
      this.resolveFn = resolve;
      this.rejectFn = reject;
    });
    // Avoid unhandled-rejection noise when a caller only cancels.
    this.result.catch(() => undefined);
  }

  get isSettled(): boolean {
    return this.settled;
  }

  setCancelHandler(fn: () => void): void {
    this.cancelHandler = fn;
  }

  onProgress(listener: ProgressListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  progress(value: number): void {
    if (this.settled) return;
    const v = Math.min(1, Math.max(0, value));
    for (const l of this.listeners) l(v);
  }

  resolve(value: T): void {
    if (this.settled) return;
    this.settled = true;
    this.resolveFn(value);
  }

  reject(error: unknown): void {
    if (this.settled) return;
    this.settled = true;
    this.rejectFn(MediaError.from(error));
  }

  cancel(): void {
    if (this.settled) return;
    this.cancelHandler?.();
    this.reject(new MediaError('cancelled', 'Cancelled.'));
  }
}
