import { create } from 'zustand';
import { createId } from '@/utils/id';

/** Transient editor UI state (selection, focus, toasts). Not persisted, not undoable. */
interface EditorUiState {
  selectedClipIds: string[];
  focusArea: 'library' | 'timeline' | 'other';
  toasts: Array<{ id: string; message: string }>;
  importRequest: number;
  /** Timeline zoom: pixels per second. */
  pxPerSecond: number;

  selectClips(ids: string[]): void;
  setFocusArea(a: EditorUiState['focusArea']): void;
  notify(message: string): void;
  dismiss(id: string): void;
  requestImport(): void;
  setZoom(pxPerSecond: number): void;
}

export const useEditorUi = create<EditorUiState>((set, get) => ({
  selectedClipIds: [],
  focusArea: 'other',
  toasts: [],
  importRequest: 0,
  pxPerSecond: 40,

  selectClips(ids) {
    set({ selectedClipIds: ids });
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
}));
