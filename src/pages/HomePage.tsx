import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CATEGORY_ICON, ToolCard } from '@/components/tools/ToolCard';
import { IconCpu, IconLayers, IconSearch, IconShield, IconWand } from '@/components/ui/icons';
import { BRAND } from '@/config/brand';
import { CATEGORY_LABELS, TOOLS, searchTools, type ToolCategory } from '@/tools/registry';
import { setPageMeta } from '@/utils/meta';

const REPO = 'https://github.com/vnsiddhanth/veyra';

const FEATURES = [
  { icon: IconShield, title: 'Private by design', body: 'Your files are read and processed by your own browser. Nothing is uploaded, so there is nothing to store, sell or leak.' },
  { icon: IconCpu, title: 'Hardware accelerated', body: 'Decoding and encoding use WebCodecs, which reaches your graphics chip’s video engine when your browser supports it.' },
  { icon: IconLayers, title: 'A real editor', body: 'Multitrack timeline, frame-accurate cuts, keyframes, transitions, titles, colour, audio mixing and a live preview that matches the export.' },
  { icon: IconWand, title: 'Free and open source', body: 'No watermark, no account, no export limits, no paid tier. The full source is MIT-licensed on GitHub.' },
];

const FAQ = [
  {
    q: 'Is it really free? What’s the catch?',
    a: 'There is no paid plan, no watermark and no limit. Because the work happens on your device, running the site costs almost nothing — that is what keeps it free.',
  },
  {
    q: 'Are my videos uploaded anywhere?',
    a: 'No. The page reads files straight from your disk and processes them in your browser. Its security policy blocks it from sending data to other servers, and you can confirm that in your browser’s network panel.',
  },
  {
    q: 'How large can my files be?',
    a: 'There is no limit set by us. Large files are read in pieces rather than loaded into memory at once, and results are written to disk as they are made. Your device’s memory, storage and codecs set the practical limit.',
  },
  {
    q: 'Which browser should I use?',
    a: 'Recent Chrome or Edge support the most codecs and features. Firefox works too (it saves MP4 audio as Opus because it has no AAC encoder). The compatibility page shows exactly what your browser can do.',
  },
  {
    q: 'What happens to my project if I close the tab?',
    a: 'Projects save automatically in your browser. Your media stays where it is on your disk; in Chrome and Edge the editor reconnects with one click, in other browsers you pick the files again once.',
  },
  {
    q: 'Can I see the code?',
    a: `Yes. ${BRAND.name} is open source under the MIT licence. Read it, run it yourself or contribute on GitHub.`,
  },
  {
    q: 'Which formats can I open?',
    a: 'MP4, MOV, WebM, MKV, MPEG-TS, Ogg, MP3, WAV, M4A, FLAC, common images and SRT/VTT subtitles. Older formats like AVI, FLV and WMV are not supported — convert them first with a desktop tool.',
  },
];

/** Decorative, CSS-only sketch of the editor (no images to load). */
function EditorSketch() {
  return (
    <div aria-hidden className="relative select-none overflow-hidden rounded-xl border border-line bg-[#0d0e11] p-3 shadow-2xl ring-1 ring-black/5">
      <div className="mb-2 flex gap-1.5">
        {['#ef6b6b', '#f5b942', '#43c08a'].map((c) => (
          <span key={c} className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />
        ))}
      </div>
      <div className="grid grid-cols-[1fr_2.2fr] gap-2">
        <div className="grid grid-cols-2 gap-1.5">
          {['from-amber-500/70 to-rose-500/60', 'from-sky-500/70 to-indigo-500/60', 'from-emerald-500/70 to-teal-500/60', 'from-fuchsia-500/70 to-purple-500/60'].map((g) => (
            <span key={g} className={`aspect-video rounded bg-gradient-to-br ${g}`} />
          ))}
        </div>
        <div className="relative aspect-video overflow-hidden rounded bg-gradient-to-br from-sky-400 via-indigo-500 to-fuchsia-500">
          <span className="absolute bottom-[18%] left-1/2 -translate-x-1/2 rounded bg-black/45 px-2 py-0.5 text-[10px] font-semibold text-white">Your story here</span>
        </div>
      </div>
      <div className="relative mt-2 space-y-1 rounded bg-[#15171b] p-1.5">
        {[
          [['8%', '30%', 'bg-[#a371f7]'], ['42%', '24%', 'bg-[#a371f7]']],
          [['0%', '38%', 'bg-[#58a6ff]'], ['38%', '34%', 'bg-[#58a6ff]'], ['72%', '22%', 'bg-[#58a6ff]']],
          [['0%', '94%', 'bg-[#3fb950]']],
        ].map((row, i) => (
          <div key={i} className="relative h-4 rounded-sm bg-white/5">
            {row.map(([l, w, c]) => (
              <span key={l} className={`absolute inset-y-0.5 rounded-sm ${c} opacity-80`} style={{ left: l, width: w }} />
            ))}
          </div>
        ))}
        <span className="absolute inset-y-0 left-[46%] w-px bg-[#ef6b6b]" />
      </div>
    </div>
  );
}

export function HomePage() {
  const [query, setQuery] = useState('');
  const results = useMemo(() => searchTools(query), [query]);
  const popular = TOOLS.filter((t) => t.popular);
  const categories = Object.keys(CATEGORY_LABELS) as ToolCategory[];
  useEffect(() => setPageMeta(`${BRAND.name} — free, private video editor in your browser`, 'Free video editor and 46 video tools that run entirely in your browser. No uploads, no watermark, no account. Open source.'), []);

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-line">
        <div aria-hidden className="pointer-events-none absolute -right-40 -top-40 h-[480px] w-[480px] rounded-full bg-accent/10 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-14 md:grid-cols-[1.05fr_1fr] md:py-20">
          <div className="space-y-6">
            <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-ok" aria-hidden /> Free · Private · Open source
            </p>
            <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight text-fg sm:text-5xl">
              Edit video in your browser.
              <span className="block text-accent">Nothing leaves your device.</span>
            </h1>
            <p className="max-w-xl text-base leading-relaxed text-muted">
              A full multitrack editor and {TOOLS.length} one-click tools that run on your own device. No watermark, no sign-up, no limits.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link to="/editor" className="inline-flex h-12 items-center rounded-lg bg-accent px-6 text-[15px] font-semibold text-accent-fg shadow-sm transition hover:brightness-110">
                Start editing — it’s free
              </Link>
              <Link to="/tools" className="inline-flex h-12 items-center rounded-lg border border-line bg-surface px-6 text-[15px] font-medium text-fg transition hover:bg-surface-2">
                Browse {TOOLS.length} tools
              </Link>
            </div>
            <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted" aria-label="Promises">
              {['Nothing uploaded', 'No watermark', 'No account', 'Exports checked before download'].map((x) => (
                <li key={x} className="flex items-center gap-1.5">
                  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden className="text-ok">
                    <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {x}
                </li>
              ))}
            </ul>
          </div>
          <EditorSketch />
        </div>
      </section>

      {/* Categories + tools */}
      <section id="tools" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-14">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Quick tools</h2>
            <p className="text-sm text-muted">One job each. Drop a file, pick a setting, download.</p>
          </div>
          <label className="relative w-full sm:w-80">
            <span className="sr-only">Search tools</span>
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="What do you want to do? e.g. “compress”"
              className="h-10 w-full rounded-md border border-line bg-surface pl-9 pr-3 text-sm placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
            />
          </label>
        </div>
        {query ? (
          results.length ? (
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {results.map((t) => (
                <ToolCard key={t.slug} tool={t} />
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted">No tools match “{query}”.</p>
          )
        ) : (
          <>
            <div className="mb-8 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              {categories.map((c) => {
                const Icon = CATEGORY_ICON[c];
                return (
                  <Link
                    key={c}
                    to={`/tools?category=${c}`}
                    className="flex flex-col items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-3 text-center text-xs font-medium text-muted transition hover:border-accent hover:text-fg"
                  >
                    <Icon size={20} className="text-accent" aria-hidden />
                    {CATEGORY_LABELS[c]}
                  </Link>
                );
              })}
            </div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">Most used</h3>
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {popular.map((t) => (
                <ToolCard key={t.slug} tool={t} />
              ))}
            </div>
            <Link to="/tools" className="mt-5 inline-block text-sm font-medium text-accent hover:underline">
              See all {TOOLS.length} tools →
            </Link>
          </>
        )}
      </section>

      {/* How it works */}
      <section className="border-y border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <h2 className="mb-8 text-center text-2xl font-semibold tracking-tight">How it works</h2>
          <ol className="grid gap-6 md:grid-cols-3">
            {[
              ['Pick a file', 'Your browser opens it straight from your disk. There is no upload bar, because nothing is uploaded.'],
              ['Edit or convert', 'Work happens in background threads on your device, using its video hardware where available.'],
              ['Download a checked file', 'Every result is re-opened and verified — tracks, length, size, first and last frame — before you get it.'],
            ].map(([t, d], i) => (
              <li key={t} className="rounded-lg border border-line bg-canvas p-5">
                <span className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-fg" aria-hidden>
                  {i + 1}
                </span>
                <h3 className="font-semibold text-fg">{t}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted">{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <div key={title} className="space-y-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <Icon size={20} />
            </span>
            <h3 className="font-semibold">{title}</h3>
            <p className="text-sm leading-relaxed text-muted">{body}</p>
          </div>
        ))}
      </section>

      {/* Formats + privacy */}
      <section id="formats" className="mx-auto grid max-w-6xl scroll-mt-20 gap-8 px-4 pb-14 md:grid-cols-2">
        <div>
          <h2 className="mb-2 text-xl font-semibold tracking-tight">Supported formats</h2>
          <p className="mb-4 text-sm text-muted">
            What can be opened and saved depends on your browser and hardware. We check before offering any option — the{' '}
            <Link to="/compatibility" className="text-accent underline">
              compatibility page
            </Link>{' '}
            shows your browser’s actual support.
          </p>
          <dl className="space-y-2 text-sm">
            {[
              ['Video', 'MP4, MOV, WebM, MKV, MPEG-TS, Ogg'],
              ['Video codecs', 'H.264, HEVC*, VP8, VP9, AV1* (* depends on browser/hardware)'],
              ['Audio', 'MP3, WAV, AAC/M4A, Ogg/Opus/Vorbis, FLAC'],
              ['Images', 'PNG, JPEG, WebP, GIF, AVIF, BMP'],
              ['Subtitles', 'SRT, WebVTT'],
            ].map(([k, v]) => (
              <div key={k} className="grid grid-cols-[110px_1fr] gap-3">
                <dt className="text-muted">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="rounded-xl border border-line bg-surface p-6">
          <IconShield size={22} className="mb-2 text-accent" />
          <h2 className="mb-2 text-lg font-semibold">Privacy you can verify</h2>
          <p className="text-sm leading-relaxed text-muted">
            The site’s security policy only allows requests to itself and a cookie-free visit counter. There are no ad or tracking scripts. Open your browser’s network panel while you
            edit: no media ever leaves your device.
          </p>
          <div className="mt-4 flex flex-wrap gap-4 text-sm font-medium">
            <Link to="/privacy" className="text-accent hover:underline">
              How privacy works →
            </Link>
            <a href={REPO} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
              Read the source →
            </a>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 pb-16">
        <h2 className="mb-4 text-2xl font-semibold tracking-tight">Questions</h2>
        <div className="divide-y divide-line rounded-xl border border-line bg-surface">
          {FAQ.map(({ q, a }) => (
            <details key={q} className="group px-5 py-4">
              <summary className="flex cursor-pointer list-none items-center gap-3 text-[15px] font-medium text-fg marker:hidden">
                {q}
                <span className="ml-auto text-faint transition-transform group-open:rotate-45" aria-hidden>
                  +
                </span>
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-muted">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Closing CTA */}
      <section className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 py-14 text-center">
          <h2 className="text-2xl font-semibold tracking-tight">Ready when you are.</h2>
          <p className="max-w-lg text-sm text-muted">No download, no account. Open the editor and drop in a clip — the guide walks you through the rest.</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/editor" className="inline-flex h-11 items-center rounded-lg bg-accent px-6 text-sm font-semibold text-accent-fg hover:brightness-110">
              Open the editor
            </Link>
            <Link to="/guide" className="inline-flex h-11 items-center rounded-lg border border-line px-6 text-sm font-medium text-fg hover:bg-surface-2">
              Read the guide
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
