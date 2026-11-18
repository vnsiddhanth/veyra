/**
 * Media import / relink orchestration. Connects the media engine, storage and stores.
 * No React here; UI components call these functions.
 */
import { mediaEngine, MediaError, classifyFile } from '@/media-engine';
import { parseSubtitles } from '@/media-engine/subtitles/parse';
import { settingsFromMedia } from '@/project/schema/factory';
import type { Asset, Project } from '@/project/schema/types';
import { fileFromHandle, fingerprintFile, getHandle, getThumbs, putThumbs, requestPersistence, saveHandle } from '@/storage/media-store';
import { createId } from '@/utils/id';
import { fpsToRational } from '@/utils/time';
import { useLibraryStore } from './library-store';
import { selectProject, useProjectStore } from './project-store';

export interface ImportEntry {
  file: File;
  handle?: FileSystemFileHandle;
}

const POSTER_WIDTH = 320;
const MAX_SUBTITLE_BYTES = 5 * 1024 * 1024;

function stripExtension(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(0, i) : name;
}

/** Import files into the open project. Returns per-file errors (also shown in the import list). */
export async function importFiles(entries: ImportEntry[]): Promise<Array<{ name: string; error: string }>> {
  const failures: Array<{ name: string; error: string }> = [];
  void requestPersistence();
  // Probe in parallel (the pool bounds concurrency); keep project updates ordered.
  await Promise.all(
    entries.map(async ({ file, handle }) => {
      const taskId = createId('imp');
      const lib = useLibraryStore.getState();
      lib.upsertImport({ id: taskId, name: file.name, progress: 0, error: null });
      try {
        const asset = await buildAsset(file, (p) => lib.upsertImport({ id: taskId, name: file.name, progress: p, error: null }));
        const project = selectProject(useProjectStore.getState());
        if (!project) throw new Error('No project is open.');
        const existing = project.assets.find((a) => a.fingerprint === asset.fingerprint);
        const assetId = existing?.id ?? asset.id;
        if (!existing) {
          useProjectStore.getState().apply((p) => addAssetToProject(p, asset));
        }
        useLibraryStore.getState().setFile(assetId, file);
        if (handle) void saveHandle(asset.fingerprint, handle);
        useLibraryStore.getState().removeImport(taskId);
        void ensurePoster(existing ?? asset, file);
      } catch (e) {
        const err = e instanceof MediaError ? e.message : e instanceof Error ? e.message : String(e);
        failures.push({ name: file.name, error: err });
        useLibraryStore.getState().upsertImport({ id: taskId, name: file.name, progress: 1, error: err });
      }
    }),
  );
  return failures;
}

/**
 * When the first video lands in a project with no clips, match the project format (size, frame rate) to it.
 * Images and audio never change the format; imports finish in any order, so this keys on "first video".
 */
export function addAssetToProject(p: Project, asset: Asset): Project {
  let settings = p.settings;
  const isFirstVideo = !p.assets.some((a) => a.kind === 'video') && Object.keys(p.clips).length === 0;
  if (isFirstVideo && asset.kind === 'video' && asset.info && asset.info.width > 0) {
    const fps = asset.info.video[0]?.frameRate?.bestGuess;
    settings = { ...settings, ...settingsFromMedia(asset.info.width, asset.info.height, fps ? fpsToRational(fps) : settings.frameRate) };
  }
  return { ...p, settings, assets: [...p.assets, asset] };
}

export async function buildAsset(file: File, onProgress: (p: number) => void): Promise<Asset> {
  const classification = await classifyFile(file);
  const fingerprint = await fingerprintFile(file);
  const base = {
    id: createId('ast'),
    name: stripExtension(file.name),
    fileName: file.name,
    size: file.size,
    lastModified: file.lastModified,
    fingerprint,
    mimeType: file.type,
    folderId: null,
    addedAt: Date.now(),
  };
  if (classification.kind === 'subtitle') {
    if (file.size > MAX_SUBTITLE_BYTES) throw new MediaError('not-media', 'Subtitle file is too large (over 5 MB).');
    const { cues, errors } = parseSubtitles(await file.text());
    if (cues.length === 0) throw new MediaError('corrupt', `No valid subtitle cues found.${errors[0] ? ` ${errors[0]}` : ''}`);
    return { ...base, kind: 'subtitle', info: null, subtitles: cues };
  }
  const job = mediaEngine.probe(file);
  job.onProgress(onProgress);
  const { info } = await job.result;
  return { ...base, kind: info.kind, mimeType: file.type || info.mimeType, info, subtitles: null };
}

/** Load a cached poster, or generate one if the source is available. */
export async function ensurePoster(asset: Asset, file: File | undefined): Promise<void> {
  const key = `${asset.fingerprint}:poster`;
  const cached = await getThumbs(key);
  if (cached && cached.blobs.length > 0) {
    useLibraryStore.getState().setThumbs(asset.id, cached.blobs);
    return;
  }
  if (!file) return;
  let blobs: Blob[] = [];
  let timestamps: number[] = [];
  try {
    if (asset.kind === 'video' && asset.info?.video[0]?.decodable) {
      const thumbs = await mediaEngine.thumbnails(file, { count: 1, width: POSTER_WIDTH, end: Math.min(asset.info.duration, 2) }).result;
      blobs = thumbs.map((t) => t.blob);
      timestamps = thumbs.map((t) => t.timestamp);
    } else if (asset.kind === 'image') {
      const b = await mediaEngine.imageThumbnail(file, POSTER_WIDTH).result;
      if (b) blobs = [b];
      timestamps = [0];
    }
  } catch {
    return; // Posters are cosmetic; the card shows a type icon instead.
  }
  if (blobs.length > 0) {
    useLibraryStore.getState().setThumbs(asset.id, blobs);
    void putThumbs(key, { blobs, timestamps, width: POSTER_WIDTH });
  }
}

/**
 * Try to restore file access for every offline asset from stored handles.
 * Pass interactive=true only from a click handler (may prompt for permission).
 * Returns the number of assets still offline.
 */
export async function reconnectMedia(project: Project, interactive: boolean): Promise<number> {
  const lib = useLibraryStore.getState();
  let offline = 0;
  for (const asset of project.assets) {
    if (asset.kind === 'subtitle' || lib.files[asset.id]) continue;
    const handle = await getHandle(asset.fingerprint);
    const file = handle ? await fileFromHandle(handle, interactive) : null;
    if (file && file.size === asset.size && file.lastModified === asset.lastModified) {
      useLibraryStore.getState().setFile(asset.id, file);
      void ensurePoster(asset, file);
    } else {
      offline++;
      void ensurePoster(asset, undefined);
    }
  }
  return offline;
}

/**
 * Relink an offline asset to a file the user picked. Exact fingerprint match is accepted silently.
 * Otherwise the file must be the same kind of media with the same duration (±0.1 s); the returned
 * warning tells the user it is not byte-identical.
 */
export async function relinkAsset(asset: Asset, file: File, handle?: FileSystemFileHandle): Promise<{ warning: string | null }> {
  const fp = await fingerprintFile(file);
  let warning: string | null = null;
  if (fp !== asset.fingerprint) {
    if (asset.kind === 'subtitle') throw new MediaError('not-media', 'Subtitle assets are stored in the project and do not need relinking.');
    const { info } = await mediaEngine.probe(file).result;
    if (info.kind !== asset.kind) throw new MediaError('not-media', `Expected a ${asset.kind} file, but this is ${info.kind}.`);
    const expected = asset.info?.duration ?? 0;
    if (asset.kind !== 'image' && Math.abs(info.duration - expected) > 0.1) {
      throw new MediaError('not-media', `Duration does not match (expected ${expected.toFixed(2)} s, got ${info.duration.toFixed(2)} s).`);
    }
    warning = 'This file is not byte-identical to the original, but its type and duration match.';
    useProjectStore.getState().apply(
      (p) => ({
        ...p,
        assets: p.assets.map((a) =>
          a.id === asset.id ? { ...a, fingerprint: fp, size: file.size, lastModified: file.lastModified, fileName: file.name, info } : a,
        ),
      }),
      { undoable: false },
    );
  }
  useLibraryStore.getState().setFile(asset.id, file);
  useLibraryStore.getState().setError(asset.id, null);
  if (handle) void saveHandle(fp, handle);
  void ensurePoster({ ...asset, fingerprint: fp }, file);
  return { warning };
}

export function removeAsset(assetId: string): void {
  useProjectStore.getState().apply((p) => {
    const clipIds = Object.values(p.clips).filter((c) => c.assetId === assetId).map((c) => c.id);
    const remove = new Set(clipIds);
    const clips = Object.fromEntries(Object.entries(p.clips).filter(([id]) => !remove.has(id)));
    return {
      ...p,
      assets: p.assets.filter((a) => a.id !== assetId),
      clips,
      tracks: p.tracks.map((t) => ({ ...t, clipIds: t.clipIds.filter((id) => !remove.has(id)) })),
      transitions: Object.fromEntries(Object.entries(p.transitions).filter(([, t]) => !remove.has(t.fromClipId) && !remove.has(t.toClipId))),
    };
  });
  // The File stays in the runtime library so undo can restore the asset as online.
  if (useLibraryStore.getState().selectedAssetId === assetId) useLibraryStore.getState().select(null);
}

export function renameAsset(assetId: string, name: string): void {
  const trimmed = name.trim().slice(0, 200);
  if (!trimmed) return;
  useProjectStore.getState().apply((p) => ({ ...p, assets: p.assets.map((a) => (a.id === assetId ? { ...a, name: trimmed } : a)) }));
}
