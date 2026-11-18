/**
 * Runtime (non-persisted) state for media: which assets currently have a readable File,
 * their thumbnail object URLs, and in-flight import jobs.
 */
import { create } from 'zustand';

export type AssetStatus = 'online' | 'offline' | 'error';

export interface ImportTask {
  id: string;
  name: string;
  progress: number;
  error: string | null;
}

interface LibraryState {
  files: Record<string, File>;
  thumbs: Record<string, string[]>;
  errors: Record<string, string>;
  imports: ImportTask[];
  selectedAssetId: string | null;

  setFile(assetId: string, file: File): void;
  setThumbs(assetId: string, blobs: Blob[]): void;
  setError(assetId: string, message: string | null): void;
  forget(assetId: string): void;
  reset(): void;
  select(assetId: string | null): void;
  upsertImport(task: ImportTask): void;
  removeImport(id: string): void;
}

function revoke(urls: string[] | undefined): void {
  urls?.forEach((u) => URL.revokeObjectURL(u));
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  files: {},
  thumbs: {},
  errors: {},
  imports: [],
  selectedAssetId: null,

  setFile(assetId, file) {
    set((s) => ({ files: { ...s.files, [assetId]: file } }));
  },
  setThumbs(assetId, blobs) {
    revoke(get().thumbs[assetId]);
    set((s) => ({ thumbs: { ...s.thumbs, [assetId]: blobs.map((b) => URL.createObjectURL(b)) } }));
  },
  setError(assetId, message) {
    set((s) => {
      const errors = { ...s.errors };
      if (message) errors[assetId] = message;
      else delete errors[assetId];
      return { errors };
    });
  },
  forget(assetId) {
    revoke(get().thumbs[assetId]);
    set((s) => {
      const files = { ...s.files };
      const thumbs = { ...s.thumbs };
      const errors = { ...s.errors };
      delete files[assetId];
      delete thumbs[assetId];
      delete errors[assetId];
      return { files, thumbs, errors, selectedAssetId: s.selectedAssetId === assetId ? null : s.selectedAssetId };
    });
  },
  reset() {
    Object.values(get().thumbs).forEach(revoke);
    set({ files: {}, thumbs: {}, errors: {}, imports: [], selectedAssetId: null });
  },
  select(assetId) {
    set({ selectedAssetId: assetId });
  },
  upsertImport(task) {
    set((s) => {
      const i = s.imports.findIndex((t) => t.id === task.id);
      const imports = [...s.imports];
      if (i >= 0) imports[i] = task;
      else imports.push(task);
      return { imports };
    });
  },
  removeImport(id) {
    set((s) => ({ imports: s.imports.filter((t) => t.id !== id) }));
  },
}));

export function assetStatus(assetId: string, s: Pick<LibraryState, 'files' | 'errors'>): AssetStatus {
  if (s.errors[assetId]) return 'error';
  return s.files[assetId] ? 'online' : 'offline';
}
