import { Link } from 'react-router-dom';
import { guideFor } from '@/tools/guides';
import type { ToolDef } from '@/tools/registry';

/** "How to use" card for a tool page: when to use it, numbered steps, tips. */
export function ToolGuidePanel({ tool, variant }: { tool: ToolDef; variant: 'aside' | 'inline' }) {
  const g = guideFor(tool.slug);
  if (!g) return null;
  const body = (
    <div className="space-y-3 text-sm">
      <p className="text-muted">
        <span className="font-medium text-fg">Use it when:</span> {g.when}
      </p>
      <ol className="space-y-2">
        {g.steps.map((s, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-2xs font-bold text-accent" aria-hidden>
              {i + 1}
            </span>
            <span className="leading-snug">{s}</span>
          </li>
        ))}
      </ol>
      {g.tips?.length ? (
        <div className="rounded-md border border-line bg-surface-2/60 p-2.5">
          <p className="mb-1 text-2xs font-semibold uppercase tracking-wider text-muted">Tips</p>
          <ul className="list-disc space-y-1 pl-4 text-muted">
            {g.tips.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <Link to={`/guide#tool-${tool.slug}`} className="inline-block text-xs font-medium text-accent hover:underline">
        All tool guides →
      </Link>
    </div>
  );
  if (variant === 'inline')
    return (
      <details className="group rounded-lg border border-line bg-surface lg:hidden">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold">
          <span className="text-accent">?</span> How to use this tool
          <span className="ml-auto text-faint transition-transform group-open:rotate-90" aria-hidden>
            ›
          </span>
        </summary>
        <div className="border-t border-line px-4 py-3">{body}</div>
      </details>
    );
  return (
    <aside aria-label="How to use this tool" className="hidden rounded-lg border border-line bg-surface p-4 lg:sticky lg:top-20 lg:block lg:self-start">
      <h2 className="mb-3 text-sm font-semibold">How to use this tool</h2>
      {body}
    </aside>
  );
}
