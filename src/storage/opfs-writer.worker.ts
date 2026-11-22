/**
 * Writes a Blob into OPFS with a synchronous access handle. Used where the page has no
 * `FileSystemFileHandle.createWritable()` (Safari before 26): sync access handles exist only in
 * workers, and Safari has had them since 15.2. Streams the blob, so it never holds a full copy.
 */
export type WriterIn = { folder: string; name: string; blob: Blob };
export type WriterOut = { ok: true } | { ok: false; name: string; message: string };

declare const self: {
  postMessage(message: WriterOut): void;
  onmessage: ((event: MessageEvent<WriterIn>) => void) | null;
};

type SyncHandle = { write(b: Uint8Array, o: { at: number }): number; truncate(n: number): void; flush(): void; close(): void };

self.onmessage = async (event: MessageEvent<WriterIn>) => {
  const { folder, name, blob } = event.data;
  let handle: SyncHandle | null = null;
  try {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle(folder, { create: true });
    const file = await dir.getFileHandle(name, { create: true });
    handle = await (file as unknown as { createSyncAccessHandle(): Promise<SyncHandle> }).createSyncAccessHandle();
    handle.truncate(0);
    let at = 0;
    const reader = blob.stream().getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      at += handle.write(value, { at });
    }
    handle.flush();
    handle.close();
    handle = null;
    self.postMessage({ ok: true });
  } catch (e) {
    try {
      handle?.close();
    } catch {
      /* already closed */
    }
    self.postMessage({ ok: false, name: e instanceof DOMException ? e.name : 'Error', message: e instanceof Error ? e.message : String(e) });
  }
};
