import { useEffect, useState } from 'react';
import { IconFilm } from '@/components/ui/icons';
import { EmptyState } from '@/components/ui/primitives';
import { useLibraryStore } from '@/state/library-store';
import { selectProject, useProjectStore } from '@/state/project-store';
import { cn } from '@/utils/id';
import { useEditorUi } from '../editor-ui-store';
import { ProgramMonitor } from './ProgramMonitor';

/** Monitor area: Program (composited timeline) or Source (the selected library asset). */
export function PreviewMonitor() {
  const monitor = useEditorUi((s) => s.monitor);
  const selectedId = useLibraryStore((s) => s.selectedAssetId);
  // Picking media in the library shows it in the source monitor.
  useEffect(() => {
    if (selectedId) useEditorUi.getState().setMonitor('source');
  }, [selectedId]);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-line px-2" role="tablist" aria-label="Monitor">
        {(['program', 'source'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={monitor === m}
            onClick={() => useEditorUi.getState().setMonitor(m)}
            className={cn('rounded-sm px-2 py-0.5 text-2xs font-semibold uppercase tracking-wider', monitor === m ? 'bg-surface-3 text-fg' : 'text-muted hover:text-fg')}
          >
            {m}
          </button>
        ))}
      </div>
      {/* Program stays mounted (its worker keeps decoders warm); it is hidden while Source shows. */}
      <div className={cn('min-h-0 flex-1 flex-col', monitor === 'program' ? 'flex' : 'hidden')}>
        <ProgramMonitor />
      </div>
      {monitor === 'source' && <SourceMonitor />}
    </div>
  );
}

/** Source monitor: plays the selected library asset through the browser's media element (Blob URL, no copy). */
function SourceMonitor() {
  const project = useProjectStore(selectProject);
  const selectedId = useLibraryStore((s) => s.selectedAssetId);
  const file = useLibraryStore((s) => (selectedId ? s.files[selectedId] : undefined));
  const asset = project?.assets.find((a) => a.id === selectedId);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-7 shrink-0 items-center gap-2 border-b border-line px-3">
        <span className="truncate text-xs text-muted">{asset ? asset.name : 'No media selected'}</span>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center bg-black p-3">
        {!asset ? (
          <EmptyState icon={<IconFilm size={26} />} title="Select media to preview it">
            The Program tab shows your composed timeline.
          </EmptyState>
        ) : !file ? (
          <EmptyState title="Media offline">Reconnect or locate this file in the media panel to preview it.</EmptyState>
        ) : !url ? null : asset.kind === 'video' ? (
          <video key={url} src={url} controls preload="auto" className="max-h-full max-w-full" />
        ) : asset.kind === 'audio' ? (
          <audio key={url} src={url} controls preload="metadata" className="w-full max-w-md" />
        ) : asset.kind === 'image' ? (
          <img src={url} alt={asset.name} className="max-h-full max-w-full object-contain" />
        ) : (
          <SubtitlePreview cues={asset.subtitles ?? []} />
        )}
      </div>
    </div>
  );
}

function SubtitlePreview({ cues }: { cues: Array<{ start: number; end: number; text: string }> }) {
  return (
    <ol className="h-full w-full max-w-2xl space-y-1 overflow-y-auto text-sm">
      {cues.slice(0, 500).map((c, i) => (
        <li key={i} className="grid grid-cols-[150px_1fr] gap-3 rounded-sm px-2 py-1 odd:bg-white/5">
          <span className="font-mono text-2xs text-faint tabular">
            {c.start.toFixed(3)} → {c.end.toFixed(3)}
          </span>
          {/* Rendered as text: subtitle markup can never become HTML. */}
          <span className="whitespace-pre-wrap text-fg">{c.text}</span>
        </li>
      ))}
      {cues.length > 500 && <li className="px-2 text-xs text-muted">…and {cues.length - 500} more cues</li>}
    </ol>
  );
}
