/**
 * Storage for things tied to source media: fingerprints, persisted file handles, thumbnails.
 */
import { idbGet, idbPut } from './idb';

const SAMPLE = 64 * 1024;

async function hashSample(file: File, prefix: string): Promise<string> {
  const head = new Uint8Array(await file.slice(0, SAMPLE).arrayBuffer());
  const tail = file.size > SAMPLE ? new Uint8Array(await file.slice(Math.max(SAMPLE, file.size - SAMPLE)).arrayBuffer()) : new Uint8Array(0);
  const meta = new TextEncoder().encode(prefix);
  const buf = new Uint8Array(meta.length + head.length + tail.length);
  buf.set(meta, 0);
  buf.set(head, meta.length);
  buf.set(tail, meta.length + head.length);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest).slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Stable identity for a local file without reading all of it:
 * SHA-256(size | lastModified | first 64 KiB | last 64 KiB).
 * Used to key caches and handles. Collisions require identical size, mtime, head and tail.
 */
export function fingerprintFile(file: File): Promise<string> {
  return hashSample(file, `${file.size}|${file.lastModified}|`);
}

/** Content-only fingerprint (ignores lastModified) so a copied file can still be relinked. */
export function contentFingerprint(file: File): Promise<string> {
  return hashSample(file, `${file.size}|`);
}

// ── File handles (Chromium File System Access) ────────────────────────────

type PermissionAware = FileSystemFileHandle & {
  queryPermission?: (d: { mode: 'read' }) => Promise<PermissionState>;
  requestPermission?: (d: { mode: 'read' }) => Promise<PermissionState>;
};

export async function saveHandle(fingerprint: string, handle: FileSystemFileHandle): Promise<void> {
  try {
    await idbPut('handles', handle, fingerprint);
  } catch {
    // Some browsers cannot structured-clone handles into IndexedDB; relinking still works.
  }
}

export async function getHandle(fingerprint: string): Promise<FileSystemFileHandle | undefined> {
  try {
    return await idbGet<FileSystemFileHandle>('handles', fingerprint);
  } catch {
    return undefined;
  }
}

/**
 * Try to reopen a file from a stored handle.
 * `interactive` must be true only inside a user gesture (it may show a permission prompt).
 */
export async function fileFromHandle(handle: FileSystemFileHandle, interactive: boolean): Promise<File | null> {
  const h = handle as PermissionAware;
  try {
    let state: PermissionState = (await h.queryPermission?.({ mode: 'read' })) ?? 'granted';
    if (state !== 'granted' && interactive) state = (await h.requestPermission?.({ mode: 'read' })) ?? 'denied';
    if (state !== 'granted') return null;
    return await handle.getFile();
  } catch {
    return null;
  }
}

// ── Thumbnails ────────────────────────────────────────────────────────────

export interface StoredThumbs {
  blobs: Blob[];
  timestamps: number[];
  width: number;
}

export async function getThumbs(key: string): Promise<StoredThumbs | undefined> {
  try {
    return await idbGet<StoredThumbs>('thumbs', key);
  } catch {
    return undefined;
  }
}

export async function putThumbs(key: string, value: StoredThumbs): Promise<void> {
  try {
    await idbPut('thumbs', value, key);
  } catch {
    // Quota exceeded or private mode: thumbnails are a cache, so failing silently is correct.
  }
}

// ── Quota ────────────────────────────────────────────────────────────────

export async function storageEstimate(): Promise<{ usage: number; quota: number; persisted: boolean } | null> {
  if (!navigator.storage?.estimate) return null;
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  const persisted = (await navigator.storage.persisted?.()) ?? false;
  return { usage, quota, persisted };
}

export async function requestPersistence(): Promise<boolean> {
  try {
    if (await navigator.storage?.persisted?.()) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

// ── Waveforms ─────────────────────────────────────────────────────────────

export interface StoredWaveform {
  peaks: Uint8Array;
  peaksPerSecond: number;
  duration: number;
}

export async function getWaveform(key: string): Promise<StoredWaveform | undefined> {
  try {
    return await idbGet<StoredWaveform>('thumbs', key);
  } catch {
    return undefined;
  }
}

export async function putWaveform(key: string, value: StoredWaveform): Promise<void> {
  try {
    await idbPut('thumbs', value, key);
  } catch {
    /* cache only */
  }
}
