import { useEffect, useState, type ReactNode } from 'react';
import { FileDrop } from '@/components/ui/FileDrop';
import { IconAlert, IconDownload, IconUpload } from '@/components/ui/icons';
import { Button, Progress } from '@/components/ui/primitives';
import type { ConvertResult, FileResult, MediaError, MediaInfo } from '@/media-engine';
import type { ImportEntry } from '@/state/media-actions';
import { formatBytes, formatDuration } from '@/utils/format';
import { cn } from '@/utils/id';
import type { JobState } from './useMediaJob';

/** Large single-file drop zone shown before a file is chosen. */
export function SourceDrop({ onFile, accept, label = 'Drop a video here', hint }: { onFile(file: File): void; accept: string; label?: string; hint?: ReactNode }) {
  return (
    <FileDrop onFiles={(entries: ImportEntry[]) => entries[0] && onFile(entries[0].file)} multiple={false} accept={accept}>
      {({ dragging, open }) => (
        <div
          className={cn(
            'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-16 text-center transition-colors',
            dragging ? 'border-accent bg-accent-soft' : 'border-line-strong bg-surface',
          )}
        >
          <IconUpload size={22} className="text-faint" />
          <div>
            <p className="text-sm font-medium">{dragging ? 'Drop to open' : label}</p>
            <p className="text-xs text-muted">{hint ?? 'Your file stays on this device. Processing happens in your browser.'}</p>
          </div>
          <Button variant="primary" onClick={open}>
            Choose file
          </Button>
        </div>
      )}
    </FileDrop>
  );
}

/** Link to the Report a problem page, prefilled with this tool and the error. */
function reportUrl(message: string, detail?: string): string {
  const slug = /^\/tools\/([a-z0-9-]+)/.exec(window.location.pathname)?.[1] ?? (window.location.pathname.startsWith('/editor') ? 'editor' : 'general');
  const error = detail ? `${message} (${detail})` : message;
  return `/feedback?type=bug&tool=${slug}&error=${encodeURIComponent(error.slice(0, 500))}`;
}

export function ErrorBox({ error, children }: { error: MediaError | string; children?: ReactNode }) {
  const message = typeof error === 'string' ? error : error.message;
  const detail = typeof error === 'string' ? undefined : error.detail;
  return (
    <div role="alert" className="flex items-start gap-2 rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
      <IconAlert className="mt-0.5 shrink-0" />
      <div className="min-w-0 space-y-1">
        <p>{message}</p>
        {detail && <p className="break-words font-mono text-xs opacity-80">{detail}</p>}
        {children}
        <a href={reportUrl(message, detail)} className="inline-block text-xs font-medium underline underline-offset-2 hover:opacity-80">
          Report this problem
        </a>
      </div>
    </div>
  );
}

function useElapsed(startedAt: number | null): number {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (startedAt == null) return;
    const id = setInterval(() => setNow(performance.now()), 250);
    return () => clearInterval(id);
  }, [startedAt]);
  return startedAt == null ? 0 : (now - startedAt) / 1000;
}

/** Progress, elapsed time, estimate and cancel for a running job. Progress values come from the engine. */
export function JobProgress({ state, onCancel, label }: { state: JobState<unknown>; onCancel(): void; label: string }) {
  const running = state.status === 'running';
  const elapsed = useElapsed(running ? state.startedAt : null);
  if (!running) return null;
  const p = state.progress;
  const remaining = p > 0.05 ? (elapsed / p) * (1 - p) : null;
  return (
    <div className="space-y-2 rounded-md border border-line bg-surface p-3" aria-live="polite">
      <div className="flex items-center gap-3 text-sm">
        <span className="font-medium">{label}</span>
        <span className="font-mono text-muted tabular">{Math.round(p * 100)}%</span>
        <span className="text-xs text-faint">
          {formatDuration(elapsed, 0)} elapsed{remaining != null && ` · ~${formatDuration(remaining, 0)} left`}
        </span>
        <Button size="sm" className="ml-auto" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      <Progress value={p} label={label} />
    </div>
  );
}

/**
 * Object URL owned by an effect, so it is created and revoked in pairs (also under StrictMode's
 * mount → unmount → mount, where a useMemo-created URL would be revoked and never recreated).
 */
export function useObjectUrl(blob: Blob | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) return;
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => {
      URL.revokeObjectURL(u);
      setUrl(null);
    };
  }, [blob]);
  return url;
}

/** Validated conversion output: summary, checks and download. */
export function ConvertResultCard({ result, onReset, resetLabel = 'Start over' }: { result: ConvertResult; onReset(): void; resetLabel?: string }) {
  const url = useObjectUrl(result.file);
  const v = result.info.video[0];
  const a = result.info.audio[0];
  return (
    <div className="overflow-hidden rounded-lg border border-ok/40 bg-surface">
      <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-ok">Done · output verified</p>
          <p className="truncate text-sm font-medium" title={result.file.name}>
            {result.file.name}
          </p>
          <p className="text-xs text-muted">
            {formatBytes(result.file.size)} · {formatDuration(result.info.duration, 3)}
            {v && ` · ${v.displayWidth}×${v.displayHeight} ${v.codec}`}
            {a && ` · ${a.codec} audio`} · took {formatDuration(result.elapsedMs / 1000, 1)}
          </p>
        </div>
        <a
          href={url ?? undefined}
          download={result.file.name}
          className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-accent-fg hover:brightness-110"
        >
          <IconDownload /> Download
        </a>
        <Button onClick={onReset}>{resetLabel}</Button>
      </div>
      {url && result.info.kind === 'video' && (
        <video src={url} controls preload="auto" className="max-h-72 w-full bg-black" aria-label="Output preview" />
      )}
      {url && result.info.kind === 'audio' && <audio src={url} controls preload="metadata" className="w-full p-3" aria-label="Output preview" />}
      <details className="border-t border-line px-4 py-2 text-xs">
        <summary className="cursor-pointer text-muted">Validation checks ({result.checks.filter((c) => c.ok).length}/{result.checks.length} passed)</summary>
        <ul className="mt-2 space-y-1">
          {result.checks.map((c) => (
            <li key={c.name} className="flex gap-2">
              <span className={c.ok ? 'text-ok' : 'text-danger'}>{c.ok ? '✓' : '✗'}</span>
              <span className="w-28 shrink-0 text-muted">{c.name}</span>
              <span className="font-mono">{c.detail}</span>
            </li>
          ))}
        </ul>
        {result.dropped.length > 0 && <p className="mt-2 text-warn">{result.dropped.join(' ')}</p>}
        <p className="mt-2 text-faint">
          {result.storage === 'opfs' ? 'Stored temporarily in this browser’s private file storage until you start over or leave.' : 'Held in memory until you start over or leave.'}
        </p>
      </details>
    </div>
  );
}

/** Validated non-media output (GIF, ZIP). */
export function FileResultCard({ result, onReset, resetLabel = 'Start over' }: { result: FileResult; onReset(): void; resetLabel?: string }) {
  const url = useObjectUrl(result.file);
  const isImage = result.file.type.startsWith('image/');
  return (
    <div className="overflow-hidden rounded-lg border border-ok/40 bg-surface">
      <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-ok">Done · output verified</p>
          <p className="truncate text-sm font-medium" title={result.file.name}>
            {result.file.name}
          </p>
          <p className="text-xs text-muted">
            {formatBytes(result.file.size)} · {result.summary} · took {formatDuration(result.elapsedMs / 1000, 1)}
          </p>
        </div>
        <a
          href={url ?? undefined}
          download={result.file.name}
          className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-accent-fg hover:brightness-110"
        >
          <IconDownload /> Download
        </a>
        <Button onClick={onReset}>{resetLabel}</Button>
      </div>
      {url && isImage && <img src={url} alt="Output preview" className="mx-auto max-h-80 bg-black/40" />}
      <details className="border-t border-line px-4 py-2 text-xs">
        <summary className="cursor-pointer text-muted">Validation checks ({result.checks.filter((c) => c.ok).length}/{result.checks.length} passed)</summary>
        <ul className="mt-2 space-y-1">
          {result.checks.map((c) => (
            <li key={c.name} className="flex gap-2">
              <span className={c.ok ? 'text-ok' : 'text-danger'}>{c.ok ? '✓' : '✗'}</span>
              <span className="w-28 shrink-0 text-muted">{c.name}</span>
              <span className="font-mono">{c.detail}</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

/** Header line for a loaded source file. */
export function SourceHeader({ file, info, onChange, disabled }: { file: File; info: MediaInfo; onChange(): void; disabled?: boolean }) {
  const v = info.video[0];
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="min-w-0 truncate font-medium">{file.name}</span>
      <span className="shrink-0 text-xs text-muted">
        {v ? `${info.width}×${info.height} · ` : ''}
        {formatDuration(info.duration, 2)}
        {v?.frameRate ? ` · ${Number(v.frameRate.bestGuess.toFixed(3))} fps` : ''} · {formatBytes(file.size)}
      </span>
      <Button size="sm" variant="ghost" className="ml-auto" onClick={onChange} disabled={disabled}>
        Change file
      </Button>
    </div>
  );
}

/** Progress / error / cancelled / run button area shared by tools. */
export function JobArea<T>({
  state,
  onCancel,
  label,
  action,
  disabledReason,
  onRun,
  done,
}: {
  state: JobState<T>;
  onCancel(): void;
  label: string;
  action: string;
  disabledReason?: string | null;
  onRun(): void;
  done(result: T): ReactNode;
}) {
  if (state.status === 'done') return <>{done(state.result)}</>;
  return (
    <>
      <JobProgress state={state} onCancel={onCancel} label={label} />
      {state.status === 'error' && <ErrorBox error={state.error} />}
      {state.status === 'cancelled' && <p className="text-sm text-muted">Cancelled. Nothing was saved.</p>}
      {state.status !== 'running' && (
        <div className="flex items-center gap-3">
          <Button variant="primary" size="lg" onClick={onRun} disabled={!!disabledReason} data-run="">
            {action}
          </Button>
          {disabledReason && <span className="text-xs text-muted">{disabledReason}</span>}
        </div>
      )}
    </>
  );
}

export function baseName(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(0, i) : name;
}

/** Renders the empty / probing / error states of a single-source tool; children render when ready. */
export function SourceGate({
  source,
  open,
  clear,
  accept,
  label,
}: {
  source: import('./useSource').SourceState;
  open(file: File): void;
  clear(): void;
  accept: string;
  label?: string;
}) {
  if (source.status === 'empty') return <SourceDrop onFile={open} accept={accept} label={label} />;
  if (source.status === 'probing') return <p className="rounded-lg border border-line bg-surface p-6 text-sm text-muted">Reading {source.file.name}…</p>;
  if (source.status === 'error')
    return (
      <ErrorBox error={source.error}>
        <Button size="sm" className="mt-2" onClick={clear}>
          Choose another file
        </Button>
      </ErrorBox>
    );
  return null;
}

export const VIDEO_ACCEPT = 'video/*,.mp4,.mov,.m4v,.webm,.mkv,.ts,.mts,.m2ts';
export const AUDIO_ACCEPT = 'audio/*,video/*,.mp3,.m4a,.aac,.wav,.flac,.ogg,.opus,.webm,.mp4,.mov,.mkv';
export const IMAGE_ACCEPT = 'image/*,.png,.jpg,.jpeg,.webp,.gif,.avif,.bmp';
