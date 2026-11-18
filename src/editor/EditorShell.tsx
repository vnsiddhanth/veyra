import { useEffect } from 'react';
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
      } else if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        cmd.splitAtPlayhead();
      } else if (mod || e.altKey) {
        return;
      } else if (e.key === ' ') {
        e.preventDefault();
        const ui = useEditorUi.getState();
        ui.setMonitor('program');
        ui.setPlaying(!ui.playing);
      } else if (e.key === 's' || e.key === 'S') {
        cmd.splitAtPlayhead();
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
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
