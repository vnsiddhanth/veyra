import { useState } from 'react';
import { Link } from 'react-router-dom';
import { IconChevronLeft, IconDownload, IconRedo, IconUndo } from '@/components/ui/icons';
import { Button, IconButton } from '@/components/ui/primitives';
import { downloadText, projectFileName, serializeProject } from '@/project/import-export';
import { selectProject, useProjectStore } from '@/state/project-store';
import { formatTimecode, rateToNumber } from '@/utils/time';
import { projectDuration } from '@/timeline/model/ops';
import { cn } from '@/utils/id';
import { useEditorUi } from './editor-ui-store';
import { ExportDialog } from './export/ExportDialog';

const SAVE_LABEL = { saved: 'Saved', dirty: 'Unsaved changes', saving: 'Saving…', error: 'Save failed' } as const;

export function TopBar() {
  const project = useProjectStore(selectProject);
  const saveState = useProjectStore((s) => s.saveState);
  const saveError = useProjectStore((s) => s.saveError);
  const canUndo = useProjectStore((s) => (s.history?.past.length ?? 0) > 0);
  const canRedo = useProjectStore((s) => (s.history?.future.length ?? 0) > 0);
  const [editingName, setEditingName] = useState(false);
  const [exporting, setExporting] = useState(false);
  if (!project) return null;
  const { width, height, frameRate } = project.settings;
  const mod = navigator.platform.toLowerCase().includes('mac') ? '⌘' : 'Ctrl';

  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line bg-surface px-2">
      <Link to="/editor" className="flex h-7 items-center gap-1 rounded-sm px-1.5 text-xs text-muted hover:bg-surface-3 hover:text-fg" title="All projects">
        <IconChevronLeft /> Projects
      </Link>
      <div className="mx-1 h-5 w-px bg-line" />
      {editingName ? (
        <input
          autoFocus
          defaultValue={project.name}
          aria-label="Project name"
          className="h-7 w-56 rounded-sm border border-accent bg-surface-2 px-2 text-sm"
          onBlur={(e) => {
            const name = e.target.value.trim().slice(0, 200);
            if (name && name !== project.name) useProjectStore.getState().apply((p) => ({ ...p, name }));
            setEditingName(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') setEditingName(false);
          }}
        />
      ) : (
        <button type="button" onClick={() => setEditingName(true)} className="max-w-64 truncate rounded-sm px-1.5 py-1 text-sm font-medium hover:bg-surface-3" title="Rename project">
          {project.name}
        </button>
      )}
      <span
        className={cn('text-xs', saveState === 'error' ? 'text-danger' : saveState === 'saved' ? 'text-faint' : 'text-muted')}
        title={saveError ?? 'Projects save automatically in this browser'}
        role="status"
      >
        {SAVE_LABEL[saveState]}
      </span>
      <div className="ml-2 flex items-center">
        <IconButton label={`Undo (${mod}+Z)`} disabled={!canUndo} onClick={() => useProjectStore.getState().undo()}>
          <IconUndo />
        </IconButton>
        <IconButton label={`Redo (${mod}+Shift+Z)`} disabled={!canRedo} onClick={() => useProjectStore.getState().redo()}>
          <IconRedo />
        </IconButton>
      </div>
      <div className="ml-auto hidden items-center gap-3 font-mono text-2xs text-faint tabular md:flex" title="Project format">
        <span>
          {width}×{height}
        </span>
        <span>{Number(rateToNumber(frameRate).toFixed(3))} fps</span>
        <span>{formatTimecode(projectDuration(project), frameRate)}</span>
      </div>
      <Button
        size="sm"
        variant="ghost"
        className="ml-2"
        title="Saves edit decisions and media references only. Media files are not included; keep them alongside."
        onClick={() => {
          downloadText(serializeProject(project), projectFileName(project));
          useEditorUi.getState().notify('Project file saved. It references your media but does not contain it.');
        }}
      >
        <IconDownload /> Project file
      </Button>
      <Button
        size="sm"
        variant="primary"
        className="ml-1"
        onClick={() => {
          useEditorUi.getState().setPlaying(false);
          setExporting(true);
        }}
        disabled={Object.keys(project.clips).length === 0}
        title="Render the timeline to a video file (Ctrl+E)"
      >
        Export
      </Button>
      {exporting && <ExportDialog project={project} onClose={() => setExporting(false)} />}
    </header>
  );
}
