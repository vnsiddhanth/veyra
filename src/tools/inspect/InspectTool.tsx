import { useCallback, useEffect, useRef, useState } from 'react';
import { MediaInfoView } from '@/components/media/MediaInfoView';
import { FileDrop } from '@/components/ui/FileDrop';
import { IconAlert, IconUpload, IconX } from '@/components/ui/icons';
import { Button, Progress } from '@/components/ui/primitives';
import { mediaEngine, type Job, type MediaInfo, type ProbeResult } from '@/media-engine';
import type { ImportEntry } from '@/state/media-actions';
import type { ToolDef } from '@/tools/registry';
import { formatDuration } from '@/utils/format';
import { cn, createId } from '@/utils/id';

interface Row {
  id: string;
  file: File;
  url: string;
  progress: number;
  info: MediaInfo | null;
  error: string | null;
  job: Job<ProbeResult> | null;
}

/**
 * Inspector-family tools (metadata, frame rate, resolution, duration, audio).
 * Probing runs in the media worker; nothing leaves the device.
 */
export function InspectTool({ tool }: { tool: ToolDef }) {
  const [rows, setRows] = useState<Row[]>([]);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const multi = tool.focus === 'duration';
  const audioOnly = tool.focus === 'audio';

  useEffect(
    () => () => {
      for (const r of rowsRef.current) {
        r.job?.cancel();
        URL.revokeObjectURL(r.url);
      }
    },
    [],
  );

  const update = (id: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const onFiles = useCallback(
    (entries: ImportEntry[]) => {
      const added: Row[] = entries.map(({ file }) => ({ id: createId('r'), file, url: URL.createObjectURL(file), progress: 0, info: null, error: null, job: null }));
      setRows((prev) => {
        if (!multi) prev.forEach((r) => (r.job?.cancel(), URL.revokeObjectURL(r.url)));
        return multi ? [...prev, ...added] : added.slice(0, 1);
      });
      for (const row of multi ? added : added.slice(0, 1)) {
        const job = mediaEngine.probe(row.file);
        row.job = job;
        job.onProgress((p) => update(row.id, { progress: p }));
        job.result.then(
          ({ info }) => update(row.id, { info, progress: 1, job: null }),
          (e: Error) => update(row.id, { error: e.message, job: null }),
        );
      }
    },
    [multi],
  );

  const remove = (id: string) =>
    setRows((rs) =>
      rs.filter((r) => {
        if (r.id !== id) return true;
        r.job?.cancel();
        URL.revokeObjectURL(r.url);
        return false;
      }),
    );

  const total = rows.reduce((s, r) => s + (r.info?.duration ?? 0), 0);
  const accept = audioOnly ? 'audio/*,.mp3,.wav,.m4a,.aac,.ogg,.oga,.opus,.flac,.weba' : 'video/*,audio/*,.mkv,.mov,.mp4,.webm,.ts,.mts,.m2ts,.mp3,.wav,.m4a,.flac,.ogg,.opus';

  return (
    <div className="space-y-4">
      <FileDrop onFiles={onFiles} multiple={multi} accept={accept}>
        {({ dragging, open }) => (
          <div
            className={cn(
              'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 text-center transition-colors',
              rows.length ? 'py-6' : 'py-14',
              dragging ? 'border-accent bg-accent-soft' : 'border-line-strong bg-surface',
            )}
          >
            <IconUpload size={22} className="text-faint" />
            <div>
              <p className="text-sm font-medium">{dragging ? 'Drop to inspect' : multi ? 'Drop files here' : 'Drop a file here'}</p>
              <p className="text-xs text-muted">The file stays on your device. Only the parts needed to read metadata are read.</p>
            </div>
            <Button variant="primary" onClick={open}>
              {multi ? 'Choose files' : 'Choose file'}
            </Button>
          </div>
        )}
      </FileDrop>

      {multi && rows.length > 0 && (
        <div className="flex items-center justify-between rounded-md border border-line bg-surface px-4 py-3">
          <span className="text-sm text-muted">
            Total of {rows.filter((r) => r.info).length} file{rows.length === 1 ? '' : 's'}
          </span>
          <span className="font-mono text-lg font-semibold tabular">{formatDuration(total, 3)}</span>
        </div>
      )}

      {rows.map((r) => (
        <article key={r.id} className="overflow-hidden rounded-lg border border-line bg-surface">
          <header className="flex items-center gap-3 border-b border-line px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-sm font-medium" title={r.file.name}>
              {r.file.name}
            </span>
            {multi && r.info && <span className="font-mono text-sm tabular text-muted">{formatDuration(r.info.duration, 3)}</span>}
            <button type="button" onClick={() => remove(r.id)} className="text-faint hover:text-fg" aria-label={`Remove ${r.file.name}`}>
              <IconX />
            </button>
          </header>
          {r.error ? (
            <div className="flex items-start gap-2 p-4 text-sm text-danger">
              <IconAlert className="mt-0.5 shrink-0" />
              <span>{r.error}</span>
            </div>
          ) : !r.info ? (
            <div className="space-y-2 p-4">
              <p className="text-xs text-muted">Reading file…</p>
              <Progress value={r.progress > 0 ? r.progress : null} label="Reading file" />
            </div>
          ) : multi ? null : (
            <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
              <div className="flex items-center justify-center bg-black p-2 md:min-h-64">
                {r.info.kind === 'video' ? (
                  <video src={r.url} controls preload="auto" className="max-h-80 w-full" />
                ) : (
                  <audio src={r.url} controls preload="metadata" className="w-full" />
                )}
              </div>
              <div className="pb-3">
                <MediaInfoView info={r.info} focus={tool.focus ?? 'all'} />
              </div>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
