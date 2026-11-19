import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ACCEPT_ATTRIBUTE } from '@/media-engine';
import type { ImportEntry } from '@/state/media-actions';
import { cn } from '@/utils/id';

type PickerWindow = Window & {
  showOpenFilePicker?: (o: { multiple?: boolean; excludeAcceptAllOption?: boolean }) => Promise<FileSystemFileHandle[]>;
};

/**
 * Open the native picker. Uses the File System Access API when present so we get handles
 * (which let us reopen media after a reload); falls back to a hidden <input type=file>.
 */
export async function pickFiles(input: HTMLInputElement | null, multiple = true): Promise<ImportEntry[] | null> {
  const w = window as PickerWindow;
  if (w.showOpenFilePicker) {
    try {
      const handles = await w.showOpenFilePicker({ multiple });
      return Promise.all(handles.map(async (handle) => ({ file: await handle.getFile(), handle })));
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return null;
      // SecurityError etc.: fall through to the input element.
    }
  }
  input?.click();
  return null; // the input's onChange delivers files
}

/** Extract files (and handles when supported) from a drop event. Must be called synchronously in the handler. */
export function entriesFromDrop(dt: DataTransfer): Promise<ImportEntry[]> {
  type HandleItem = DataTransferItem & { getAsFileSystemHandle?: () => Promise<FileSystemHandle | null> };
  const items = Array.from(dt.items).filter((i) => i.kind === 'file') as HandleItem[];
  // Handles must be requested synchronously during the event; files too.
  const pending = items.map((item) => ({ file: item.getAsFile(), handle: item.getAsFileSystemHandle?.() ?? Promise.resolve(null) }));
  return Promise.all(
    pending.map(async ({ file, handle }) => {
      let h: FileSystemHandle | null = null;
      try {
        h = await handle;
      } catch {
        h = null;
      }
      const fh = h && h.kind === 'file' ? (h as FileSystemFileHandle) : undefined;
      return file ? { file, handle: fh } : null;
    }),
  ).then((list) => list.filter((x): x is { file: File; handle: FileSystemFileHandle | undefined } => x !== null));
}

// ── Whole-page drop ───────────────────────────────────────────────────────
// A file dropped anywhere on the page (not just on a drop zone) goes to the most recently mounted
// FileDrop, instead of the browser navigating away to open the file. A full-page highlight shows
// while files are dragged over the window.

interface PageTarget {
  deliver(entries: ImportEntry[]): void;
  multiple: boolean;
}
const pageTargets: PageTarget[] = [];
let pageInstalled = false;
let pageDepth = 0;
let overlay: HTMLDivElement | null = null;

const hasFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');

function showOverlay(show: boolean) {
  if (show && !overlay) {
    overlay = document.createElement('div');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.className = 'pointer-events-none fixed inset-2 z-[90] flex items-center justify-center rounded-2xl border-4 border-dashed border-accent bg-accent/10 backdrop-blur-[1px]';
    const label = document.createElement('div');
    label.className = 'rounded-lg bg-accent px-5 py-3 text-base font-semibold text-accent-fg shadow-xl';
    label.textContent = 'Drop to add your files';
    overlay.appendChild(label);
    document.body.appendChild(overlay);
  } else if (!show && overlay) {
    overlay.remove();
    overlay = null;
  }
}

function installPageDrop() {
  if (pageInstalled || typeof window === 'undefined') return;
  pageInstalled = true;
  window.addEventListener('dragenter', (e) => {
    if (!hasFiles(e) || pageTargets.length === 0) return;
    pageDepth++;
    showOverlay(true);
  });
  window.addEventListener('dragleave', (e) => {
    if (!hasFiles(e)) return;
    pageDepth = Math.max(0, pageDepth - 1);
    if (pageDepth === 0) showOverlay(false);
  });
  window.addEventListener('dragover', (e) => {
    if (hasFiles(e) && pageTargets.length) e.preventDefault(); // allow dropping anywhere
  });
  window.addEventListener('drop', (e) => {
    pageDepth = 0;
    showOverlay(false);
    if (!hasFiles(e) || e.defaultPrevented) return; // a drop zone already handled it
    const target = pageTargets[pageTargets.length - 1];
    if (!target) return;
    e.preventDefault();
    void entriesFromDrop(e.dataTransfer!).then((entries) => {
      const list = target.multiple ? entries : entries.slice(0, 1);
      if (list.length) target.deliver(list);
    });
  });
}

interface FileDropProps {
  onFiles(entries: ImportEntry[]): void;
  multiple?: boolean;
  accept?: string;
  className?: string;
  children: (state: { dragging: boolean; open: () => void }) => ReactNode;
}

/** Drop zone + picker. Renders children with drag state and an `open` callback. */
export function FileDrop({ onFiles, multiple = true, accept = ACCEPT_ATTRIBUTE, className, children }: FileDropProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);

  // Register as the page-level drop target while mounted (latest mounted wins).
  const onFilesRef = useRef(onFiles);
  onFilesRef.current = onFiles;
  useEffect(() => {
    installPageDrop();
    const t: PageTarget = { deliver: (entries) => onFilesRef.current(entries), multiple };
    pageTargets.push(t);
    return () => {
      const i = pageTargets.indexOf(t);
      if (i >= 0) pageTargets.splice(i, 1);
    };
  }, [multiple]);

  const open = useCallback(async () => {
    const entries = await pickFiles(inputRef.current, multiple);
    if (entries && entries.length) onFiles(entries);
  }, [multiple, onFiles]);

  return (
    <div
      className={cn(className)}
      onDragEnter={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        depth.current++;
        setDragging(true);
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) e.preventDefault();
      }}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setDragging(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        depth.current = 0;
        setDragging(false);
        void entriesFromDrop(e.dataTransfer).then((entries) => {
          const list = multiple ? entries : entries.slice(0, 1);
          if (list.length) onFiles(list);
        });
      }}
    >
      <input
        ref={inputRef}
        type="file"
        hidden
        multiple={multiple}
        accept={accept}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length) onFiles(files.map((file) => ({ file })));
        }}
      />
      {children({ dragging, open: () => void open() })}
    </div>
  );
}
