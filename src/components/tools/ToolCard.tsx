import { Link } from 'react-router-dom';
import { IconCaptions, IconFilm, IconImage, IconLayers, IconMusic, IconSearch, IconWand } from '@/components/ui/icons';
import { CATEGORY_LABELS, type ToolCategory, type ToolDef } from '@/tools/registry';
import { Badge } from '../ui/primitives';

export const CATEGORY_ICON: Record<ToolCategory, typeof IconFilm> = {
  compress: IconLayers,
  convert: IconFilm,
  edit: IconWand,
  audio: IconMusic,
  visual: IconImage,
  subtitles: IconCaptions,
  utility: IconSearch,
};

export function ToolCard({ tool }: { tool: ToolDef }) {
  const Icon = CATEGORY_ICON[tool.category];
  return (
    <Link
      to={`/tools/${tool.slug}`}
      className="group flex gap-3 rounded-lg border border-line bg-surface p-3.5 transition-[border-color,background-color,transform] hover:-translate-y-px hover:border-line-strong hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent motion-reduce:hover:translate-y-0"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent" aria-hidden>
        <Icon size={18} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center gap-2">
          <span className="text-sm font-medium text-fg">{tool.title}</span>
          {tool.status !== 'available' && <Badge>Phase {tool.phase}</Badge>}
          <span className="ml-auto text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden>
            →
          </span>
        </span>
        <span className="text-xs leading-relaxed text-muted">{tool.summary}</span>
        <span className="sr-only">Category: {CATEGORY_LABELS[tool.category]}</span>
      </span>
    </Link>
  );
}
