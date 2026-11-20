import { useEffect, useState } from 'react';
import { Splitter, usePanelSize } from '@/components/ui/Splitter';
import { useLibraryStore } from '@/state/library-store';
import { removeAsset } from '@/state/media-actions';
import { useProjectStore } from '@/state/project-store';
import { useEditorUi } from './editor-ui-store';
import { Inspector } from './inspector/Inspector';
import { MediaLibrary } from './media-library/MediaLibrary';
import { PreviewMonitor } from './preview/PreviewMonitor';
import { TimelinePanel } from './timeline/TimelinePanel';
import * as cmd from './timeline/commands';
import { TopBar } from './TopBar';

function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

/** Full-screen editing workspace: top bar, library | monitor | inspector, timeline. */
export function EditorShell() {
  const [libraryWidth, setLibraryWidth] = usePanelSize('library', 300, 220, 560);
  const [inspectorWidth, setInspectorWidth] = usePanelSize('inspector', 300, 240, 520);
  const [timelineHeight, setTimelineHeight] = usePanelSize('timeline', 280, 140, 640);
  const narrow = useNarrow();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      const store = useProjectStore.getState();
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        store.redo();
      } else if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void store.saveNow();
      } else if (mod && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        useEditorUi.getState().requestImport();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        const ui = useEditorUi.getState();
        if (ui.selectedClipIds.length || ui.selectedTransitionId || ui.selectedMarkerId) {
          e.preventDefault();
          cmd.deleteSelection(e.shiftKey);
        } else {
          const assetId = useLibraryStore.getState().selectedAssetId;
          if (assetId && ui.focusArea === 'library') {
            e.preventDefault();
            removeAsset(assetId);
          }
        }
      } else if (mod && e.key.toLowerCase() === 'c') {
        cmd.copySelection();
      } else if (mod && e.key.toLowerCase() === 'x') {
        cmd.copySelection(true);
      } else if (mod && e.key.toLowerCase() === 'v') {
        cmd.paste();
      } else if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        cmd.duplicateSelection();
      } else if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        cmd.selectAll();
      } else if (mod && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        document.querySelector<HTMLButtonElement>('header button[title^="Render the timeline"]')?.click();
      } else if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        cmd.splitAtPlayhead();
      } else if (e.key === '?') {
        e.preventDefault();
        useEditorUi.getState().setShortcutsOpen(true);
      } else if (mod || e.altKey) {
        return;
      } else if (e.key === ' ') {
        e.preventDefault();
        const ui = useEditorUi.getState();
        ui.setMonitor('program');
        ui.setPlaying(!ui.playing);
      } else if (e.key === 'k' || e.key === 'K') {
        useEditorUi.getState().setPlaying(false);
      } else if (e.key === 'l' || e.key === 'L') {
        useEditorUi.getState().setMonitor('program');
        useEditorUi.getState().setPlaying(true);
      } else if (e.key === 's' || e.key === 'S') {
        cmd.splitAtPlayhead();
      } else if (e.key === 'f' || e.key === 'F') {
        cmd.freezeFrameAtPlayhead();
      } else if (e.key === 'm' || e.key === 'M') {
        cmd.addMarkerAtPlayhead();
      } else if (e.key === 'i' || e.key === 'I') {
        cmd.setInPoint();
      } else if (e.key === 'o' || e.key === 'O') {
        cmd.setOutPoint();
      } else if (e.key === 'x' || e.key === 'X') {
        cmd.clearInOut();
      } else if (e.key === 't' || e.key === 'T') {
        cmd.addTitle();
      } else if (e.key === 'r' || e.key === 'R') {
        useEditorUi.getState().toggleRearrange();
        const ui = useEditorUi.getState();
        ui.notify(ui.rearrange ? 'Rearrange on: drag clips between others to reorder them.' : 'Rearrange off: clips move freely.');
      } else if (e.key === 'n' || e.key === 'N') {
        useEditorUi.getState().toggleSnapping();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        cmd.stepFrames((e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 10 : 1));
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        cmd.jumpToEdit(e.key === 'ArrowUp' ? -1 : 1);
      } else if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        cmd.goToEnd(e.key === 'End');
      } else if (e.key === '=' || e.key === '+' || e.key === '-') {
        const ui = useEditorUi.getState();
        ui.setZoom(ui.pxPerSecond * (e.key === '-' ? 1 / 1.4 : 1.4));
      } else if (e.key === 'Escape') {
        useEditorUi.getState().selectClips([]);
        useLibraryStore.getState().select(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (narrow) return <MobileEditor />;

  return (
    <div className="theme-dark flex h-full min-h-0 flex-col overflow-hidden bg-canvas text-fg">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <aside style={{ width: libraryWidth }} className="flex min-h-0 shrink-0 flex-col bg-surface" aria-label="Media library">
          <MediaLibrary />
        </aside>
        <Splitter orientation="vertical" label="Resize media library" size={libraryWidth} onResize={(s, d) => setLibraryWidth(s + d)} />
        <section className="flex min-w-0 flex-1 flex-col" aria-label="Preview">
          <PreviewMonitor />
        </section>
        <Splitter orientation="vertical" label="Resize inspector" size={inspectorWidth} direction={-1} onResize={(s, d) => setInspectorWidth(s + d)} />
        <aside style={{ width: inspectorWidth }} className="flex min-h-0 shrink-0 flex-col bg-surface" aria-label="Inspector">
          <Inspector />
        </aside>
      </div>
      <Splitter orientation="horizontal" label="Resize timeline" size={timelineHeight} direction={-1} onResize={(s, d) => setTimelineHeight(s + d)} />
      <section style={{ height: timelineHeight }} className="flex min-h-0 shrink-0 flex-col bg-surface" aria-label="Timeline">
        <TimelinePanel />
      </section>
      <Toasts />
    </div>
  );
}

function Toasts() {
  const toasts = useEditorUi((s) => s.toasts);
  const dismiss = useEditorUi((s) => s.dismiss);
  if (!toasts.length) return null;
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2" role="status" aria-live="polite">
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => dismiss(t.id)}
          className="pointer-events-auto max-w-md rounded-md border border-line-strong bg-surface-3 px-3 py-2 text-left text-sm text-fg shadow-lg"
        >
          {t.message}
        </button>
      ))}
    </div>
  );
}

/** True below 768 px wide: phones get a stacked, tabbed editor. */
function useNarrow(): boolean {
  const query = '(max-width: 767px)';
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
}

/**
 * Simplified phone layout: the monitor on top and one panel at a time below (media, timeline,
 * inspector). Every editing feature is the same component as on desktop; touch drags use pointer events.
 */
function MobileEditor() {
  const [tab, setTab] = useState<'media' | 'timeline' | 'inspector'>('timeline');
  return (
    <div className="theme-dark flex h-full min-h-0 flex-col overflow-hidden bg-canvas text-fg">
      <TopBar />
      <section className="flex h-[38vh] min-h-0 shrink-0 flex-col" aria-label="Preview">
        <PreviewMonitor />
      </section>
      <div role="tablist" aria-label="Editor panels" className="flex shrink-0 border-y border-line bg-surface">
        {(['media', 'timeline', 'inspector'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-xs font-semibold capitalize ${tab === t ? 'border-b-2 border-accent text-fg' : 'text-muted'}`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="flex min-h-0 flex-1 flex-col bg-surface">
        {tab === 'media' && (
          <aside className="flex min-h-0 flex-1 flex-col" aria-label="Media library">
            <MediaLibrary />
          </aside>
        )}
        {tab === 'timeline' && (
          <section className="flex min-h-0 flex-1 flex-col" aria-label="Timeline">
            <TimelinePanel />
          </section>
        )}
        {tab === 'inspector' && (
          <aside className="flex min-h-0 flex-1 flex-col" aria-label="Inspector">
            <Inspector />
          </aside>
        )}
      </div>
      <Toasts />
    </div>
  );
}
