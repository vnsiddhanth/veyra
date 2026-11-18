import { useMemo, useState } from 'react';
import { IconEye, IconEyeOff, IconLock, IconPlus, IconTrash, IconUnlock, IconVolume, IconVolumeOff } from '@/components/ui/icons';
import { Button, IconButton } from '@/components/ui/primitives';
import type { Clip, Project, Track, TrackKind } from '@/project/schema/types';
import { useLibraryStore } from '@/state/library-store';
import { selectProject, useProjectStore } from '@/state/project-store';
import { addTrack, projectDuration, removeTrack, renameTrack, setTrackFlags } from '@/timeline/model/ops';
import { cn } from '@/utils/id';
import { flicksToSeconds, formatTimecode } from '@/utils/time';
import { useEditorUi } from '../editor-ui-store';
import { FilmstripTiles, Waveform } from './ClipContent';

const HEADER_W = 148;
const ROW_H = 44;

const TRACK_COLOR: Record<TrackKind, string> = {
  video: 'bg-track-video',
  audio: 'bg-track-audio',
  text: 'bg-track-text',
  overlay: 'bg-track-overlay',
};

function tryApply(fn: (p: Project) => Project) {
  try {
    useProjectStore.getState().apply(fn);
  } catch (e) {
    useEditorUi.getState().notify(e instanceof Error ? e.message : String(e));
  }
}

/** Pick a ruler step (seconds) so labels are at least ~70px apart. */
function rulerStep(pxPerSecond: number): number {
  const steps = [1 / 30, 0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  return steps.find((s) => s * pxPerSecond >= 70) ?? 600;
}

export function TimelinePanel() {
  const project = useProjectStore(selectProject);
  const px = useEditorUi((s) => s.pxPerSecond);
  const setZoom = useEditorUi((s) => s.setZoom);
  if (!project) return null;
  const durationSec = flicksToSeconds(projectDuration(project));
  const contentWidth = Math.max(800, (durationSec + 10) * px);

  return (
    <div className="flex min-h-0 flex-1 flex-col" onFocusCapture={() => useEditorUi.getState().setFocusArea('timeline')}>
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-line px-2">
        <h2 className="text-xs font-semibold">Timeline</h2>
        <AddTrackMenu />
        <span className="hidden text-2xs text-faint lg:inline">
          Use + on a media card to append it. Select a clip and press Delete to remove it. Drag, trim and split arrive with the timeline engine (Phase 4).
        </span>
        <label className="ml-auto flex items-center gap-2 text-2xs text-faint">
          Zoom
          <input
            type="range"
            min={Math.log(2)}
            max={Math.log(800)}
            step={0.01}
            value={Math.log(px)}
            onChange={(e) => setZoom(Math.exp(Number(e.target.value)))}
            className="w-28 accent-[var(--c-accent)]"
            aria-label="Timeline zoom"
          />
        </label>
      </div>
      <div className="relative min-h-0 flex-1 overflow-auto">
        <div style={{ width: HEADER_W + contentWidth }} className="relative">
          <Ruler project={project} px={px} width={contentWidth} />
          {project.tracks.map((t) => (
            <TrackRow key={t.id} project={project} track={t} px={px} width={contentWidth} />
          ))}
        </div>
      </div>
    </div>
  );
}

function AddTrackMenu() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu">
        <IconPlus size={14} /> Track
      </Button>
      {open && (
        <div role="menu" className="absolute left-0 top-full z-20 mt-1 w-36 rounded-md border border-line-strong bg-surface-2 py-1 shadow-lg" onMouseLeave={() => setOpen(false)}>
          {(['video', 'audio', 'text', 'overlay'] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="menuitem"
              className="block w-full px-3 py-1.5 text-left text-xs capitalize hover:bg-surface-3"
              onClick={() => {
                setOpen(false);
                // New visual tracks go on top; audio tracks at the bottom.
                tryApply((p) => addTrack(p, k, k === 'audio' ? p.tracks.length : 0));
              }}
            >
              {k} track
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Ruler({ project, px, width }: { project: Project; px: number; width: number }) {
  const step = rulerStep(px);
  const ticks = useMemo(() => {
    const n = Math.ceil(width / px / step);
    return Array.from({ length: n + 1 }, (_, i) => i * step);
  }, [width, px, step]);
  return (
    <div className="sticky top-0 z-10 flex h-6 border-b border-line bg-surface">
      <div style={{ width: HEADER_W }} className="sticky left-0 z-10 shrink-0 border-r border-line bg-surface" />
      <div className="relative flex-1">
        {ticks.map((s) => (
          <div key={s} className="absolute top-0 h-full border-l border-line-strong/60 pl-1 font-mono text-2xs leading-6 text-faint tabular" style={{ left: s * px }}>
            {formatTimecode(Math.round(s * 705_600_000), project.settings.frameRate).replace(/^00:/, '')}
          </div>
        ))}
      </div>
    </div>
  );
}

function TrackRow({ project, track, px, width }: { project: Project; track: Track; px: number; width: number }) {
  const [renaming, setRenaming] = useState(false);
  const isAudio = track.kind === 'audio';
  return (
    <div className="flex border-b border-line" style={{ height: ROW_H }}>
      <div style={{ width: HEADER_W }} className={cn('group sticky left-0 z-[5] flex shrink-0 items-center gap-0.5 border-r border-line bg-surface-2 pl-0 pr-1', track.locked && 'bg-surface-3')}>
        <span className={cn('mr-1.5 h-full w-1', TRACK_COLOR[track.kind])} />
        {renaming ? (
          <input
            autoFocus
            defaultValue={track.name}
            aria-label="Track name"
            className="w-14 rounded-sm border border-accent bg-surface px-1 text-xs"
            onBlur={(e) => {
              if (e.target.value.trim() && e.target.value !== track.name) tryApply((p) => renameTrack(p, track.id, e.target.value));
              setRenaming(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') setRenaming(false);
            }}
          />
        ) : (
          <button type="button" className="w-14 truncate text-left text-xs font-medium" onDoubleClick={() => setRenaming(true)} title={`${track.kind} track. Double-click to rename.`}>
            {track.name}
          </button>
        )}
        <IconButton label={track.locked ? 'Unlock track' : 'Lock track'} active={track.locked} onClick={() => tryApply((p) => setTrackFlags(p, track.id, { locked: !track.locked }))}>
          {track.locked ? <IconLock size={14} /> : <IconUnlock size={14} />}
        </IconButton>
        {isAudio ? (
          <IconButton label={track.muted ? 'Unmute track' : 'Mute track'} active={track.muted} onClick={() => tryApply((p) => setTrackFlags(p, track.id, { muted: !track.muted }))}>
            {track.muted ? <IconVolumeOff size={14} /> : <IconVolume size={14} />}
          </IconButton>
        ) : (
          <IconButton label={track.hidden ? 'Show track' : 'Hide track'} active={track.hidden} onClick={() => tryApply((p) => setTrackFlags(p, track.id, { hidden: !track.hidden }))}>
            {track.hidden ? <IconEyeOff size={14} /> : <IconEye size={14} />}
          </IconButton>
        )}
        <IconButton
          label="Delete track"
          className="opacity-0 group-hover:opacity-100 focus:opacity-100"
          onClick={() => {
            if (track.clipIds.length && !window.confirm(`Delete track ${track.name} and its ${track.clipIds.length} clip(s)? You can undo this.`)) return;
            tryApply((p) => removeTrack(p, track.id));
          }}
        >
          <IconTrash size={14} />
        </IconButton>
      </div>
      <div className={cn('relative', (track.hidden || track.muted) && 'opacity-50')} style={{ width }}>
        {track.clipIds.map((id) => (
          <ClipBlock key={id} clip={project.clips[id]!} kind={track.kind} px={px} project={project} />
        ))}
      </div>
    </div>
  );
}

function ClipBlock({ clip, kind, px, project }: { clip: Clip; kind: TrackKind; px: number; project: Project }) {
  const selected = useEditorUi((s) => s.selectedClipIds.includes(clip.id));
  const poster = useLibraryStore((s) => (clip.assetId ? s.thumbs[clip.assetId]?.[0] : undefined));
  const strip = useLibraryStore((s) => (clip.assetId ? s.strips[clip.assetId] : undefined));
  const wave = useLibraryStore((s) => (clip.assetId ? s.waveforms[clip.assetId] : undefined));
  const online = useLibraryStore((s) => (clip.assetId ? !!s.files[clip.assetId] : true));
  const left = flicksToSeconds(clip.start) * px;
  const w = Math.max(2, flicksToSeconds(clip.duration) * px);
  const h = ROW_H - 8;
  const sourceIn = flicksToSeconds(clip.sourceIn);
  const span = flicksToSeconds(clip.duration) * clip.speed;
  return (
    <button
      type="button"
      className={cn(
        'absolute bottom-1 top-1 overflow-hidden rounded-sm border text-left',
        TRACK_COLOR[kind],
        selected ? 'border-white ring-1 ring-white' : 'border-black/30',
        !online && 'opacity-60',
      )}
      style={{ left, width: w }}
      title={`${clip.name} · ${formatTimecode(clip.duration, project.settings.frameRate)}${online ? '' : ' · media offline'}`}
      onClick={(e) => {
        const ui = useEditorUi.getState();
        if (e.shiftKey || e.ctrlKey || e.metaKey) ui.selectClips(selected ? ui.selectedClipIds.filter((x) => x !== clip.id) : [...ui.selectedClipIds, clip.id]);
        else ui.selectClips([clip.id]);
      }}
    >
      {kind === 'audio' ? (
        wave && <Waveform data={wave} width={w} height={h} sourceIn={sourceIn} span={span} gain={clip.audio.gain} />
      ) : strip ? (
        <FilmstripTiles strip={strip} width={w} height={h} sourceIn={sourceIn} span={span} />
      ) : (
        poster && <img src={poster} alt="" className="absolute inset-y-0 left-0 h-full w-auto opacity-60" draggable={false} />
      )}
      <span className="relative block truncate px-1.5 pt-0.5 text-2xs font-medium text-white drop-shadow">{clip.name}</span>
    </button>
  );
}
