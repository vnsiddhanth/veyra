import { useEffect, useMemo, useState } from 'react';
import { ToolCard } from '@/components/tools/ToolCard';
import { IconSearch } from '@/components/ui/icons';
import { CATEGORY_LABELS, TOOLS, searchTools, type ToolCategory } from '@/tools/registry';
import { cn } from '@/utils/id';
import { setPageMeta } from '@/utils/meta';

export function ToolsPage() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<ToolCategory | 'all'>('all');
  const [readyOnly, setReadyOnly] = useState(false);
  useEffect(() => {
    return setPageMeta('All video tools — Veyra', 'Compress, convert, trim, merge, resize, add text, make GIFs and more — free video tools that run privately in your browser.');
  }, []);
  const list = useMemo(() => {
    let l = searchTools(query);
    if (category !== 'all') l = l.filter((t) => t.category === category);
    if (readyOnly) l = l.filter((t) => t.status === 'available');
    return l;
  }, [query, category, readyOnly]);
  const categories = Object.keys(CATEGORY_LABELS) as ToolCategory[];
  const ready = TOOLS.filter((t) => t.status === 'available').length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">All tools</h1>
      <p className="mt-1 text-sm text-muted">
        {TOOLS.length} tools, {ready} ready today. Every tool runs locally in your browser. Tools still in development show the phase that delivers them.
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <label className="relative w-full sm:w-72">
          <span className="sr-only">Search tools</span>
          <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tools"
            className="h-9 w-full rounded-md border border-line bg-surface pl-8 pr-3 text-sm placeholder:text-faint focus:border-accent focus:outline-none"
          />
        </label>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Category">
          {(['all', ...categories] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              aria-pressed={category === c}
              className={cn(
                'h-8 rounded-md px-2.5 text-xs font-medium transition-colors',
                category === c ? 'bg-fg text-canvas' : 'text-muted hover:bg-surface-2 hover:text-fg',
              )}
            >
              {c === 'all' ? 'All' : CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
        <label className="ml-auto flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" checked={readyOnly} onChange={(e) => setReadyOnly(e.target.checked)} className="accent-[var(--c-accent)]" />
          Ready only
        </label>
      </div>
      <div className="mt-5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {list.map((t) => (
          <ToolCard key={t.slug} tool={t} />
        ))}
      </div>
      {list.length === 0 && <p className="py-12 text-center text-sm text-muted">No tools match.</p>}
    </div>
  );
}
