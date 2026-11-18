import { create } from 'zustand';
import type { ClipboardData } from '@/timeline/model/edit';
import type { Flicks } from '@/utils/time';
import { createId } from '@/utils/id';

/** Transient editor UI state (selection, playhead, focus, toasts). Not persisted, not undoable. */
interface EditorUiState {
  selectedClipIds: string[];
  selectedTransitionId: string | null;
  selectedMarkerId: string | null;
  focusArea: 'library' | 'timeline' | 'other';
  toasts: Array<{ id: string; message: string }>;
  importRequest: number;
  /** Timeline zoom: pixels per second. */
  pxPerSecond: number;
  /** Program playhead (timeline time). */
  playhead: Flicks;
  playing: boolean;
  snapping: boolean;
  clipboard: ClipboardData | null;
  /** Which monitor the preview shows. */
  monitor: 'program' | 'source';
  /** Preview from proxies where available (export always uses originals). */
  useProxies: boolean;
  setUseProxies(v: boolean): void;
  shortcutsOpen: boolean;
  setShortcutsOpen(v: boolean): void;

  selectClips(ids: string[]): void;
  selectTransition(id: string | null): void;
  selectMarker(id: string | null): void;
  setFocusArea(a: EditorUiState['focusArea']): void;
  notify(message: string): void;
  dismiss(id: string): void;
  requestImport(): void;
  setZoom(pxPerSecond: number): void;
  setPlayhead(t: Flicks): void;
  setPlaying(p: boolean): void;
  toggleSnapping(): void;
  setClipboard(c: ClipboardData | null): void;
  setMonitor(m: EditorUiState['monitor']): void;
}

export const useEditorUi = create<EditorUiState>((set, get) => ({
  selectedClipIds: [],
  selectedTransitionId: null,
  selectedMarkerId: null,
  focusArea: 'other',
  toasts: [],
  importRequest: 0,
  pxPerSecond: 40,
  playhead: 0,
  playing: false,
  snapping: true,
  clipboard: null,
  monitor: 'program',
  useProxies: true,
  shortcutsOpen: false,
  setShortcutsOpen(shortcutsOpen) {
    set({ shortcutsOpen });
  },
  setUseProxies(useProxies) {
    set({ useProxies });
  },

  selectClips(ids) {
    set({ selectedClipIds: ids, selectedTransitionId: null, selectedMarkerId: null });
  },
  selectTransition(id) {
    set({ selectedTransitionId: id, selectedClipIds: [], selectedMarkerId: null });
  },
  selectMarker(id) {
    set({ selectedMarkerId: id, selectedTransitionId: null });
  },
  setFocusArea(focusArea) {
    if (get().focusArea !== focusArea) set({ focusArea });
  },
  notify(message) {
    const id = createId('t');
    set((s) => ({ toasts: [...s.toasts.slice(-2), { id, message }] }));
    setTimeout(() => get().dismiss(id), 5000);
  },
  dismiss(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
  requestImport() {
    set((s) => ({ importRequest: s.importRequest + 1 }));
  },
  setZoom(pxPerSecond) {
    set({ pxPerSecond: Math.min(800, Math.max(2, pxPerSecond)) });
  },
  setPlayhead(t) {
    set({ playhead: Math.max(0, Math.round(t)) });
  },
  setPlaying(playing) {
    if (get().playing !== playing) set({ playing });
  },
  toggleSnapping() {
    set((s) => ({ snapping: !s.snapping }));
  },
  setClipboard(clipboard) {
    set({ clipboard });
  },
  setMonitor(monitor) {
    set({ monitor });
  },
}));
