import { Link } from 'react-router-dom';
import { IconCaptions, IconFilm, IconImage, IconLayers, IconMusic, IconSearch, IconWand, IconClapper } from '@/components/ui/icons';
import { CATEGORY_LABELS, type ToolCategory, type ToolDef } from '@/tools/registry';
import { Badge } from '../ui/primitives';

export const CATEGORY_ICON: Record<ToolCategory, typeof IconFilm> = {
  compress: IconLayers,
  convert: IconFilm,
  edit: IconWand,
  audio: IconMusic,
  visual: IconImage,
  film: IconClapper,
  subtitles: IconCaptions,
  utility: IconSearch,
};

/** One tool in a hairline-ruled grid (cells draw their right and bottom rules; the grid draws top and left). */
export function ToolCard({ tool }: { tool: ToolDef }) {
  return (
    <Link
      to={`/tools/${tool.slug}`}
      className="group flex h-full flex-col border-b border-r border-line bg-canvas p-4 transition-colors hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
    >
      <span className="flex items-baseline gap-2">
        <span className="font-medium text-fg group-hover:text-accent">{tool.title}</span>
        {tool.status !== 'available' && <Badge>Phase {tool.phase}</Badge>}
      </span>
      <span className="mt-1 text-sm leading-relaxed text-muted">{tool.summary}</span>
      <span className="mt-auto flex items-center justify-between pt-3 font-mono text-xs text-faint">
        <span>{CATEGORY_LABELS[tool.category]}</span>
        <span className="group-hover:text-accent" aria-hidden>
          Open →
        </span>
      </span>
    </Link>
  );
}

/** Grid wrapper for ToolCards: hairlines between cells. */
export const TOOL_GRID = 'grid border-l border-t border-line sm:grid-cols-2 lg:grid-cols-3';
