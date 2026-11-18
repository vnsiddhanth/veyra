/**
 * Interactive multitrack timeline.
 *
 * Every gesture edits a *draft* project computed with the pure edit operations; the draft is
 * rendered while dragging and committed as one undo step on release. Invalid positions are clamped
 * (moves) or refused (trims stop at their limits), so the model invariants always hold.
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { IconEye, IconEyeOff, IconLock, IconPlus, IconTrash, IconUnlock, IconVolume, IconVolumeOff } from '@/components/ui/icons';
import { Button, IconButton } from '@/components/ui/primitives';
import type { Clip, Project, Track, TrackKind } from '@/project/schema/types';
import { useLibraryStore } from '@/state/library-store';
import { selectProject, useProjectStore } from '@/state/project-store';
import { clampMoveDelta, moveClips, rollEdit, snapDelta, snapTargets, updateMarker } from '@/timeline/model/edit';
import { addTrack, clipEnd, insertClip, projectDuration, removeTrack, renameTrack, setTrackFlags, slipClip, trackAccepts, trimClipEnd, trimClipStart } from '@/timeline/model/ops';
import { cn } from '@/utils/id';
import { FLICKS_PER_SECOND, flicksToSeconds, formatTimecode, quantizeToFrame, secondsToFlicks, type Flicks } from '@/utils/time';
import { useEditorUi } from '../editor-ui-store';
import { ASSET_DRAG_TYPE } from '../media-library/MediaLibrary';
import { FilmstripTiles, Waveform } from './ClipContent';
import {
  addMarkerAtPlayhead,
  addTitle,
  addTransitionAfter,
  copySelection,
  deleteSelection,
  detachSelectedAudio,
  duplicateSelection,
  paste,
  splitAtPlayhead,
  tryEdit,
} from './commands';

const HEADER_W = 148;
const ROW_H = 48;
const RULER_H = 24;
const SNAP_PX = 8;
const EDGE_PX = 6;

const TRACK_COLOR: Record<TrackKind, string> = {
  video: 'bg-track-video',
  audio: 'bg-track-audio',
  text: 'bg-track-text',
  overlay: 'bg-track-overlay',
};

/** Pick a ruler step (seconds) so labels are at least ~70px apart. */
function rulerStep(pxPerSecond: number): number {
  const steps = [1 / 30, 0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  return steps.find((s) => s * pxPerSecond >= 70) ?? 600;
}

/** Track pointer movement after a pointerdown until release. */
function beginDrag(e: RPointerEvent, onMove: (dx: number, dy: number, ev: PointerEvent) => void, onUp: (moved: boolean, ev: PointerEvent) => void) {
  const x0 = e.clientX;
  const y0 = e.clientY;
  let moved = false;
  const move = (ev: PointerEvent) => {
    const dx = ev.clientX - x0;
    const dy = ev.clientY - y0;
    if (!moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
    moved = true;
    onMove(dx, dy, ev);
  };
  const up = (ev: PointerEvent) => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    onUp(moved, ev);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}

interface DragState {
  draft: Project | null;
  guide: Flicks | null;
  marquee: { x0: number; y0: number; x1: number; y1: number } | null;
}

interface MenuState {
  x: number;
  y: number;
  clipId: string;
}

export function TimelinePanel() {
  const project = useProjectStore(selectProject);
  const px = useEditorUi((s) => s.pxPerSecond);
  const setZoom = useEditorUi((s) => s.setZoom);
  const [view, setView] = useState({ left: 0, width: 2000 });
  const snapping = useEditorUi((s) => s.snapping);
  const [drag, setDragState] = useState<DragState>({ draft: null, guide: null, marquee: null });
  const draftRef = useRef<Project | null>(null);
  const setDrag = (d: DragState) => {
    draftRef.current = d.draft;
    setDragState(d);
  };
  const [menu, setMenu] = useState<MenuState | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the playhead visible while playing. Subscribed outside React render so playback does not
  // re-render the whole timeline every frame.
  useEffect(
    () =>
      useEditorUi.subscribe((st, prev) => {
        const el = scrollRef.current;
        if (!el || !st.playing || st.playhead === prev.playhead) return;
        const x = flicksToSeconds(st.playhead) * st.pxPerSecond;
        const viewW = el.clientWidth - HEADER_W;
        if (x < el.scrollLeft || x > el.scrollLeft + viewW - 40) el.scrollLeft = Math.max(0, x - viewW * 0.1);
      }),
    [],
  );

  // Track the visible range so off-screen clips are not rendered (long timelines).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setView({ left: el.scrollLeft, width: el.clientWidth }));
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  // Ctrl/⌘ + wheel zooms around the pointer.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left - HEADER_W + el.scrollLeft;
      const t = x / useEditorUi.getState().pxPerSecond;
      const next = Math.min(800, Math.max(2, useEditorUi.getState().pxPerSecond * Math.exp(-e.deltaY * 0.002)));
      setZoom(next);
      requestAnimationFrame(() => (el.scrollLeft = t * next - (e.clientX - rect.left - HEADER_W)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [setZoom]);

  if (!project) return null;
  const shown = drag.draft ?? project;
  const durationSec = flicksToSeconds(projectDuration(shown));
  const contentWidth = Math.max(800, (durationSec + 20) * px);

  const toFlicks = (x: number) => secondsToFlicks(x / px);
  const frameSnap = (t: Flicks) => quantizeToFrame(Math.max(0, t), project.settings.frameRate, 'round');
  const snapThreshold = toFlicks(SNAP_PX);
  /** X inside the lanes area from a client X. */
  const laneX = (clientX: number) => {
    const el = scrollRef.current!;
    return clientX - el.getBoundingClientRect().left - HEADER_W + el.scrollLeft;
  };

  // ── gestures ────────────────────────────────────────────────────────────

  const startMove = (e: RPointerEvent, clip: Clip) => {
    const ui = useEditorUi.getState();
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    let ids = ui.selectedClipIds;
    if (additive) ids = ids.includes(clip.id) ? ids.filter((x) => x !== clip.id) : [...ids, clip.id];
    else if (!ids.includes(clip.id)) ids = [clip.id];
    ui.selectClips(ids);
    ui.setFocusArea('timeline');
    if (!ids.includes(clip.id)) return;
    const p0 = project;
    if (e.altKey) {
      // Slip: change which part of the source shows, keep the clip in place.
      beginDrag(
        e,
        (dx) => {
          try {
            setDrag({ draft: slipClip(p0, clip.id, -Math.round(toFlicks(dx) * clip.speed)), guide: null, marquee: null });
          } catch (err) {
            ui.notify(err instanceof Error ? err.message : String(err));
          }
        },
        (moved) => commit(moved),
      );
      return;
    }
    const moving = new Set(ids);
    const targets = snapTargets(p0, moving, ui.playhead);
    const edges = ids.flatMap((id) => [p0.clips[id]!.start, clipEnd(p0.clips[id]!)]);
    let last: Project | null = null;
    beginDrag(
      e,
      (dx, dy, ev) => {
        let dt = toFlicks(dx);
        const trackDelta = Math.round(dy / ROW_H);
        let guide: Flicks | null = null;
        if (useEditorUi.getState().snapping !== ev.shiftKey) {
          const s = snapDelta(
            edges.map((x) => x + dt),
            targets,
            snapThreshold,
          );
          dt += s.delta;
          guide = s.target;
        }
        let next: Project | null = null;
        try {
          next = moveClips(p0, ids, dt, trackDelta);
        } catch {
          const clamped = clampMoveDelta(p0, ids, dt, trackDelta);
          if (!Number.isNaN(clamped)) {
            try {
              next = moveClips(p0, ids, clamped, trackDelta);
              guide = null;
            } catch {
              next = null;
            }
          }
        }
        if (next) last = next;
        setDrag({ draft: last, guide, marquee: null });
      },
      (moved) => commit(moved),
    );
  };

  const startTrim = (e: RPointerEvent, clip: Clip, side: 'start' | 'end') => {
    e.stopPropagation();
    const ui = useEditorUi.getState();
    ui.selectClips([clip.id]);
    const p0 = project;
    const track = p0.tracks.find((t) => t.id === clip.trackId)!;
    const i = track.clipIds.indexOf(clip.id);
    const neighbour = side === 'end' ? track.clipIds[i + 1] : track.clipIds[i - 1];
    const n = neighbour ? p0.clips[neighbour]! : null;
    const touching = n && (side === 'end' ? n.start === clipEnd(clip) : clipEnd(n) === clip.start);
    const roll = (e.ctrlKey || e.metaKey) && touching;
    const exclude = new Set([clip.id, ...(roll && n ? [n.id] : [])]);
    const targets = snapTargets(p0, exclude, ui.playhead);
    const edge0 = side === 'start' ? clip.start : clipEnd(clip);
    beginDrag(
      e,
      (dx, _dy, ev) => {
        let t = edge0 + toFlicks(dx);
        let guide: Flicks | null = null;
        if (useEditorUi.getState().snapping !== ev.shiftKey) {
          const s = snapDelta([t], targets, snapThreshold);
          t += s.delta;
          guide = s.target;
        }
        try {
          let next: Project;
          if (roll) next = rollEdit(p0, side === 'end' ? clip.id : n!.id, t);
          else next = side === 'start' ? trimClipStart(p0, clip.id, t) : trimClipEnd(p0, clip.id, t);
          setDrag({ draft: next, guide, marquee: null });
        } catch {
          /* keep the last valid draft */
        }
      },
      (moved) => commit(moved),
    );
  };

  // The draft lives in a ref too: committing must happen outside a state updater (StrictMode runs
  // updaters twice, which would push two undo steps).
  const commit = (moved: boolean) => {
    const draft = draftRef.current;
    draftRef.current = null;
    setDrag({ draft: null, guide: null, marquee: null });
    if (moved && draft) tryEdit(() => draft);
  };

  const startScrub = (e: RPointerEvent) => {
    const ui = useEditorUi.getState();
    ui.setPlaying(false);
    const set = (clientX: number) => ui.setPlayhead(frameSnap(toFlicks(laneX(clientX))));
    set(e.clientX);
    beginDrag(
      e,
      (_dx, _dy, ev) => set(ev.clientX),
      () => undefined,
    );
  };

  const startLane = (e: RPointerEvent) => {
    if (e.button !== 0) return;
    const ui = useEditorUi.getState();
    ui.setFocusArea('timeline');
    const rect = scrollRef.current!.getBoundingClientRect();
    const toContent = (cx: number, cy: number) => ({ x: laneX(cx), y: cy - rect.top + scrollRef.current!.scrollTop - RULER_H });
    const a = toContent(e.clientX, e.clientY);
    beginDrag(
      e,
      (_dx, _dy, ev) => {
        const b = toContent(ev.clientX, ev.clientY);
        setDrag({ draft: null, guide: null, marquee: { x0: a.x, y0: a.y, x1: b.x, y1: b.y } });
        // Select clips intersecting the rectangle.
        const t0 = toFlicks(Math.min(a.x, b.x));
        const t1 = toFlicks(Math.max(a.x, b.x));
        const r0 = Math.floor(Math.min(a.y, b.y) / ROW_H);
        const r1 = Math.floor(Math.max(a.y, b.y) / ROW_H);
        const ids: string[] = [];
        project.tracks.forEach((t, row) => {
          if (row < r0 || row > r1) return;
          for (const id of t.clipIds) {
            const c = project.clips[id]!;
            if (c.start < t1 && clipEnd(c) > t0) ids.push(id);
          }
        });
        ui.selectClips(ids);
      },
      (moved, ev) => {
        setDrag({ draft: null, guide: null, marquee: null });
        if (!moved) {
          ui.selectClips([]);
          ui.setPlaying(false);
          ui.setPlayhead(frameSnap(toFlicks(laneX(ev.clientX))));
        }
      },
    );
  };

  const onDrop = (e: React.DragEvent, track: Track) => {
    const assetId = e.dataTransfer.getData(ASSET_DRAG_TYPE);
    if (!assetId) return;
    e.preventDefault();
    const asset = project.assets.find((a) => a.id === assetId);
    if (!asset) return;
    let t = toFlicks(laneX(e.clientX));
    if (useEditorUi.getState().snapping) t += snapDelta([t], snapTargets(project, new Set(), useEditorUi.getState().playhead), snapThreshold).delta;
    const target = trackAccepts(track.kind, asset.kind) ? track : project.tracks.find((x) => !x.locked && trackAccepts(x.kind, asset.kind));
    if (!target) return useEditorUi.getState().notify(`No track accepts ${asset.kind} media. Add a track first.`);
    let id = '';
    if (
      tryEdit((p) => {
        const [q, c] = insertClip(p, { trackId: target.id, assetId, start: t });
        id = c;
        return q;
      })
    )
      useEditorUi.getState().selectClips([id]);
  };

  const step = rulerStep(px);
  // Clips intersecting the viewport (plus a margin) are rendered; the rest are culled.
  const visFrom = secondsToFlicks(Math.max(0, (view.left - HEADER_W - 400) / px));
  const visTo = secondsToFlicks((view.left + view.width + 400) / px);

  return (
    <div className="flex min-h-0 flex-1 flex-col" onFocusCapture={() => useEditorUi.getState().setFocusArea('timeline')}>
      <Toolbar project={project} />
      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-auto" tabIndex={-1} aria-label="Timeline tracks">
        <div style={{ width: HEADER_W + contentWidth }} className="relative">
          {/* Ruler */}
          <div className="sticky top-0 z-20 flex border-b border-line bg-surface" style={{ height: RULER_H }}>
            <div style={{ width: HEADER_W }} className="sticky left-0 z-10 flex shrink-0 items-center border-r border-line bg-surface px-2 font-mono text-2xs text-muted tabular">
              <PlayheadTimecode project={project} />
            </div>
            <div className="relative flex-1 cursor-pointer" onPointerDown={startScrub} role="slider" aria-label="Playhead" aria-valuemin={0} aria-valuemax={durationSec} tabIndex={0}>
              {shown.inPoint != null && (
                <div
                  className="absolute inset-y-0 bg-accent/20"
                  style={{ left: flicksToSeconds(shown.inPoint) * px, width: ((shown.outPoint != null ? flicksToSeconds(shown.outPoint) : durationSec) - flicksToSeconds(shown.inPoint)) * px }}
                />
              )}
              {Array.from({ length: Math.ceil(contentWidth / px / step) + 1 }, (_, i) => i * step).map((s) => (
                <div key={s} className="pointer-events-none absolute top-0 h-full border-l border-line-strong/60 pl-1 font-mono text-2xs leading-6 text-faint tabular" style={{ left: s * px }}>
                  {formatTimecode(Math.round(s * FLICKS_PER_SECOND), project.settings.frameRate).replace(/^00:/, '')}
                </div>
              ))}
              {shown.markers.map((m) => (
                <MarkerFlag key={m.id} project={project} marker={m} px={px} />
              ))}
            </div>
          </div>

          {shown.tracks.map((t) => (
            <TrackRow key={t.id} track={t} width={contentWidth}>
              <div
                className={cn('relative h-full', (t.hidden || t.muted) && 'opacity-50')}
                style={{ width: contentWidth }}
                onPointerDown={startLane}
                onDragOver={(e) => {
                  if (e.dataTransfer.types.includes(ASSET_DRAG_TYPE)) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'copy';
                  }
                }}
                onDrop={(e) => onDrop(e, t)}
              >
                {t.clipIds
                  .filter((id) => {
                    const c = shown.clips[id]!;
                    return c.start < visTo && c.start + c.duration > visFrom;
                  })
                  .map((id) => (
                  <ClipBlock
                    key={id}
                    clip={shown.clips[id]!}
                    kind={t.kind}
                    px={px}
                    project={shown}
                    onBody={startMove}
                    onEdge={startTrim}
                    onMenu={(ev) => {
                      ev.preventDefault();
                      if (!useEditorUi.getState().selectedClipIds.includes(id)) useEditorUi.getState().selectClips([id]);
                      setMenu({ x: ev.clientX, y: ev.clientY, clipId: id });
                    }}
                  />
                ))}
                {Object.values(shown.transitions)
                  .filter((tr) => shown.clips[tr.toClipId]?.trackId === t.id)
                  .map((tr) => (
                    <TransitionBadge key={tr.id} id={tr.id} cut={shown.clips[tr.toClipId]!.start} duration={tr.duration} px={px} label={tr.type} />
                  ))}
              </div>
            </TrackRow>
          ))}

          {/* Overlays */}
          <PlayheadLine px={px} />
          {drag.guide != null && <div className="pointer-events-none absolute bottom-0 top-0 z-10 w-px bg-warn" style={{ left: HEADER_W + flicksToSeconds(drag.guide) * px }} aria-hidden />}
          {drag.marquee && (
            <div
              className="pointer-events-none absolute z-10 border border-accent bg-accent/10"
              style={{
                left: HEADER_W + Math.min(drag.marquee.x0, drag.marquee.x1),
                top: RULER_H + Math.min(drag.marquee.y0, drag.marquee.y1),
                width: Math.abs(drag.marquee.x1 - drag.marquee.x0),
                height: Math.abs(drag.marquee.y1 - drag.marquee.y0),
              }}
            />
          )}
        </div>
        {!snapping && <span className="sr-only">Snapping off</span>}
      </div>
      {menu && <ClipMenu menu={menu} project={project} onClose={() => setMenu(null)} />}
    </div>
  );
}

function Toolbar({ project }: { project: Project }) {
  const px = useEditorUi((s) => s.pxPerSecond);
  const setZoom = useEditorUi((s) => s.setZoom);
  const snapping = useEditorUi((s) => s.snapping);
  const hasSel = useEditorUi((s) => s.selectedClipIds.length > 0);
  return (
    <div className="flex h-8 shrink-0 items-center gap-1 border-b border-line px-2">
      <h2 className="mr-1 text-xs font-semibold">Timeline</h2>
      <AddTrackMenu />
      <Button size="sm" variant="ghost" onClick={splitAtPlayhead} title="Split at playhead (S)">
        Split
      </Button>
      <Button size="sm" variant="ghost" onClick={() => deleteSelection(true)} disabled={!hasSel} title="Ripple delete (Shift+Delete)">
        Ripple delete
      </Button>
      <Button size="sm" variant="ghost" onClick={addTitle} title="Add a title at the playhead (T)">
        + Title
      </Button>
      <Button size="sm" variant="ghost" onClick={addMarkerAtPlayhead} title="Add marker (M)">
        + Marker
      </Button>
      <Button size="sm" variant={snapping ? 'secondary' : 'ghost'} aria-pressed={snapping} onClick={() => useEditorUi.getState().toggleSnapping()} title="Snapping (N). Hold Shift while dragging to invert.">
        Snap
      </Button>
      <span className="ml-2 hidden text-2xs text-faint xl:inline">
        Drag to move · edges trim · Ctrl+edge rolls · Alt+drag slips · {project.settings.width}×{project.settings.height}
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
        <div role="menu" className="absolute left-0 top-full z-30 mt-1 w-36 rounded-md border border-line-strong bg-surface-2 py-1 shadow-lg" onMouseLeave={() => setOpen(false)}>
          {(['video', 'audio', 'text', 'overlay'] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="menuitem"
              className="block w-full px-3 py-1.5 text-left text-xs capitalize hover:bg-surface-3"
              onClick={() => {
                setOpen(false);
                tryEdit((p) => addTrack(p, k, k === 'audio' ? p.tracks.length : 0));
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

function TrackRow({ track, width, children }: { track: Track; width: number; children: ReactNode }) {
  const [renaming, setRenaming] = useState(false);
  const isAudio = track.kind === 'audio';
  return (
    <div className="flex border-b border-line" style={{ height: ROW_H, width: HEADER_W + width }} data-track={track.name}>
      <div style={{ width: HEADER_W }} className={cn('group sticky left-0 z-[15] flex shrink-0 items-center gap-0.5 border-r border-line bg-surface-2 pl-0 pr-1', track.locked && 'bg-surface-3')}>
        <span className={cn('mr-1.5 h-full w-1', TRACK_COLOR[track.kind])} />
        {renaming ? (
          <input
            autoFocus
            defaultValue={track.name}
            aria-label="Track name"
            className="w-14 rounded-sm border border-accent bg-surface px-1 text-xs"
            onBlur={(e) => {
              if (e.target.value.trim() && e.target.value !== track.name) tryEdit((p) => renameTrack(p, track.id, e.target.value));
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
        <IconButton label={track.locked ? 'Unlock track' : 'Lock track'} active={track.locked} onClick={() => tryEdit((p) => setTrackFlags(p, track.id, { locked: !track.locked }))}>
          {track.locked ? <IconLock size={14} /> : <IconUnlock size={14} />}
        </IconButton>
        {isAudio ? (
          <IconButton label={track.muted ? 'Unmute track' : 'Mute track'} active={track.muted} onClick={() => tryEdit((p) => setTrackFlags(p, track.id, { muted: !track.muted }))}>
            {track.muted ? <IconVolumeOff size={14} /> : <IconVolume size={14} />}
          </IconButton>
        ) : (
          <IconButton label={track.hidden ? 'Show track' : 'Hide track'} active={track.hidden} onClick={() => tryEdit((p) => setTrackFlags(p, track.id, { hidden: !track.hidden }))}>
            {track.hidden ? <IconEyeOff size={14} /> : <IconEye size={14} />}
          </IconButton>
        )}
        <IconButton
          label="Delete track"
          className="opacity-0 group-hover:opacity-100 focus:opacity-100"
          onClick={() => {
            if (track.clipIds.length && !window.confirm(`Delete track ${track.name} and its ${track.clipIds.length} clip(s)? You can undo this.`)) return;
            tryEdit((p) => removeTrack(p, track.id));
          }}
        >
          <IconTrash size={14} />
        </IconButton>
      </div>
      {children}
    </div>
  );
}

function ClipBlock({
  clip,
  kind,
  px,
  project,
  onBody,
  onEdge,
  onMenu,
}: {
  clip: Clip;
  kind: TrackKind;
  px: number;
  project: Project;
  onBody(e: RPointerEvent, c: Clip): void;
  onEdge(e: RPointerEvent, c: Clip, side: 'start' | 'end'): void;
  onMenu(e: React.MouseEvent): void;
}) {
  const selected = useEditorUi((s) => s.selectedClipIds.includes(clip.id));
  const poster = useLibraryStore((s) => (clip.assetId ? s.thumbs[clip.assetId]?.[0] : undefined));
  const strip = useLibraryStore((s) => (clip.assetId ? s.strips[clip.assetId] : undefined));
  const wave = useLibraryStore((s) => (clip.assetId ? s.waveforms[clip.assetId] : undefined));
  const online = useLibraryStore((s) => (clip.assetId ? !!s.files[clip.assetId] : true));
  const asset = clip.assetId ? project.assets.find((a) => a.id === clip.assetId) : undefined;
  const left = flicksToSeconds(clip.start) * px;
  const w = Math.max(2, flicksToSeconds(clip.duration) * px);
  const h = ROW_H - 8;
  const sourceIn = flicksToSeconds(clip.sourceIn);
  const span = flicksToSeconds(clip.duration) * clip.speed;
  const isText = !!clip.text || asset?.kind === 'subtitle';
  const badges = [clip.speed !== 1 && `${Number(clip.speed.toFixed(2))}×`, clip.reversed && 'rev', clip.effects.some((e) => e.enabled && e.type !== 'mute-audio' && e.type !== 'preserve-pitch') && 'fx', Object.keys(clip.keyframes).length > 0 && '◆'].filter(Boolean);
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${clip.name}, ${formatTimecode(clip.start, project.settings.frameRate)}`}
      className={cn(
        'absolute bottom-1 top-1 cursor-grab touch-none select-none overflow-hidden rounded-sm border text-left active:cursor-grabbing',
        TRACK_COLOR[kind],
        selected ? 'border-white ring-1 ring-white' : 'border-black/30',
        !online && 'opacity-60',
      )}
      style={{ left, width: w }}
      title={`${clip.name} · ${formatTimecode(clip.duration, project.settings.frameRate)}${online ? '' : ' · media offline'}`}
      data-clip={clip.id}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        onBody(e, clip);
      }}
      onContextMenu={onMenu}
    >
      {kind === 'audio' || asset?.kind === 'audio' ? (
        wave && <Waveform data={wave} width={w} height={h} sourceIn={sourceIn} span={span} gain={clip.audio.gain} />
      ) : isText ? null : strip ? (
        <FilmstripTiles strip={strip} width={w} height={h} sourceIn={sourceIn} span={span} />
      ) : (
        poster && <img src={poster} alt="" className="absolute inset-y-0 left-0 h-full w-auto opacity-60" draggable={false} />
      )}
      <span className="pointer-events-none relative flex gap-1 truncate px-1.5 pt-0.5 text-2xs font-medium text-white drop-shadow">
        <span className="truncate">{isText && clip.text ? `T · ${clip.text.text}` : clip.name}</span>
        {badges.map((b) => (
          <span key={String(b)} className="rounded-sm bg-black/40 px-1">
            {b}
          </span>
        ))}
      </span>
      {w > 14 && (
        <>
          <span
            className="absolute inset-y-0 left-0 z-[1] cursor-ew-resize hover:bg-white/30"
            style={{ width: EDGE_PX }}
            onPointerDown={(e) => {
              if (e.button === 0) onEdge(e, clip, 'start');
            }}
            aria-hidden
          />
          <span
            className="absolute inset-y-0 right-0 z-[1] cursor-ew-resize hover:bg-white/30"
            style={{ width: EDGE_PX }}
            onPointerDown={(e) => {
              if (e.button === 0) onEdge(e, clip, 'end');
            }}
            aria-hidden
          />
        </>
      )}
    </div>
  );
}

function TransitionBadge({ id, cut, duration, px, label }: { id: string; cut: Flicks; duration: Flicks; px: number; label: string }) {
  const selected = useEditorUi((s) => s.selectedTransitionId === id);
  const w = Math.max(10, flicksToSeconds(duration) * px);
  return (
    <button
      type="button"
      className={cn('absolute top-1/2 z-[2] h-4 -translate-y-1/2 rounded-full border text-[9px] leading-none text-white', selected ? 'border-white bg-accent' : 'border-black/40 bg-black/60')}
      style={{ left: flicksToSeconds(cut) * px - w / 2, width: w }}
      title={`Transition: ${label}`}
      aria-label={`Transition ${label}`}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={() => useEditorUi.getState().selectTransition(id)}
    >
      ⧓
    </button>
  );
}

function MarkerFlag({ project, marker, px }: { project: Project; marker: Project['markers'][number]; px: number }) {
  const selected = useEditorUi((s) => s.selectedMarkerId === marker.id);
  return (
    <button
      type="button"
      className={cn('absolute top-0 z-[3] h-full w-2 -translate-x-1/2', selected && 'outline outline-1 outline-white')}
      style={{ left: flicksToSeconds(marker.t) * px, background: marker.color }}
      title={marker.label}
      aria-label={`Marker ${marker.label}`}
      onPointerDown={(e) => {
        e.stopPropagation();
        const ui = useEditorUi.getState();
        ui.selectMarker(marker.id);
        ui.setPlayhead(marker.t);
        const t0 = marker.t;
        const start = useProjectStore.getState().history!.present;
        beginDrag(
          e,
          (dx) => {
            const t = t0 + secondsToFlicks(dx / px);
            useProjectStore.getState().apply((p) => updateMarker(p, marker.id, { t }), { undoable: false });
          },
          (moved) => {
            if (!moved) return;
            // Collapse the live drag into one undo step: restore the start state, then apply the result.
            const store = useProjectStore.getState();
            const final = store.history!.present;
            store.apply(() => start, { undoable: false });
            store.apply(() => final);
          },
        );
      }}
      data-project={project.id}
    />
  );
}

function ClipMenu({ menu, project, onClose }: { menu: MenuState; project: Project; onClose(): void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', key);
    ref.current?.querySelector('button')?.focus();
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', key);
    };
  }, [onClose]);
  const clip = project.clips[menu.clipId];
  const asset = clip?.assetId ? project.assets.find((a) => a.id === clip.assetId) : undefined;
  const items: [string, string, () => void, boolean?][] = [
    ['Split at playhead', 'S', splitAtPlayhead],
    ['Copy', 'Ctrl+C', () => copySelection()],
    ['Cut', 'Ctrl+X', () => copySelection(true)],
    ['Paste at playhead', 'Ctrl+V', paste, !useEditorUi.getState().clipboard],
    ['Duplicate', 'Ctrl+D', duplicateSelection],
    ['Add crossfade after', '', () => addTransitionAfter(menu.clipId, 'crossfade', 1)],
    ['Detach audio', '', detachSelectedAudio, !(asset?.kind === 'video' && asset.info?.audio.length)],
    ['Delete', 'Del', () => deleteSelection(false)],
    ['Ripple delete', 'Shift+Del', () => deleteSelection(true)],
  ];
  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Clip actions"
      className="fixed z-50 w-56 rounded-md border border-line-strong bg-surface-2 py-1 text-xs shadow-xl"
      style={{ left: Math.min(menu.x, window.innerWidth - 240), top: Math.min(menu.y, window.innerHeight - 300) }}
    >
      {items.map(([label, key, run, disabled]) => (
        <button
          key={label}
          type="button"
          role="menuitem"
          disabled={disabled}
          className="flex w-full items-center px-3 py-1.5 text-left hover:bg-surface-3 disabled:opacity-40"
          onClick={() => {
            onClose();
            run();
          }}
        >
          {label}
          {key && <span className="ml-auto text-faint">{key}</span>}
        </button>
      ))}
    </div>
  );
}

export { HEADER_W, ROW_H };
export const useTimelineDuration = (p: Project | null) => useMemo(() => (p ? projectDuration(p) : 0), [p]);

function PlayheadLine({ px }: { px: number }) {
  const playhead = useEditorUi((s) => s.playhead);
  return (
    <div className="pointer-events-none absolute bottom-0 z-10 w-px bg-danger" style={{ top: 0, left: HEADER_W + flicksToSeconds(playhead) * px }} aria-hidden>
      <div className="absolute -left-[5px] top-0 h-0 w-0 border-x-[5px] border-t-[7px] border-x-transparent border-t-danger" />
    </div>
  );
}

function PlayheadTimecode({ project }: { project: Project }) {
  const playhead = useEditorUi((s) => s.playhead);
  return <>{formatTimecode(playhead, project.settings.frameRate)}</>;
}
