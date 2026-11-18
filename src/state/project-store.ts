import { create } from 'zustand';
import type { Project } from '@/project/schema/types';
import { projectsRepo } from '@/storage/projects-repo';
import { createHistory, push, redo, replace, undo, type History } from './history';

export type SaveState = 'saved' | 'dirty' | 'saving' | 'error';

interface ProjectState {
  history: History<Project> | null;
  saveState: SaveState;
  saveError: string | null;
  lastSavedAt: number | null;

  open(project: Project): void;
  close(): Promise<void>;
  /** Apply an edit. `undoable: false` updates without an undo step (e.g. cached metadata). */
  apply(fn: (p: Project) => Project, options?: { undoable?: boolean }): void;
  undo(): void;
  redo(): void;
  saveNow(): Promise<void>;
}

const AUTOSAVE_DELAY_MS = 800;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let saveChain: Promise<void> = Promise.resolve();

export const useProjectStore = create<ProjectState>((set, get) => {
  const scheduleSave = () => {
    set({ saveState: 'dirty' });
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void get().saveNow(), AUTOSAVE_DELAY_MS);
  };

  return {
    history: null,
    saveState: 'saved',
    saveError: null,
    lastSavedAt: null,

    open(project) {
      if (saveTimer) clearTimeout(saveTimer);
      set({ history: createHistory(project), saveState: 'saved', saveError: null, lastSavedAt: project.updatedAt });
    },

    async close() {
      const closing = get().history;
      await get().saveNow();
      // Another project may have been opened while saving; only close the one we were asked to.
      if (get().history === closing) set({ history: null });
    },

    apply(fn, options) {
      const h = get().history;
      if (!h) return;
      const next = fn(h.present);
      if (next === h.present) return;
      const stamped = { ...next, updatedAt: Date.now() };
      set({ history: options?.undoable === false ? replace(h, stamped) : push(h, stamped) });
      scheduleSave();
    },

    undo() {
      const h = get().history;
      if (!h || h.past.length === 0) return;
      set({ history: undo(h) });
      scheduleSave();
    },

    redo() {
      const h = get().history;
      if (!h || h.future.length === 0) return;
      set({ history: redo(h) });
      scheduleSave();
    },

    saveNow() {
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      // Serialize saves so an older snapshot can never overwrite a newer one.
      saveChain = saveChain.then(async () => {
        const h = get().history;
        if (!h || get().saveState === 'saved') return;
        const snapshot = h.present;
        set({ saveState: 'saving' });
        try {
          await projectsRepo.save(snapshot);
          // Only mark saved if nothing changed while we were writing.
          const changed = get().history?.present !== snapshot;
          set({ saveState: changed ? 'dirty' : 'saved', saveError: null, lastSavedAt: Date.now() });
          if (changed) scheduleSave();
        } catch (e) {
          const msg = e instanceof DOMException && e.name === 'QuotaExceededError'
            ? 'Browser storage is full. Free space or export the project file.'
            : `Could not save: ${e instanceof Error ? e.message : String(e)}`;
          set({ saveState: 'error', saveError: msg });
        }
      });
      return saveChain;
    },
  };
});

export const selectProject = (s: ProjectState): Project | null => s.history?.present ?? null;

// Flush pending changes when the page is hidden or closed (best effort; IndexedDB writes
// started in pagehide usually complete).
if (typeof window !== 'undefined') {
  const flush = () => {
    if (useProjectStore.getState().saveState === 'dirty') void useProjectStore.getState().saveNow();
  };
  window.addEventListener('pagehide', flush);
  // Never silently discard changes: warn if a save has not completed.
  window.addEventListener('beforeunload', (e) => {
    const state = useProjectStore.getState().saveState;
    if (state === 'dirty' || state === 'saving' || state === 'error') {
      flush();
      e.preventDefault();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}
