import { lazy, Suspense, useEffect, type ComponentType } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ToolCard } from '@/components/tools/ToolCard';
import { ToolGuidePanel } from '@/components/tools/ToolGuidePanel';
import { Badge } from '@/components/ui/primitives';
import { BRAND } from '@/config/brand';
import { setPageMeta } from '@/utils/meta';
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
  stabilize: named(() => import('@/tools/compose/StabilizeTool') as unknown as Promise<Record<'StabilizeTool', ComponentType<{ tool: ToolDef }>>>, 'StabilizeTool'),
  film: named(() => import('@/tools/film/FilmTools') as Promise<Record<'FilmTool', ComponentType<{ tool: ToolDef }>>>, 'FilmTool'),
  silence: named(() => import('@/tools/compose/SilenceTool') as Promise<Record<'SilenceTool', ComponentType<{ tool: ToolDef }>>>, 'SilenceTool'),
};
import { NotFoundPage } from './NotFoundPage';
import { pageInfo } from '@/seo/site';

export default function ToolPage() {
  const { slug = '' } = useParams();
  const tool = findTool(slug);
  useEffect(() => {
    if (!tool) return;
    const p = pageInfo(`/tools/${tool.slug}`, window.location.origin)!;
    return setPageMeta(p.title, p.description, p.jsonLd);
  }, [tool]);
  if (!tool) return <NotFoundPage />;
  const related = relatedTools(tool);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <nav className="mb-5 font-mono text-xs uppercase tracking-[0.06em] text-faint" aria-label="Breadcrumb">
        <ol className="flex items-center gap-1.5">
          <li>
            <Link to="/tools" className="hover:text-fg">
              Tools
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li>
            <Link to={`/tools?category=${tool.category}`} className="hover:text-fg">
              {CATEGORY_LABELS[tool.category]}
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li aria-current="page" className="text-fg">
            {tool.title}
          </li>
        </ol>
      </nav>
      <header className="mb-8 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="poster text-[clamp(3rem,7vw,5rem)]">{tool.title}</h1>
          {tool.status !== 'available' && <Badge>In development · Phase {tool.phase}</Badge>}
        </div>
        <p className="max-w-2xl text-lg leading-relaxed text-muted">{tool.summary}</p>
        <p className="font-mono text-xs text-faint" aria-label="Guarantees">
          Runs on your device · never uploaded · no watermark · no sign-up
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-4">
          <ToolGuidePanel tool={tool} variant="inline" />

      {ENGINES[tool.engine] ? (
        <Suspense fallback={<div className="h-56 animate-pulse rounded-lg border border-line bg-surface" role="status" aria-label="Loading tool" />}>
          <EngineView tool={tool} />
        </Suspense>
      ) : tool.engine === 'guide' ? (
        <div className="space-y-3 rounded-lg border border-line bg-surface p-6 text-sm leading-relaxed">
          <h2 className="text-base font-semibold">How to remove an overlay you added in {BRAND.name}</h2>
          <p className="text-muted">
            Overlays you add in the editor (titles, logos, captions) stay as separate clips in your project, so removing them is lossless: nothing is
            painted out or guessed. This works for your own {BRAND.name} projects. It cannot remove watermarks that are already part of someone
            else’s video pixels, and we don’t offer that.
          </p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              Open the project in the{' '}
              <Link to="/editor" className="text-accent hover:underline">
                editor
              </Link>
              .
            </li>
            <li>Select the overlay clip on its text or overlay track and press Delete, or hide the whole track with its eye icon.</li>
            <li>Press Export (Ctrl+E). The new file is rendered from your original media without the overlay.</li>
          </ol>
        </div>
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

        </div>
        <ToolGuidePanel tool={tool} variant="aside" />
      </div>

      {related.length > 0 && (
        <section className="mt-12">
          <h2 className="slate mb-4">Related tools</h2>
          <div className="grid border-l border-t border-line sm:grid-cols-2 lg:grid-cols-4">
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
