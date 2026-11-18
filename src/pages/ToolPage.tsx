import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ToolCard } from '@/components/tools/ToolCard';
import { IconShield } from '@/components/ui/icons';
import { Badge } from '@/components/ui/primitives';
import { BRAND } from '@/config/brand';
import { InspectTool } from '@/tools/inspect/InspectTool';
import { ThumbnailTool } from '@/tools/thumbnail/ThumbnailTool';
import { TrimTool } from '@/tools/trim/TrimTool';
import { CATEGORY_LABELS, findTool, relatedTools } from '@/tools/registry';
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

      {tool.engine === 'inspect' ? (
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
