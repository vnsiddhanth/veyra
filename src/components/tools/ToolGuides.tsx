/** Every tool's how-to, grouped by category and searchable (used on /guide). */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CATEGORY_ICON } from '@/components/tools/ToolCard';
import { IconSearch } from '@/components/ui/icons';
import { TOOL_GUIDES } from '@/tools/guides';
import { CATEGORY_LABELS, TOOLS, type ToolCategory } from '@/tools/registry';

export function ToolGuides() {
  const [q, setQ] = useState('');
  const [openSlug, setOpenSlug] = useState<string | null>(null);

  // Deep links like /guide#tool-trim-video open and scroll to that tool.
  useEffect(() => {
    const sync = () => {
      const m = /^#tool-([a-z0-9-]+)$/.exec(window.location.hash);
      if (!m) return;
      setOpenSlug(m[1]!);
      requestAnimationFrame(() => document.getElementById(`tool-${m[1]}`)?.scrollIntoView({ block: 'start' }));
    };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return TOOLS.filter((t) => !term || `${t.title} ${t.summary} ${t.keywords.join(' ')} ${TOOL_GUIDES[t.slug]?.when ?? ''}`.toLowerCase().includes(term));
  }, [q]);
  const categories = (Object.keys(CATEGORY_LABELS) as ToolCategory[]).filter((c) => list.some((t) => t.category === c));

  return (
    <div className="space-y-6">
      <label className="relative block max-w-md">
        <span className="sr-only">Find a tool guide</span>
        <IconSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Find a tool — e.g. “vertical”, “gif”, “shaky”"
          className="h-10 w-full rounded-md border border-line bg-surface pl-9 pr-3 text-sm placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
        />
      </label>
      {categories.length === 0 && <p className="text-sm">No tools match “{q}”.</p>}
      {categories.map((c) => {
        const Icon = CATEGORY_ICON[c];
        return (
          <section key={c} aria-labelledby={`guide-cat-${c}`} className="space-y-2">
            <h3 id={`guide-cat-${c}`} className="flex items-center gap-2 font-semibold text-fg">
              <Icon size={16} className="text-accent" aria-hidden /> {CATEGORY_LABELS[c]}
            </h3>
            <div className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
              {list
                .filter((t) => t.category === c)
                .map((t) => {
                  const g = TOOL_GUIDES[t.slug]!;
                  return (
                    <details
                      key={t.slug}
                      id={`tool-${t.slug}`}
                      open={openSlug === t.slug || (!!q.trim() && list.length <= 3)}
                      className="group scroll-mt-24"
                      onToggle={(e) => {
                        if ((e.currentTarget as HTMLDetailsElement).open) setOpenSlug(t.slug);
                      }}
                    >
                      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 text-[15px] hover:bg-surface-2">
                        <span className="font-medium text-fg">{t.title}</span>
                        <span className="hidden truncate text-sm text-muted sm:inline">— {g.when}</span>
                        <span className="ml-auto text-faint transition-transform group-open:rotate-90" aria-hidden>
                          ›
                        </span>
                      </summary>
                      <div className="space-y-3 border-t border-line px-4 py-4 text-sm">
                        <p className="sm:hidden">
                          <span className="font-medium text-fg">Use it when:</span> {g.when}
                        </p>
                        <ol className="space-y-2">
                          {g.steps.map((s, i) => (
                            <li key={i} className="flex gap-2.5">
                              <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-2xs font-bold text-accent" aria-hidden>
                                {i + 1}
                              </span>
                              <span className="text-fg">{s}</span>
                            </li>
                          ))}
                        </ol>
                        {g.tips?.length ? (
                          <ul className="list-disc space-y-1 pl-5 text-muted">
                            {g.tips.map((tip) => (
                              <li key={tip}>
                                <span className="font-medium text-fg">Tip:</span> {tip}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        <Link to={`/tools/${t.slug}`} className="inline-flex h-8 items-center rounded-md bg-accent px-3 text-xs font-semibold text-accent-fg hover:brightness-110">
                          Open {t.title} →
                        </Link>
                      </div>
                    </details>
                  );
                })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
