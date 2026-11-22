/**
 * Scratch storage for processing outputs.
 *
 * Outputs are written to the Origin Private File System when the browser supports
 * writable OPFS streams, so a multi-gigabyte export never has to fit in memory. Otherwise
 * they fall back to an in-memory buffer. Files live in /outputs and are deleted when the
 * user dismisses a result, on cancel/failure, and by a sweep of files older than a day.
 */
const DIR = 'outputs';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

type OpfsDir = FileSystemDirectoryHandle & {
  entries(): AsyncIterable<[string, FileSystemHandle]>;
};

async function outputsDir(): Promise<OpfsDir | null> {
  try {
    if (!navigator.storage?.getDirectory) return null;
    const root = await navigator.storage.getDirectory();
    return (await root.getDirectoryHandle(DIR, { create: true })) as OpfsDir;
  } catch {
    return null;
  }
}

export interface ScratchFile {
  name: string;
  handle: FileSystemFileHandle;
  writable: FileSystemWritableFileStream;
}

/** Create a writable OPFS scratch file, or null when OPFS writable streams are unavailable. */
export async function createScratchFile(name: string): Promise<ScratchFile | null> {
  const dir = await outputsDir();
  if (!dir) return null;
  try {
    const handle = await dir.getFileHandle(name, { create: true });
    if (typeof (handle as { createWritable?: unknown }).createWritable === 'function') {
      const writable = await handle.createWritable();
      return { name, handle, writable };
    }
    // Safari before 26 has no createWritable(), but workers have sync access handles (Safari 15.2+).
    const sync = await syncWritable(handle);
    if (sync) return { name, handle, writable: sync };
    await dir.removeEntry(name).catch(() => undefined);
    return null;
  } catch {
    return null;
  }
}

type SyncHandle = { write(b: BufferSource, o: { at: number }): number; truncate(n: number): void; flush(): void; close(): void };
type WriteChunk = { type: 'write'; data: BufferSource; position?: number } | BufferSource;

/**
 * A WritableStream over a synchronous access handle, accepting the same chunks Mediabunny's
 * StreamTarget writes to a FileSystemWritableFileStream ({type: 'write', data, position}).
 */
async function syncWritable(handle: FileSystemFileHandle): Promise<FileSystemWritableFileStream | null> {
  const create = (handle as unknown as { createSyncAccessHandle?: () => Promise<SyncHandle> }).createSyncAccessHandle;
  if (typeof create !== 'function') return null;
  const h = await create.call(handle);
  h.truncate(0);
  let pos = 0;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    h.flush();
    h.close();
  };
  const stream = new WritableStream<WriteChunk>({
    write(chunk) {
      if (chunk && typeof chunk === 'object' && 'type' in chunk) {
        if (chunk.type !== 'write') throw new TypeError(`Unsupported write: ${String(chunk.type)}`);
        if (chunk.position != null) pos = chunk.position;
        pos += h.write(chunk.data, { at: pos });
      } else pos += h.write(chunk, { at: pos });
    },
    close,
    abort: close,
  });
  return stream as unknown as FileSystemWritableFileStream;
}

export async function deleteScratchFile(name: string): Promise<void> {
  const dir = await outputsDir();
  try {
    await dir?.removeEntry(name);
  } catch {
    /* already gone */
  }
}

/** Remove outputs older than a day (left behind by closed tabs or crashes). */
export async function sweepScratchFiles(): Promise<void> {
  const dir = await outputsDir();
  if (!dir) return;
  const now = Date.now();
  try {
    for await (const [name, h] of dir.entries()) {
      if (h.kind !== 'file') continue;
      try {
        const f = await (h as FileSystemFileHandle).getFile();
        if (now - f.lastModified > MAX_AGE_MS) await dir.removeEntry(name);
      } catch {
        /* locked by another tab: leave it */
      }
    }
  } catch {
    /* iteration unsupported */
  }
}

/** Is this File backed by our OPFS scratch area? (Name convention: outputs carry a job prefix.) */
export function isScratchName(name: string): boolean {
  return /^out_[a-z0-9_]+__/.test(name);
}
