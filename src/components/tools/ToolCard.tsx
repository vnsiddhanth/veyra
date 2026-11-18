import { Link } from 'react-router-dom';
import { CATEGORY_LABELS, type ToolDef } from '@/tools/registry';
import { Badge } from '../ui/primitives';

export function ToolCard({ tool }: { tool: ToolDef }) {
  return (
    <Link
      to={`/tools/${tool.slug}`}
      className="group flex flex-col gap-1.5 rounded-md border border-line bg-surface p-3.5 transition-colors hover:border-line-strong hover:bg-surface-2"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-fg">{tool.title}</span>
        {tool.status === 'available' ? <Badge tone="ok">Ready</Badge> : <Badge>Phase {tool.phase}</Badge>}
      </div>
      <p className="text-xs leading-relaxed text-muted">{tool.summary}</p>
      <span className="mt-auto pt-1 text-2xs uppercase tracking-wider text-faint">{CATEGORY_LABELS[tool.category]}</span>
    </Link>
  );
}
