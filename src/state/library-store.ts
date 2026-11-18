/**
 * Runtime (non-persisted) state for media: which assets currently have a readable File,
 * their thumbnail object URLs, and in-flight import jobs.
 */
import { create } from 'zustand';
import type { WaveformData } from '@/media-engine';

/** Evenly spaced thumbnails across an asset's whole duration. */
export interface Filmstrip {
  urls: string[];
  /** Seconds covered (thumbnail i sits at the centre of segment i). */
  duration: number;
}

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
  strips: Record<string, Filmstrip>;
  waveforms: Record<string, WaveformData>;
  errors: Record<string, string>;
  imports: ImportTask[];
  selectedAssetId: string | null;
  /** Preview proxies by asset id, and progress (0..1) of proxies being built. */
  proxies: Record<string, File>;
  proxyProgress: Record<string, number>;

  setProxy(assetId: string, file: File | null): void;
  setProxyProgress(assetId: string, p: number | null): void;
  setFile(assetId: string, file: File): void;
  setThumbs(assetId: string, blobs: Blob[]): void;
  setStrip(assetId: string, blobs: Blob[], duration: number): void;
  setWaveform(assetId: string, data: WaveformData): void;
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
  strips: {},
  waveforms: {},
  errors: {},
  imports: [],
  selectedAssetId: null,
  proxies: {},
  proxyProgress: {},

  setProxy(assetId, file) {
    set((s) => {
      const proxies = { ...s.proxies };
      if (file) proxies[assetId] = file;
      else delete proxies[assetId];
      return { proxies };
    });
  },
  setProxyProgress(assetId, p) {
    set((s) => {
      const proxyProgress = { ...s.proxyProgress };
      if (p == null) delete proxyProgress[assetId];
      else proxyProgress[assetId] = p;
      return { proxyProgress };
    });
  },
  setFile(assetId, file) {
    set((s) => ({ files: { ...s.files, [assetId]: file } }));
  },
  setThumbs(assetId, blobs) {
    revoke(get().thumbs[assetId]);
    set((s) => ({ thumbs: { ...s.thumbs, [assetId]: blobs.map((b) => URL.createObjectURL(b)) } }));
  },
  setStrip(assetId, blobs, duration) {
    revoke(get().strips[assetId]?.urls);
    set((s) => ({ strips: { ...s.strips, [assetId]: { urls: blobs.map((b) => URL.createObjectURL(b)), duration } } }));
  },
  setWaveform(assetId, data) {
    set((s) => ({ waveforms: { ...s.waveforms, [assetId]: data } }));
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
    revoke(get().strips[assetId]?.urls);
    set((s) => {
      const files = { ...s.files };
      const thumbs = { ...s.thumbs };
      const strips = { ...s.strips };
      const waveforms = { ...s.waveforms };
      const errors = { ...s.errors };
      delete files[assetId];
      delete thumbs[assetId];
      delete strips[assetId];
      delete waveforms[assetId];
      delete errors[assetId];
      return { files, thumbs, strips, waveforms, errors, selectedAssetId: s.selectedAssetId === assetId ? null : s.selectedAssetId };
    });
  },
  reset() {
    Object.values(get().thumbs).forEach(revoke);
    Object.values(get().strips).forEach((s) => revoke(s.urls));
    set({ files: {}, thumbs: {}, strips: {}, waveforms: {}, errors: {}, imports: [], selectedAssetId: null, proxies: {}, proxyProgress: {} });
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
