import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { IconSearch } from '@/components/ui/icons';
import { FAQ, pageInfo } from '@/seo/site';
import { CATEGORY_LABELS, TOOLS, searchTools, type ToolCategory } from '@/tools/registry';
import { setPageMeta } from '@/utils/meta';

const REPO = 'https://github.com/vnsiddhanth/veyra';

/** Spec sheet rows: what it opens and makes, stated plainly. */
const SPECS: [string, string][] = [
  ['Opens', 'MP4, MOV, WebM, MKV, MPEG-TS, Ogg · MP3, WAV, M4A, FLAC · PNG, JPEG, WebP, GIF, AVIF · SRT, WebVTT'],
  ['Makes', 'MP4, WebM, MOV, MKV · H.264, HEVC, VP9, AV1 where your browser can encode them · WAV, FLAC, M4A, MP3, Opus · GIF, PNG'],
  ['Resolution', 'Up to 4K, tested in Chrome and Firefox'],
  ['File size', 'No limit set by us. Files are read in pieces and results written to disk as they are made.'],
  ['Browsers', 'Chrome and Edge (everything) · Firefox (mostly; MP4 audio saved as Opus) · Safari not supported yet'],
  ['Hand-off', 'FCPXML for DaVinci Resolve and Final Cut · CMX 3600 EDL for Premiere and Avid'],
  ['Cost', 'Free. No account, no watermark, no paid tier. MIT-licensed source.'],
];

export function HomePage() {
  const [q, setQ] = useState('');
  const results = useMemo(() => (q.trim() ? searchTools(q) : []), [q]);
  const categories = Object.keys(CATEGORY_LABELS) as ToolCategory[];
  useEffect(() => {
    const p = pageInfo('/')!;
    return setPageMeta(p.title, p.description, p.jsonLd);
  }, []);

  return (
    <div>
      {/* Hero: what it is, said once, then the real product. */}
      <section className="grain overflow-hidden border-b border-line">
        <div className="mx-auto max-w-6xl px-4 pt-14 md:pt-20">
          <div className="grid gap-8 md:grid-cols-[1.25fr_1fr] md:items-end">
            <div>
              <p className="slate mb-5">Free · open source · runs in your browser</p>
              <h1 className="max-w-[15ch] text-[2.6rem] font-semibold leading-[1.04] sm:text-6xl md:text-[4.25rem]">The video editor that never uploads your footage.</h1>
            </div>
            <div className="space-y-6 md:pb-2">
              <p className="text-lg leading-relaxed text-muted">
                A multitrack editor and {TOOLS.length} quick tools that do the work on your own computer. Nothing to install, no account, no watermark.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link to="/editor" className="inline-flex h-11 items-center rounded-md bg-accent px-5 font-medium text-accent-fg hover:brightness-110">
                  Open the editor
                </Link>
                <Link to="/tools" className="inline-flex h-11 items-center rounded-md border border-line-strong px-5 font-medium hover:bg-surface-2">
                  Browse {TOOLS.length} tools
                </Link>
              </div>
            </div>
          </div>

          <figure className="relative mt-14 md:mt-16">
            <div className="overflow-hidden rounded-t-lg border border-b-0 border-line-strong shadow-[0_-20px_80px_-40px_rgba(255,112,51,0.35)]">
              <img
                src="/img/editor-1000.webp"
                srcSet="/img/editor-1000.webp 1000w, /img/editor-2000.webp 2000w"
                sizes="(min-width: 1152px) 1120px, 100vw"
                width={2000}
                height={1150}
                alt="The Veyra editor: a graded mountain shot titled “The Long Way Home” in the program monitor with an RGB parade scope and a 2.39:1 guide, three shots with crossfades and a music track on the timeline."
                className="block h-auto w-full"
                fetchPriority="high"
              />
            </div>
          </figure>
        </div>
      </section>

      {/* 01 Tools */}
      <section id="tools" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 md:py-20">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="slate mb-3">01 · Quick tools</p>
            <h2 className="text-3xl font-semibold">One job, one file.</h2>
            <p className="mt-2 max-w-[52ch] text-muted">Drop a file, pick a setting, download. Every result is checked before you get it.</p>
          </div>
          <label className="relative block w-full sm:w-80">
            <span className="sr-only">Search tools</span>
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="What do you need? e.g. compress"
              className="h-11 w-full rounded-md border border-line-strong bg-surface pl-9 pr-3 text-sm placeholder:text-faint"
            />
          </label>
        </div>

        {q.trim() ? (
          <ul className="mt-8 divide-y divide-line border-y border-line" aria-label="Search results">
            {results.length === 0 && <li className="py-4 text-sm text-muted">No tool matches “{q}”. Try another word, or open the editor.</li>}
            {results.slice(0, 12).map((t) => (
              <li key={t.slug}>
                <Link to={`/tools/${t.slug}`} className="group grid gap-1 py-3.5 sm:grid-cols-[16rem_1fr]">
                  <span className="font-medium group-hover:text-accent">{t.title}</span>
                  <span className="text-sm text-muted">{t.summary}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-10 grid grid-cols-2 gap-x-5 gap-y-9 sm:gap-x-8 lg:grid-cols-4">
            {categories.map((c) => {
              const tools = TOOLS.filter((t) => t.category === c);
              return (
                <nav key={c} aria-label={CATEGORY_LABELS[c]}>
                  <h3 className="mb-3 flex items-baseline justify-between border-b border-line pb-2 text-sm font-semibold">
                    <Link to={`/tools?category=${c}`} className="hover:text-accent">
                      {CATEGORY_LABELS[c]}
                    </Link>
                    <span className="font-mono text-xs font-normal text-faint">{String(tools.length).padStart(2, '0')}</span>
                  </h3>
                  <ul className="space-y-1.5 text-sm sm:text-[15px]">
                    {tools.map((t) => (
                      <li key={t.slug}>
                        <Link to={`/tools/${t.slug}`} className="text-muted hover:text-fg">
                          {t.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </nav>
              );
            })}
          </div>
        )}
      </section>

      {/* 02 Privacy, explained as the mechanism it is */}
      <section className="border-y border-line bg-surface">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-[1fr_1.2fr] md:py-20">
          <div>
            <p className="slate mb-3">02 · Where your video goes</p>
            <h2 className="text-3xl font-semibold">Nowhere.</h2>
            <p className="mt-3 max-w-[48ch] leading-relaxed text-muted">
              Most online editors send your file to their servers, process it there and send it back. Veyra uses the video engine already built into your browser, so the
              work happens on your machine and the file never makes the trip.
            </p>
            <p className="mt-4 text-sm text-muted">
              <Link to="/privacy" className="text-accent underline underline-offset-2">
                Read the privacy page
              </Link>{' '}
              or{' '}
              <a href={REPO} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-2">
                check the source
              </a>
              .
            </p>
          </div>
          <ol className="grid gap-px overflow-hidden rounded-lg border border-line bg-line text-sm sm:grid-cols-3">
            {[
              ['Your disk', 'The browser reads the file where it is.'],
              ['This tab', 'Decoding, effects and encoding run here, using your graphics chip where it can.'],
              ['Your disk', 'The result is checked, then saved like any download.'],
            ].map(([h, d], i) => (
              <li key={i} className="bg-canvas p-5">
                <span className="font-mono text-faint">{String(i + 1).padStart(2, '0')}</span>
                <p className="mt-3 text-base font-medium">{h}</p>
                <p className="mt-1 leading-relaxed text-muted">{d}</p>
              </li>
            ))}
            <li className="bg-canvas p-5 sm:col-span-3">
              <p className="leading-relaxed text-muted">
                <span className="text-fg">Verify it yourself:</span> open your browser’s developer tools, go to Network, and edit a video. You will see the page load and a
                cookie-free visit counter, and no upload.
              </p>
            </li>
          </ol>
        </div>
      </section>

      {/* 03 Filmmakers */}
      <section className="mx-auto max-w-6xl px-4 py-16 md:py-20">
        <div className="grid gap-10 md:grid-cols-[1fr_1.2fr]">
          <div>
            <p className="slate mb-3">03 · For filmmakers</p>
            <h2 className="text-3xl font-semibold">Enough to finish a short film.</h2>
            <p className="mt-3 max-w-[46ch] leading-relaxed text-muted">Grade with real scopes, clean up dialogue, deliver at the right loudness, roll the credits, then hand the cut to Resolve if you want to.</p>
            <Link to="/filmmakers" className="mt-6 inline-flex h-11 items-center rounded-md border border-line-strong px-5 font-medium hover:bg-surface-2">
              Everything for filmmakers →
            </Link>
          </div>
          <dl className="divide-y divide-line border-y border-line">
            {[
              ['Scopes', 'Waveform, RGB parade, vectorscope and histogram from the frame on screen.'],
              ['Dialogue', 'Noise reduction that learns the room tone, plus EQ, compression and auto-ducking.'],
              ['Delivery', 'Loudness to −14 or −23 LUFS, 4K export, every file verified before download.'],
              ['Finishing', 'Freeze frames, speed ramps, LUTs, chroma key, rolling credits, 2.39:1 guides.'],
              ['Hand-off', 'FCPXML to DaVinci Resolve and Final Cut, EDL to Premiere and Avid.'],
            ].map(([k, v]) => (
              <div key={k} className="grid gap-1 py-4 sm:grid-cols-[8rem_1fr] sm:gap-6">
                <dt className="font-mono text-sm text-faint">{k}</dt>
                <dd className="leading-relaxed">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* 04 Spec sheet */}
      <section id="formats" className="scroll-mt-20 border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-16 md:py-20">
          <p className="slate mb-3">04 · Spec sheet</p>
          <h2 className="text-3xl font-semibold">What it handles.</h2>
          <dl className="mt-8 divide-y divide-line border-y border-line">
            {SPECS.map(([k, v]) => (
              <div key={k} className="grid gap-1 py-3.5 sm:grid-cols-[10rem_1fr] sm:gap-6">
                <dt className="font-mono text-sm text-faint">{k}</dt>
                <dd className="text-[15px] leading-relaxed">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-sm text-muted">
            Exactly what your browser can do is on the{' '}
            <Link to="/compatibility" className="text-accent underline underline-offset-2">
              browser support page
            </Link>
            .
          </p>
        </div>
      </section>

      {/* 05 Questions */}
      <section id="faq" className="scroll-mt-20 border-t border-line bg-surface">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-[1fr_2fr] md:py-20">
          <div>
            <p className="slate mb-3">05 · Questions</p>
            <h2 className="text-3xl font-semibold">Asked often.</h2>
            <p className="mt-3 text-muted">
              Something else?{' '}
              <Link to="/feedback?type=other" className="text-accent underline underline-offset-2">
                Ask me
              </Link>
              .
            </p>
          </div>
          <dl className="divide-y divide-line border-y border-line">
            {FAQ.map(({ q, a }) => (
              <div key={q} className="py-5">
                <dt className="font-medium">{q}</dt>
                <dd className="mt-1.5 leading-relaxed text-muted">{a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* A note from the person who made it. */}
      <section className="border-t border-line">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-[1fr_2fr] md:py-20">
          <p className="slate">Why this exists</p>
          <div className="max-w-[60ch] space-y-4 text-lg leading-relaxed">
            <p>
              I needed to trim a few screen recordings and join them into one demo. It took an evening and five websites: one wanted an account, one added a watermark, one
              capped the file size, and every one of them uploaded my files first.
            </p>
            <p className="text-muted">
              Browsers can process video themselves now, so I built the tool I wanted: free, private, and good enough for real work. If something is missing or broken,{' '}
              <Link to="/feedback" className="text-accent underline underline-offset-2">
                tell me
              </Link>
              .
            </p>
            <p className="font-mono text-sm text-faint">— Vishnubhotla Siddhanth</p>
            <div className="pt-4">
              <Link to="/editor" className="inline-flex h-11 items-center rounded-md bg-accent px-5 text-base font-medium text-accent-fg hover:brightness-110">
                Open the editor
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
