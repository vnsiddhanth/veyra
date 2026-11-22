/**
 * Proxy media: small, frequently-keyframed copies of large videos used only for preview. They live
 * in OPFS under /proxies, keyed by the source fingerprint, so they survive reloads and are shared by
 * every project using the same file. Export always reads the original media.
 */
import type { WriterIn, WriterOut } from './opfs-writer.worker';

type Dir =FileSystemDirectoryHandle & { entries(): AsyncIterable<[string, FileSystemHandle]> };

async function dir(): Promise<Dir | null> {
  try {
    if (!navigator.storage?.getDirectory) return null;
    return (await (await navigator.storage.getDirectory()).getDirectoryHandle('proxies', { create: true })) as Dir;
  } catch {
    return null;
  }
}

/** No `createWritable()` on the page (Safari before 26): write with a sync access handle in a worker. */
function writeInWorker(folder: string, name: string, blob: Blob): Promise<void> {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('./opfs-writer.worker.ts', import.meta.url), { type: 'module', name: 'opfs-writer' });
    w.onmessage = (e: MessageEvent<WriterOut>) => {
      w.terminate();
      if (e.data.ok) resolve();
      else reject(new DOMException(e.data.message, e.data.name));
    };
    w.onerror = (e) => {
      e.preventDefault();
      w.terminate();
      reject(new Error(e.message || 'The storage worker stopped unexpectedly.'));
    };
    w.postMessage({ folder, name, blob } satisfies WriterIn);
  });
}

const nameFor =(fingerprint: string) => `${fingerprint.replace(/[^a-z0-9_-]/gi, '_').slice(0, 120)}.mp4`;

export async function getProxy(fingerprint: string): Promise<File | null> {
  const d = await dir();
  if (!d) return null;
  try {
    return await (await d.getFileHandle(nameFor(fingerprint))).getFile();
  } catch {
    return null;
  }
}

/**
 * Copy a finished proxy into the proxy store (streamed, no full in-memory copy). Proxies are an
 * optimisation: if storage is full the partial file is removed and null is returned, so preview
 * simply keeps using the original media.
 */
export async function saveProxy(fingerprint: string, file: Blob): Promise<File | null> {
  const d = await dir();
  if (!d) return null;
  try {
    const h = await d.getFileHandle(nameFor(fingerprint), { create: true });
    const writable = (h as unknown as { createWritable?: () => Promise<FileSystemWritableFileStream> }).createWritable;
    if (typeof writable === 'function') {
      const w = await writable.call(h);
      await file.stream().pipeTo(w as unknown as WritableStream<Uint8Array>);
    } else await writeInWorker('proxies', nameFor(fingerprint), file);
    return await h.getFile();
  } catch (e) {
    await d.removeEntry(nameFor(fingerprint)).catch(() => undefined);
    if (e instanceof DOMException && e.name === 'QuotaExceededError') return null;
    throw e;
  }
}

export async function deleteProxy(fingerprint: string): Promise<void> {
  const d = await dir();
  await d?.removeEntry(nameFor(fingerprint)).catch(() => undefined);
}

export async function listStoredFiles(folder: 'proxies' | 'outputs'): Promise<{ name: string; size: number; lastModified: number }[]> {
  try {
    if (!navigator.storage?.getDirectory) return [];
    const d = (await (await navigator.storage.getDirectory()).getDirectoryHandle(folder, { create: true })) as Dir;
    const out: { name: string; size: number; lastModified: number }[] = [];
    for await (const [name, h] of d.entries()) {
      if (h.kind !== 'file') continue;
      const f = await (h as FileSystemFileHandle).getFile();
      out.push({ name, size: f.size, lastModified: f.lastModified });
    }
    return out.sort((a, b) => b.size - a.size);
  } catch {
    return [];
  }
}

export async function clearFolder(folder: 'proxies' | 'outputs'): Promise<number> {
  const files = await listStoredFiles(folder);
  try {
    const d = await (await navigator.storage.getDirectory()).getDirectoryHandle(folder, { create: true });
    for (const f of files) await d.removeEntry(f.name).catch(() => undefined);
  } catch {
    return 0;
  }
  return files.length;
}
