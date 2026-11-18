import { lazy, Suspense, useEffect, type ComponentType } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ToolCard } from '@/components/tools/ToolCard';
import { IconShield } from '@/components/ui/icons';
import { Badge } from '@/components/ui/primitives';
import { BRAND } from '@/config/brand';
import { InspectTool } from '@/tools/inspect/InspectTool';
import { ThumbnailTool } from '@/tools/thumbnail/ThumbnailTool';
import { TrimTool } from '@/tools/trim/TrimTool';
import { CATEGORY_LABELS, findTool, relatedTools, type ToolDef, type ToolEngine } from '@/tools/registry';

const named = <K extends string>(load: () => Promise<Record<K, ComponentType<{ tool: ToolDef }>>>, name: K) =>
  lazy(() => load().then((m) => ({ default: m[name] })));

/** Tool implementations, code-split so each page loads only its own processor UI. */
const ENGINES: Partial<Record<ToolEngine, ComponentType<{ tool: ToolDef }>>> = {
  convert: named(() => import('@/tools/convert/ConvertTool'), 'ConvertTool'),
  gif: named(() => import('@/tools/gif/GifTool'), 'GifTool'),
  frames: named(() => import('@/tools/frames/FramesTool') as Promise<Record<'FramesTool', ComponentType<{ tool: ToolDef }>>>, 'FramesTool'),
  split: named(() => import('@/tools/split/SplitTool') as Promise<Record<'SplitTool', ComponentType<{ tool: ToolDef }>>>, 'SplitTool'),
  merge: named(() => import('@/tools/compose/MergeTool'), 'MergeTool'),
  speed: named(() => import('@/tools/compose/SpeedTool'), 'SpeedTool'),
  'audio-track': named(() => import('@/tools/compose/AudioTrackTool'), 'AudioTrackTool'),
  decor: named(() => import('@/tools/compose/DecorTool'), 'DecorTool'),
  slideshow: named(() => import('@/tools/compose/SlideshowTool'), 'SlideshowTool'),
  'subtitle-editor': named(() => import('@/tools/subtitles/SubtitleTools') as unknown as Promise<Record<'SubtitleEditorTool', ComponentType<{ tool: ToolDef }>>>, 'SubtitleEditorTool'),
  'soft-subtitles': named(() => import('@/tools/subtitles/SubtitleTools'), 'SoftSubtitlesTool'),
  silence: named(() => import('@/tools/compose/SilenceTool') as Promise<Record<'SilenceTool', ComponentType<{ tool: ToolDef }>>>, 'SilenceTool'),
};
import { NotFoundPage } from './NotFoundPage';

export default function ToolPage() {
  const { slug = '' } = useParams();
  const tool = findTool(slug);
  useEffect(() => {
    if (tool) document.title = `${tool.title} — free, private, in your browser · ${BRAND.name}`;
  }, [tool]);
  if (!tool) return <NotFoundPage />;
  const related = relatedTools(tool);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <nav className="mb-4 text-xs text-muted" aria-label="Breadcrumb">
        <Link to="/tools" className="hover:text-fg">
          Tools
        </Link>{' '}
        / {CATEGORY_LABELS[tool.category]}
      </nav>
      <header className="mb-6 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{tool.title}</h1>
          {tool.status === 'available' ? <Badge tone="ok">Ready</Badge> : <Badge>In development · Phase {tool.phase}</Badge>}
        </div>
        <p className="max-w-2xl text-[15px] text-muted">{tool.summary}</p>
        <p className="flex items-center gap-1.5 text-xs text-faint">
          <IconShield size={14} /> Runs locally. Your file is never uploaded.
        </p>
      </header>

      {ENGINES[tool.engine] ? (
        <Suspense fallback={<p className="text-sm text-muted">Loading tool…</p>}>
          <EngineView tool={tool} />
        </Suspense>
      ) : tool.engine === 'inspect' ? (
        <InspectTool tool={tool} />
      ) : tool.engine === 'trim' ? (
        <TrimTool />
      ) : tool.engine === 'thumbnail' ? (
        <ThumbnailTool />
      ) : (
        <div className="rounded-lg border border-line bg-surface p-6">
          <h2 className="text-base font-semibold">This tool isn’t available yet</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            {tool.title} is scheduled for development phase {tool.phase}. We don’t ship tools that only simulate their result. This page will
            gain a working processor once the real pipeline is built and its output is verified.
          </p>
          <p className="mt-3 text-sm text-muted">
            Meanwhile you can{' '}
            <Link to="/tools/video-metadata" className="text-accent hover:underline">
              inspect a video’s metadata
            </Link>{' '}
            or start a project in the{' '}
            <Link to="/editor" className="text-accent hover:underline">
              editor
            </Link>
            .
          </p>
        </div>
      )}

      {related.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-faint">Related tools</h2>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((t) => (
              <ToolCard key={t.slug} tool={t} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function EngineView({ tool }: { tool: ToolDef }) {
  const C = ENGINES[tool.engine]!;
  return <C key={tool.slug} tool={tool} />;
}
