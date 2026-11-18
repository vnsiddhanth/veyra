import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ToolCard } from '@/components/tools/ToolCard';
import { IconCpu, IconLayers, IconSearch, IconShield, IconWand } from '@/components/ui/icons';
import { BRAND } from '@/config/brand';
import { TOOLS, searchTools } from '@/tools/registry';

const FEATURES = [
  { icon: IconShield, title: 'Private by design', body: 'Files are read and processed by your own browser. Nothing is uploaded, so there is nothing for us to store or leak.' },
  { icon: IconCpu, title: 'Hardware accelerated', body: 'Decoding and encoding use WebCodecs, which reaches your GPU’s video engine when your browser supports it.' },
  { icon: IconLayers, title: 'A real editor', body: 'A multitrack, non-destructive editor with frame-accurate timing is in development. It is built on the same engine as the tools.' },
  { icon: IconWand, title: 'Free, without asterisks', body: 'No watermark, no account, no export limits, no paid tier. What your device can process, you can export.' },
];

const FAQ = [
  {
    q: 'Is it really free? What’s the catch?',
    a: 'There is no paid plan and no watermark. Because processing runs on your device, serving the site costs us very little. That is what keeps it free without limits.',
  },
  {
    q: 'Are my videos uploaded anywhere?',
    a: 'No. The page reads files you pick directly from your disk and processes them in your browser. The site’s security policy blocks the page from sending data to other servers.',
  },
  {
    q: 'How large can my files be?',
    a: 'We set no limit. Large files are read in pieces rather than loaded into memory at once. In practice, your device’s memory, storage and browser codecs decide what is comfortable. 4K editing benefits from a recent computer.',
  },
  {
    q: 'Which browser should I use?',
    a: 'Recent Chrome and Edge currently support the most codecs and file-system features. Firefox and Safari work with some limitations. The compatibility page shows exactly what your browser supports.',
  },
  {
    q: 'What happens to my project if I close the tab?',
    a: 'Projects autosave in your browser’s storage. Your media stays where it is on your disk. In Chrome and Edge the editor can reconnect to it after one click. In other browsers you re-select the files once.',
  },
  {
    q: 'Which tools work today?',
    a: 'Tools marked “Ready” work now. The others are listed with the development phase that delivers them. We do not show buttons that only pretend to work.',
  },
];

export function HomePage() {
  const [query, setQuery] = useState('');
  const results = useMemo(() => searchTools(query), [query]);
  const popular = TOOLS.filter((t) => t.popular);
  return (
    <div>
      <section className="border-b border-line">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:grid-cols-[1.1fr_1fr] md:py-20">
          <div className="space-y-5">
            <p className="text-xs font-medium uppercase tracking-wider text-accent">Free · Private · No account</p>
            <h1 className="text-3xl font-semibold leading-tight tracking-tight text-fg sm:text-4xl">
              Edit video in your browser, without uploading a thing.
            </h1>
            <p className="max-w-xl text-[15px] leading-relaxed text-muted">{BRAND.tagline} It has single-purpose tools for quick jobs and a multitrack editor for real projects. There is no watermark and no limit on exports.</p>
            <div className="flex flex-wrap gap-2">
              <Link to="/editor" className="inline-flex h-11 items-center rounded-md bg-accent px-5 text-[15px] font-medium text-accent-fg hover:brightness-110">
                Open the editor
              </Link>
              <a href="#tools" className="inline-flex h-11 items-center rounded-md border border-line bg-surface px-5 text-[15px] font-medium text-fg hover:bg-surface-2">
                Browse tools
              </a>
            </div>
          </div>
          <div className="rounded-lg border border-line bg-surface p-4 text-sm">
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-faint">How it works</p>
            <ol className="space-y-3">
              {[
                ['Pick a file', 'Your browser reads it from disk. No upload progress bar, because nothing is uploaded.'],
                ['Edit or convert', 'Processing runs in background threads on your device, using hardware video engines where available.'],
                ['Save the result', 'The output is written locally and checked before you download it.'],
              ].map(([t, d], i) => (
                <li key={t} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">{i + 1}</span>
                  <div>
                    <p className="font-medium text-fg">{t}</p>
                    <p className="text-muted">{d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section id="tools" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-12">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Video tools</h2>
            <p className="text-sm text-muted">One job, one page. Pick a tool, drop a file, done.</p>
          </div>
          <label className="relative w-full sm:w-72">
            <span className="sr-only">Search tools</span>
            <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tools, e.g. “compress”"
              className="h-9 w-full rounded-md border border-line bg-surface pl-8 pr-3 text-sm placeholder:text-faint focus:border-accent focus:outline-none"
            />
          </label>
        </div>
        {query ? (
          results.length ? (
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              {results.map((t) => (
                <ToolCard key={t.slug} tool={t} />
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted">No tools match “{query}”.</p>
          )
        ) : (
          <>
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              {popular.map((t) => (
                <ToolCard key={t.slug} tool={t} />
              ))}
            </div>
            <div className="mt-4">
              <Link to="/tools" className="text-sm font-medium text-accent hover:underline">
                See all {TOOLS.length} tools →
              </Link>
            </div>
          </>
        )}
      </section>

      <section className="border-y border-line bg-surface">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="space-y-2">
              <Icon size={20} className="text-accent" />
              <h3 className="text-sm font-semibold">{title}</h3>
              <p className="text-sm leading-relaxed text-muted">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="formats" className="mx-auto grid max-w-6xl scroll-mt-20 gap-8 px-4 py-12 md:grid-cols-2">
        <div>
          <h2 className="mb-2 text-xl font-semibold tracking-tight">Supported formats</h2>
          <p className="mb-4 text-sm text-muted">
            What can be decoded or encoded depends on your browser and hardware. We check before offering anything, and the{' '}
            <Link to="/compatibility" className="text-accent hover:underline">
              compatibility page
            </Link>{' '}
            lists your browser’s actual support.
          </p>
          <dl className="space-y-2 text-sm">
            {[
              ['Video', 'MP4, MOV, WebM, MKV, MPEG-TS, Ogg. AVI/FLV/WMV are planned through a compatibility converter.'],
              ['Video codecs', 'H.264, HEVC*, VP8, VP9, AV1* (* depends on browser/hardware)'],
              ['Audio', 'MP3, WAV, AAC/M4A, Ogg/Opus/Vorbis, FLAC'],
              ['Images', 'PNG, JPEG, WebP, GIF, AVIF, BMP, SVG'],
              ['Subtitles', 'SRT, WebVTT'],
            ].map(([k, v]) => (
              <div key={k} className="grid grid-cols-[110px_1fr] gap-3">
                <dt className="text-muted">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="rounded-lg border border-line bg-surface p-5">
          <IconShield size={20} className="mb-2 text-accent" />
          <h2 className="mb-2 text-lg font-semibold">Privacy you can verify</h2>
          <p className="text-sm leading-relaxed text-muted">
            The page’s Content Security Policy allows network requests only to this site. It has no analytics or ad scripts. Open your browser’s
            network panel while you edit and you will see no media leave your device.
          </p>
          <Link to="/privacy" className="mt-3 inline-block text-sm font-medium text-accent hover:underline">
            Read how it works →
          </Link>
        </div>
      </section>

      <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 pb-16">
        <h2 className="mb-4 text-xl font-semibold tracking-tight">Questions</h2>
        <div className="divide-y divide-line rounded-lg border border-line bg-surface">
          {FAQ.map(({ q, a }) => (
            <details key={q} className="group px-4 py-3">
              <summary className="cursor-pointer list-none text-sm font-medium text-fg marker:hidden">
                <span className="mr-2 inline-block text-faint transition-transform group-open:rotate-90">›</span>
                {q}
              </summary>
              <p className="mt-2 pl-4 text-sm leading-relaxed text-muted">{a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
