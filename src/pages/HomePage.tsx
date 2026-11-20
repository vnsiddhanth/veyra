import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { GradeDemo } from '@/components/home/GradeDemo';
import { IconSearch } from '@/components/ui/icons';
import { FAQ, pageInfo } from '@/seo/site';
import { CATEGORY_LABELS, TOOLS, searchTools, type ToolCategory } from '@/tools/registry';
import { setPageMeta } from '@/utils/meta';

const REPO = 'https://github.com/vnsiddhanth/veyra';

const SPECS: [string, string][] = [
  ['Opens', 'MP4, MOV, WebM, MKV, MPEG-TS, Ogg · MP3, WAV, M4A, FLAC · PNG, JPEG, WebP, GIF, AVIF · SRT, WebVTT'],
  ['Makes', 'MP4, WebM, MOV, MKV · H.264, HEVC, VP9, AV1 where your browser can encode them · WAV, FLAC, M4A, MP3, Opus · GIF, PNG'],
  ['Resolution', 'Up to 4K, tested in Chrome and Firefox'],
  ['File size', 'No limit set by us. Files are read in pieces and results written to disk as they are made.'],
  ['Browsers', 'Chrome and Edge (everything) · Firefox (mostly; MP4 audio saved as Opus) · Safari not supported yet'],
  ['Hand-off', 'FCPXML for DaVinci Resolve and Final Cut · CMX 3600 EDL for Premiere and Avid'],
  ['Cost', 'Free. No account, no watermark, no paid tier. MIT-licensed source.'],
];

/** Callouts on the editor screenshot: [x %, y %, label, detail]. */
const CALLOUTS: [number, number, string, string][] = [
  [27, 14, '2.39:1 guide', 'Frame for scope, safe areas or vertical. Preview only.'],
  [61, 50, 'Scopes', 'Waveform, RGB parade, vectorscope, histogram — from the frame on screen.'],
  [98.6, 33, 'Keyframes', 'Every ◆ animates position, scale, rotation, opacity or an effect.'],
  [16, 77, 'Titles', 'Fonts, shadows, animations, and rolling credits.'],
  [37, 89, 'Crossfades', 'Eleven transitions, dropped between any two clips.'],
  [95.5, 7.5, 'Export', 'MP4 to 4K, delivery loudness, or hand-off to DaVinci Resolve.'],
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
      {/* ── Poster ─────────────────────────────────────────────────────── */}
      <section className="grain relative overflow-hidden">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 pb-16 pt-12 md:pt-16 lg:grid-cols-[1fr_1.08fr] lg:items-center lg:gap-14">
          <div>
            <p className="slate mb-6 flex items-center gap-3">
              <span className="inline-block h-2 w-2 rounded-full bg-accent" aria-hidden /> Now showing in your browser
            </p>
            <h1 className="poster text-[clamp(4.2rem,13vw,9.5rem)] text-fg">
              Edit video.
              <span className="block text-accent">Keep it</span>
              <span className="block">yours.</span>
            </h1>
            <p className="mt-7 max-w-[44ch] text-lg leading-relaxed text-muted">
              A real editor and {TOOLS.length} quick tools that do the work on your own computer. Your footage never leaves it: no upload, no account, no watermark.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/editor" className="inline-flex h-12 items-center rounded-md bg-accent px-6 text-[15px] font-semibold text-accent-fg hover:brightness-110">
                Open the editor
              </Link>
              <Link to="/tools" className="inline-flex h-12 items-center rounded-md border border-line-strong px-6 text-[15px] font-medium hover:bg-surface-2">
                Browse {TOOLS.length} tools
              </Link>
            </div>
            {/* Movie-poster billing block. */}
            <p className="billing mt-12 max-w-[34rem] text-[1.32rem]" aria-label="Credits">
              Veyra <small>presents</small> a browser production <small>starring</small> {TOOLS.length} tools <small>and</small> a multitrack editor
              <small>with</small> real scopes · dialogue noise reduction · EBU R128 loudness · 4K export <small>music by</small> WebCodecs <small>written and directed by</small>{' '}
              Vishnubhotla Siddhanth <small>rated</small> MIT · no uploads · no watermark
            </p>
          </div>
          <div>
            <GradeDemo />
            <p className="mt-3 text-center font-mono text-xs text-faint">↑ Drag the sliders. Grade a shot right here.</p>
          </div>
        </div>
      </section>

      <div className="sprockets" aria-hidden />

      {/* ── The cutting room ─────────────────────────────────────────────── */}
      <section className="theme-dark bg-[#0b0a09] text-[#efe8dc]">
        <div className="mx-auto max-w-6xl px-4 py-16 md:py-24">
          <div className="grid gap-6 md:grid-cols-[1fr_1fr] md:items-end">
            <h2 className="poster text-[clamp(3rem,8vw,5.5rem)]">The cutting room</h2>
            <p className="max-w-[46ch] text-lg leading-relaxed text-white/60">
              Multitrack timeline, frame-accurate cuts, keyframes, titles, colour, sound. A proper editor, not a template machine. This is a real screenshot.
            </p>
          </div>
          <figure className="relative mt-10">
            <img
              src="/img/editor-1000.webp"
              srcSet="/img/editor-1000.webp 1000w, /img/editor-2000.webp 2000w"
              sizes="(min-width: 1152px) 1120px, 100vw"
              width={2000}
              height={1150}
              loading="lazy"
              alt="The Veyra editor: a graded mountain shot titled “The Long Way Home” in the program monitor with an RGB parade scope and a 2.39:1 guide, three shots with crossfades and a music track on the timeline."
              className="block h-auto w-full rounded-md border border-white/10"
            />
            {CALLOUTS.map(([x, y], i) => (
              <span
                key={i}
                aria-hidden
                className="absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-[#0b0a09] bg-accent font-mono text-[11px] font-semibold text-accent-fg shadow-lg max-sm:h-5 max-sm:w-5 max-sm:text-[9px]"
                style={{ left: `${x}%`, top: `${y}%` }}
              >
                {i + 1}
              </span>
            ))}
          </figure>
          <ol className="mt-8 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
            {CALLOUTS.map(([, , label, detail], i) => (
              <li key={label} className="flex gap-3">
                <span className="mt-0.5 font-mono text-sm text-accent">{String(i + 1).padStart(2, '0')}</span>
                <span>
                  <span className="block font-medium">{label}</span>
                  <span className="block text-sm leading-relaxed text-white/55">{detail}</span>
                </span>
              </li>
            ))}
          </ol>
          <div className="mt-10">
            <Link to="/editor" className="inline-flex h-11 items-center rounded-md bg-accent px-5 font-medium text-accent-fg hover:brightness-110">
              Open the editor
            </Link>
          </div>
        </div>
      </section>

      <div className="sprockets" aria-hidden />

      {/* ── Starring: the tools as end credits ─────────────────────────────── */}
      <section id="tools" className="theme-dark scroll-mt-20 bg-[#070605] text-[#efe8dc]">
        <div className="mx-auto max-w-5xl px-4 py-16 md:py-24">
          <div className="text-center">
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-white/50">Starring</p>
            <h2 className="poster mt-3 text-[clamp(3.5rem,10vw,7rem)]">{TOOLS.length} tools</h2>
            <p className="mt-3 font-mono text-xs uppercase tracking-[0.2em] text-white/50">in order of appearance · one job each · nothing uploaded</p>
          </div>

          <label className="relative mx-auto mt-10 block max-w-sm">
            <span className="sr-only">Search tools</span>
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Find a tool — e.g. compress, gif, noise"
              className="h-11 w-full rounded-md border border-white/15 bg-white/5 pl-9 pr-3 text-sm text-white placeholder:text-white/40 focus:border-accent focus:outline-none"
            />
          </label>

          {q.trim() ? (
            <ul className="mx-auto mt-10 max-w-2xl divide-y divide-white/10 border-y border-white/10" aria-label="Search results">
              {results.length === 0 && <li className="py-4 text-center text-sm text-white/60">No tool matches “{q}”. Try another word, or open the editor.</li>}
              {results.slice(0, 12).map((t) => (
                <li key={t.slug}>
                  <Link to={`/tools/${t.slug}`} className="group grid gap-1 py-3.5 sm:grid-cols-[14rem_1fr]">
                    <span className="font-medium group-hover:text-accent">{t.title}</span>
                    <span className="text-sm text-white/55">{t.summary}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-14 grid gap-y-10 md:grid-cols-2 md:gap-x-12">
              {categories.map((c) => {
                const tools = TOOLS.filter((t) => t.category === c);
                return (
                  <dl key={c} className="grid grid-cols-[1fr_1.3fr] gap-x-6 sm:gap-x-10">
                    <dt className="pt-0.5 text-right font-mono text-[11px] uppercase tracking-[0.18em] text-white/50 sm:text-xs">
                      <Link to={`/tools?category=${c}`} className="hover:text-accent">
                        {CATEGORY_LABELS[c]}
                      </Link>
                    </dt>
                    <dd>
                      <ul className="space-y-1">
                        {tools.map((t) => (
                          <li key={t.slug}>
                            <Link to={`/tools/${t.slug}`} className="text-[15px] text-white/85 decoration-accent underline-offset-4 hover:text-white hover:underline sm:text-base">
                              {t.title}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </dd>
                  </dl>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <div className="sprockets" aria-hidden />

      {/* ── Where your video goes ───────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-16 md:py-24">
        <div className="grid gap-10 md:grid-cols-[1fr_1.15fr]">
          <div>
            <p className="slate mb-4">Where your video goes</p>
            <h2 className="poster text-[clamp(4rem,11vw,8rem)] text-accent">Nowhere.</h2>
            <p className="mt-5 max-w-[46ch] leading-relaxed text-muted">
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
          <ol className="self-end border-l border-line">
            {[
              ['Your disk', 'The browser reads the file where it is.'],
              ['This tab', 'Decoding, effects and encoding run here, on your graphics chip where it can.'],
              ['Your disk', 'The result is checked, then saved like any download.'],
            ].map(([h, d], i) => (
              <li key={i} className="relative pb-7 pl-8 last:pb-0">
                <span className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-canvas bg-accent" aria-hidden />
                <span className="font-mono text-xs text-faint">{['IN', 'PROCESS', 'OUT'][i]}</span>
                <p className="text-xl font-semibold">{h}</p>
                <p className="mt-1 leading-relaxed text-muted">{d}</p>
              </li>
            ))}
            <li className="pl-8 pt-7">
              <p className="rounded-md border border-dashed border-line-strong p-4 text-sm leading-relaxed text-muted">
                <span className="font-medium text-fg">Don’t take my word for it.</span> Open your browser’s developer tools, go to Network and edit a video. You’ll see the
                page load and a cookie-free visit counter, and no upload.
              </p>
            </li>
          </ol>
        </div>
      </section>

      {/* ── For filmmakers ─────────────────────────────────────────────────── */}
      <section className="border-t border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-16 md:py-24">
          <div className="grid gap-10 md:grid-cols-[1fr_1.2fr]">
            <div>
              <p className="slate mb-4">For filmmakers</p>
              <h2 className="poster text-[clamp(3rem,8vw,5.5rem)]">Enough to finish a short film</h2>
              <Link to="/filmmakers" className="mt-8 inline-flex h-11 items-center rounded-md border border-line-strong px-5 font-medium hover:bg-surface-2">
                Everything for filmmakers →
              </Link>
            </div>
            <dl className="divide-y divide-line border-y border-line">
              {[
                ['Picture', 'Scopes from the frame on screen, LUTs, curves, chroma key, film grain, 2.39:1 guides.'],
                ['Sound', 'Dialogue noise reduction that learns the room tone, EQ, compression, auto-ducking.'],
                ['Delivery', 'Loudness to −14 or −23 LUFS, 4K export, every file verified before download.'],
                ['Finishing', 'Freeze frames, speed ramps, rolling credits, subtitles.'],
                ['Hand-off', 'FCPXML to DaVinci Resolve and Final Cut, EDL to Premiere and Avid.'],
              ].map(([k, v]) => (
                <div key={k} className="grid gap-1 py-4 sm:grid-cols-[7rem_1fr] sm:gap-6">
                  <dt className="font-mono text-sm uppercase tracking-wider text-accent">{k}</dt>
                  <dd className="leading-relaxed">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* ── Spec sheet ─────────────────────────────────────────────────────── */}
      <section id="formats" className="scroll-mt-20 border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-16 md:py-24">
          <div className="grid gap-10 md:grid-cols-[1fr_2fr]">
            <div>
              <p className="slate mb-4">Technical</p>
              <h2 className="poster text-[clamp(3rem,8vw,5.5rem)]">Spec sheet</h2>
              <p className="mt-4 text-sm text-muted">
                What your own browser can do:{' '}
                <Link to="/compatibility" className="text-accent underline underline-offset-2">
                  browser support
                </Link>
                .
              </p>
            </div>
            <dl className="divide-y divide-line border-y border-line">
              {SPECS.map(([k, v]) => (
                <div key={k} className="grid gap-1 py-3.5 sm:grid-cols-[8rem_1fr] sm:gap-6">
                  <dt className="font-mono text-sm text-faint">{k}</dt>
                  <dd className="text-[15px] leading-relaxed">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* ── Questions ──────────────────────────────────────────────────────── */}
      <section id="faq" className="scroll-mt-20 border-t border-line bg-surface">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-[1fr_2fr] md:py-24">
          <div>
            <p className="slate mb-4">Questions</p>
            <h2 className="poster text-[clamp(3rem,8vw,5.5rem)]">Asked often</h2>
            <p className="mt-4 text-muted">
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

      {/* ── Maker's note ───────────────────────────────────────────────────── */}
      <section className="grain border-t border-line">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-[1fr_2fr] md:py-24">
          <div>
            <p className="slate mb-4">Why this exists</p>
            <h2 className="poster text-[clamp(3rem,8vw,5.5rem)]">A note from the maker</h2>
          </div>
          <div className="max-w-[60ch] space-y-5 text-lg leading-relaxed">
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
            <p className="poster text-4xl text-accent">— Siddhanth</p>
            <div className="pt-2">
              <Link to="/editor" className="inline-flex h-12 items-center rounded-md bg-accent px-6 text-[15px] font-semibold text-accent-fg hover:brightness-110">
                Open the editor
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
