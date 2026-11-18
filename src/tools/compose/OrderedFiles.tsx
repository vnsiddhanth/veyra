/** The ordered media list for merge / slideshow / GIF: drag to reorder, hover to preview. */
import { useState } from 'react';
import { Lightbox, MediaThumb } from '@/components/sortable/MediaThumb';
import { SortableList } from '@/components/sortable/SortableList';
import { Button } from '@/components/ui/primitives';
import { formatDuration } from '@/utils/format';
import type { useProbedFiles } from './common';

type List = ReturnType<typeof useProbedFiles>;

export function OrderedFiles({ list, label, unit = 'item' }: { list: List; label: string; unit?: string }) {
  const [preview, setPreview] = useState<number | null>(null);
  if (list.items.length === 0) return null;
  const total = list.ready.reduce((s, x) => s + (x.info?.duration ?? 0), 0);
  const byName = (a: { file: File }, b: { file: File }) => a.file.name.localeCompare(b.file.name, undefined, { numeric: true, sensitivity: 'base' });
  return (
    <section className="space-y-2" aria-label={label}>
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="mr-1 text-muted">
          {list.items.length} {unit}
          {list.items.length === 1 ? '' : 's'}
          {total > 0 && ` · ${formatDuration(total, 1)} total`} · <span className="text-fg">drag to reorder</span>, hover a video to preview it ·{' '}
          <a href="/guide#reorder" target="_blank" rel="noopener" className="text-accent underline">
            How?
          </a>
        </span>
        <Button size="sm" variant="ghost" onClick={() => list.sortBy(byName)} title="Sort by file name (1, 2, 10 in natural order)">
          Sort A→Z
        </Button>
        <Button size="sm" variant="ghost" onClick={() => list.sortBy((a, b) => a.file.lastModified - b.file.lastModified)} title="Oldest file first">
          Sort by date
        </Button>
        <Button size="sm" variant="ghost" onClick={list.reverse}>
          Reverse
        </Button>
        <Button size="sm" variant="ghost" onClick={list.clear}>
          Remove all
        </Button>
      </div>
      <SortableList
        items={list.items}
        layout="grid"
        label={`${label} (reorderable)`}
        getKey={(x) => x.id}
        getLabel={(x) => x.file.name}
        onMove={list.moveTo}
        renderItem={(it, { index }) => (
          <div className="group rounded-md border border-line bg-surface p-1.5 text-xs hover:border-line-strong">
            <div className="relative">
              <MediaThumb url={it.url} kind={it.info?.kind ?? (it.file.type.startsWith('image/') ? 'image' : 'video')} duration={it.info?.duration} name={it.file.name} />
              <span className="absolute left-1 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-2xs font-bold text-accent-fg" aria-hidden>
                {index + 1}
              </span>
              <span className="absolute right-1 top-1 flex gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                <button type="button" className="h-6 w-6 rounded bg-black/70 text-white" aria-label={`Preview ${it.file.name}`} title="Preview (full size)" onClick={() => setPreview(list.items.indexOf(it))}>
                  ⤢
                </button>
                <button type="button" className="h-6 w-6 rounded bg-black/70 text-white" aria-label={`Remove ${it.file.name}`} title="Remove" onClick={() => list.remove(it.id)}>
                  ×
                </button>
              </span>
            </div>
            <p className="mt-1 truncate font-medium" title={it.file.name}>
              {it.file.name}
            </p>
            <p className={it.status === 'error' ? 'text-danger' : 'text-muted'}>
              {it.status === 'probing' ? 'Reading…' : it.status === 'error' ? it.error : it.info?.width ? `${it.info.width}×${it.info.height}` : ''}
            </p>
          </div>
        )}
      />
      {preview != null && (
        <Lightbox
          items={list.items.map((x) => ({ url: x.url, kind: x.info?.kind ?? 'video', name: x.file.name }))}
          index={preview}
          onIndex={setPreview}
          onClose={() => setPreview(null)}
        />
      )}
    </section>
  );
}
