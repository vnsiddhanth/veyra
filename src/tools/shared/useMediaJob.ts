import { useCallback, useEffect, useRef, useState } from 'react';
import type { Job } from '@/media-engine';
import { MediaError } from '@/media-engine';

export type JobState<T> =
  | { status: 'idle' }
  | { status: 'running'; progress: number; startedAt: number }
  | { status: 'done'; result: T }
  | { status: 'error'; error: MediaError }
  | { status: 'cancelled' };

/**
 * Run one media job at a time with real progress, cancel and cleanup on unmount.
 * `onDispose` releases a finished result (e.g. deletes its OPFS file) when replaced or unmounted.
 */
export function useMediaJob<T>(onDispose?: (result: T) => void) {
  const [state, setState] = useState<JobState<T>>({ status: 'idle' });
  const jobRef = useRef<Job<T> | null>(null);
  const resultRef = useRef<T | null>(null);
  const disposeRef = useRef(onDispose);
  disposeRef.current = onDispose;

  const release = useCallback(() => {
    if (resultRef.current != null) disposeRef.current?.(resultRef.current);
    resultRef.current = null;
  }, []);

  const run = useCallback(
    (start: () => Job<T>) => {
      jobRef.current?.cancel();
      release();
      const job = start();
      jobRef.current = job;
      setState({ status: 'running', progress: 0, startedAt: performance.now() });
      job.onProgress((progress) => {
        if (jobRef.current === job) setState((s) => (s.status === 'running' ? { ...s, progress } : s));
      });
      job.result.then(
        (result) => {
          if (jobRef.current !== job) {
            disposeRef.current?.(result);
            return;
          }
          resultRef.current = result;
          setState({ status: 'done', result });
        },
        (e: unknown) => {
          if (jobRef.current !== job) return;
          const error = MediaError.from(e);
          setState(error.code === 'cancelled' ? { status: 'cancelled' } : { status: 'error', error });
        },
      );
    },
    [release],
  );

  const cancel = useCallback(() => jobRef.current?.cancel(), []);
  const reset = useCallback(() => {
    jobRef.current?.cancel();
    jobRef.current = null;
    release();
    setState({ status: 'idle' });
  }, [release]);

  useEffect(
    () => () => {
      jobRef.current?.cancel();
      if (resultRef.current != null) disposeRef.current?.(resultRef.current);
    },
    [],
  );

  return { state, run, cancel, reset };
}
