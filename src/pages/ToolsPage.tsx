import { useEffect, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { TOOL_GRID, ToolCard } from '@/components/tools/ToolCard';
import { IconSearch } from '@/components/ui/icons';
import { Kbd } from '@/components/ui/primitives';
import { CATEGORY_LABELS, TOOLS, searchTools, type ToolCategory } from '@/tools/registry';
import { cn } from '@/utils/id';
import { setPageMeta } from '@/utils/meta';
import { pageInfo } from '@/seo/site';

const CATEGORY_BLURB: Record<ToolCategory, string> = {
  compress: 'Make files smaller for sending, sharing and storage.',
  convert: 'Change format, codec, frame rate or resolution; pull out the audio.',
  edit: 'Cut, join, crop, resize, rotate, retime and steady your footage.',
  audio: 'Mute, extract, replace, mix — and remove silent gaps.',
  visual: 'Looks, text, watermarks, GIFs, frames and slideshows.',
  film: 'Finishing tools for filmmakers: clean dialogue, delivery loudness, scope, credits, freezes.',
  subtitles: 'Write, fix, attach or burn in subtitles.',
  utility: 'See exactly what is inside a file.',
};

export function ToolsPage() {
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const categoryParam = params.get('category');
  const category: ToolCategory | 'all' = categoryParam && categoryParam in CATEGORY_LABELS ? (categoryParam as ToolCategory) : 'all';
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => setPageMeta(pageInfo('/tools')!.title, pageInfo('/tools')!.description), []);
  // "/" focuses search, as on most tool directories.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
  };

  const list = useMemo(() => {
    let l = searchTools(query);
    if (category !== 'all') l = l.filter((t) => t.category === category);
    return l;
  }, [query, category]);
  const categories = Object.keys(CATEGORY_LABELS) as ToolCategory[];
  const counts = useMemo(() => Object.fromEntries(categories.map((c) => [c, TOOLS.filter((t) => t.category === c).length])) as Record<ToolCategory, number>, [categories]);
  const grouped = !query && category === 'all';

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="slate mb-3">Tools</p>
          <h1 className="text-3xl font-semibold sm:text-4xl">Every tool, one job each.</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            {TOOLS.length} free tools. Each does one job, runs entirely in your browser and gives you a checked file — no upload, no watermark, no sign-up.{' '}
            <Link to="/guide#tools" className="text-accent hover:underline">
              How each tool works →
            </Link>
          </p>
        </div>
        <label className="relative w-full sm:w-80">
          <span className="sr-only">Search tools</span>
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => update({ q: e.target.value || null })}
            placeholder="Search — try “compress”, “gif”, “vertical”"
            className="h-10 w-full rounded-md border border-line bg-surface pl-9 pr-10 text-sm placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
          />
          <span className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 sm:block">
            <Kbd>/</Kbd>
          </span>
        </label>
      </div>

      <div className="mt-5 flex flex-wrap gap-1.5" role="group" aria-label="Filter by category">
        {(['all', ...categories] as const).map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={category === c}
            onClick={() => update({ category: c === 'all' ? null : c })}
            className={cn(
              'inline-flex h-8 items-center gap-2 rounded-md border px-3 text-xs font-medium transition-colors',
              category === c ? 'border-accent bg-accent text-accent-fg' : 'border-line bg-surface text-muted hover:border-line-strong hover:text-fg',
            )}
          >
            {c === 'all' ? 'All' : CATEGORY_LABELS[c]}
            <span className={cn('font-mono tabular', category === c ? '' : 'text-faint')}>{c === 'all' ? TOOLS.length : counts[c]}</span>
          </button>
        ))}
      </div>

      {grouped ? (
        <div className="mt-10 space-y-12">
          {categories.map((c, ci) => {
            const tools = TOOLS.filter((t) => t.category === c);
            return (
              <section key={c} aria-labelledby={`cat-${c}`}>
                <div className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <span className="slate">{String(ci + 1).padStart(2, '0')}</span>
                  <h2 id={`cat-${c}`} className="text-xl font-semibold">
                    {CATEGORY_LABELS[c]}
                  </h2>
                  <p className="text-sm text-muted">{CATEGORY_BLURB[c]}</p>
                </div>
                <div className={TOOL_GRID}>
                  {tools.map((t) => (
                    <ToolCard key={t.slug} tool={t} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <>
          <p className="mt-6 text-xs text-muted" aria-live="polite">
            {list.length} tool{list.length === 1 ? '' : 's'}
            {query && ` matching “${query}”`}
            {category !== 'all' && ` in ${CATEGORY_LABELS[category]}`}
          </p>
          <div className={`mt-2 ${TOOL_GRID}`}>
            {list.map((t) => (
              <ToolCard key={t.slug} tool={t} />
            ))}
          </div>
          {list.length === 0 && (
            <div className="py-14 text-center">
              <p className="text-sm text-muted">No tools match “{query}”.</p>
              <button type="button" className="mt-2 text-sm font-medium text-accent hover:underline" onClick={() => update({ q: null, category: null })}>
                Clear search
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
