import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/primitives';
import { DB_NAME, resetDbForTests } from '@/storage/idb';

export default function PrivacyPage() {
  const [cleared, setCleared] = useState<string | null>(null);
  useEffect(() => {
    document.title = 'Privacy — Veyra';
  }, []);

  const clearAll = async () => {
    if (!window.confirm('Delete all projects, thumbnails and caches stored by this site in this browser? Your original media files on disk are not affected. This cannot be undone.')) return;
    try {
      resetDbForTests();
      await new Promise<void>((resolve, reject) => {
        const r = indexedDB.deleteDatabase(DB_NAME);
        r.onsuccess = () => resolve();
        r.onerror = () => reject(r.error);
        r.onblocked = () => reject(new Error('Close other tabs of this site and try again.'));
      });
      const root = await navigator.storage?.getDirectory?.();
      if (root) for await (const name of (root as unknown as { keys(): AsyncIterable<string> }).keys()) await root.removeEntry(name, { recursive: true });
      try {
        localStorage.clear();
      } catch {
        /* ignore */
      }
      setCleared('All local data for this site has been deleted.');
    } catch (e) {
      setCleared(`Could not clear everything: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <article className="mx-auto max-w-2xl space-y-5 px-4 py-10 text-[15px] leading-relaxed text-muted">
      <h1 className="text-2xl font-semibold tracking-tight text-fg">Privacy</h1>
      <p>
        The short version: <strong className="text-fg">your media never leaves your device.</strong> This isn’t a promise about what we do with
        uploads. There are no uploads.
      </p>
      <h2 className="pt-2 text-lg font-semibold text-fg">How processing works</h2>
      <p>
        When you choose a file, your browser gives this page permission to read that file and nothing else. Reading, decoding, editing and
        encoding all happen in background threads in your browser, using its built-in media APIs (WebCodecs) and the open-source Mediabunny
        library. The result is written on your device.
      </p>
      <h2 className="pt-2 text-lg font-semibold text-fg">What is stored, and where</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Project files (edit decisions such as clip positions, text and effects) are kept in this browser’s IndexedDB.</li>
        <li>Small thumbnails are cached in IndexedDB.</li>
        <li>In Chrome and Edge, a permission handle to files you opened lets the editor reopen them after a reload, but only when you allow it.</li>
        <li>Panel sizes and similar interface preferences are kept in localStorage.</li>
      </ul>
      <p>All of this belongs to this site’s storage in your browser. We cannot see it.</p>
      <h2 className="pt-2 text-lg font-semibold text-fg">What we don’t do</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>No analytics, tracking pixels, advertising scripts or third-party fonts.</li>
        <li>No accounts, so no personal data to collect.</li>
        <li>
          The production Content Security Policy sets <code className="font-mono text-sm text-fg">connect-src 'self'</code>, so the page cannot
          send data to any other server.
        </li>
      </ul>
      <h2 className="pt-2 text-lg font-semibold text-fg">Optional features in the future</h2>
      <p>
        Some planned features, such as local speech-to-text, need a large model file downloaded once. Before any download we will say what it is,
        how big it is and where it comes from, and ask first. Media will still never be sent anywhere.
      </p>
      <div className="rounded-lg border border-line bg-surface p-4">
        <h2 className="text-base font-semibold text-fg">Delete local data</h2>
        <p className="mt-1 text-sm">Removes every project, thumbnail and cache this site stored in this browser.</p>
        <Button variant="danger" className="mt-3" onClick={() => void clearAll()}>
          Delete all local data
        </Button>
        {cleared && <p className="mt-2 text-sm text-fg">{cleared}</p>}
      </div>
    </article>
  );
}
