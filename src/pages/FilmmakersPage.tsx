import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { pageInfo } from '@/seo/site';
import { FILM_KIT } from '@/tools/film-kit';
import { TOOLS } from '@/tools/registry';
import { setPageMeta } from '@/utils/meta';

/** Every finishing feature, grouped the way a post-production workflow runs. */
const GROUPS: { id: string; title: string; lede: string; items: [string, string, string?][] }[] = [
  {
    id: 'cut',
    title: 'Cutting',
    lede: 'A multitrack timeline with the edits you would expect from a desktop NLE.',
    items: [
      ['Multitrack timeline', 'Video, title, overlay and audio tracks, each with lock, hide, mute and solo.'],
      ['Frame-accurate trimming', 'Ripple delete, roll edits (Ctrl + drag an edit point) and slip (Alt + drag a clip).'],
      ['J / K / L shuttle', 'Play, pause and step a frame at a time with the keyboard, like every pro editor.', 'Press ? in the editor for every shortcut.'],
      ['Markers, in and out points', 'M drops a marker; I and O set the range to export.'],
      ['Freeze frame', 'F holds the frame under the playhead for two seconds and keeps sound in sync.'],
      ['Speed ramps and reverse', 'Keyframe the speed for smooth ramps, play clips backwards, keep pitch on speed changes.'],
      ['Transitions', 'Eleven: cross dissolve, dip to black or white, four wipes, two slides, zoom and a circle reveal.'],
    ],
  },
  {
    id: 'picture',
    title: 'Picture and grade',
    lede: 'Measure first, then grade. The program monitor shows scopes from the exact frame you are looking at.',
    items: [
      ['Video scopes', 'Waveform, RGB parade, vectorscope with colour targets and a skin-tone line, and a histogram with clipping warnings.', 'Under the program monitor: Scopes.'],
      ['Framing guides', 'Title and action safe areas, rule of thirds, and 2.39:1, 1.85:1, 4:3, 1:1 and 9:16 masks.', 'Under the program monitor: Guides.'],
      ['Colour tools', 'Curves, colour balance, brightness, contrast, saturation and hue.'],
      ['LUTs', 'Load any .cube LUT on a clip.'],
      ['Keying and masks', 'Chroma key for green and blue screens; shaped masks with feather.'],
      ['Texture', 'Film grain, vignette, blur and seven blend modes.'],
      ['Keyframes', 'Animate position, scale, rotation, opacity and effect values with easing curves.'],
    ],
  },
  {
    id: 'sound',
    title: 'Sound',
    lede: 'Clean dialogue and a mix that meets the delivery spec.',
    items: [
      ['Dialogue noise reduction', 'Learns hiss, hum and room tone from the clip and lowers it without the underwater sound of a noise gate.', 'Inspector → Add audio effect.'],
      ['EQ and compression', 'A three-band EQ and a compressor on any clip.'],
      ['Auto-ducking', 'Music drops under dialogue on its own.'],
      ['Mixer', 'Faders, mute and solo per track; clip volume, pan and fades with keyframes.'],
      ['Delivery loudness', 'Normalise the whole mix to −14, −16, −23 or −24 LUFS (EBU R128), with peaks kept under −1 dB.', 'Export → Loudness.'],
    ],
  },
  {
    id: 'titles',
    title: 'Titles and subtitles',
    lede: 'From the opening title to the last line of the credits.',
    items: [
      ['Titles', 'A choice of fonts, outline, shadow and background box, with in and out animations.'],
      ['Rolling credits', 'A cast and crew template that rolls up at a constant speed, or crawls across.', 'Timeline → + Credits.'],
      ['Subtitles', 'Write and time subtitles, then burn them in or attach them as a track you can switch off.'],
    ],
  },
  {
    id: 'deliver',
    title: 'Delivery and hand-off',
    lede: 'Finish here, or send the edit on to a grading or sound suite.',
    items: [
      ['Export', 'MP4, WebM, MOV and MKV with H.264, HEVC, VP9 or AV1 where your browser can encode them; WAV, FLAC, M4A and MP3 for audio. Every file is checked before you get it.'],
      ['4K', 'Tested with 4K footage in Chrome and Firefox: compress, rescale, trim and merge all complete without running out of memory.'],
      ['DaVinci Resolve, Premiere, Final Cut', 'Send the timeline as FCPXML or a CMX 3600 EDL. Cuts, tracks, dissolves, titles and markers carry over.', 'Export → Send the timeline to…'],
      ['Proxies', 'Smooth previews of heavy footage from lightweight copies; export always uses the originals.'],
      ['Project files', 'Save the whole edit as a file to back it up or move it to another computer.'],
    ],
  },
];

const LIMITS = [
  'No ProRes or DNxHR export. Browsers cannot encode them yet.',
  'Safari is not fully supported. Use Chrome, Edge or Firefox.',
  'No multicam editing or motion tracking yet.',
  'Effects, grades and keyframes do not travel in the FCPXML or EDL hand-off; cuts, tracks, titles and markers do.',
];

export default function FilmmakersPage() {
  useEffect(() => {
    const p = pageInfo('/filmmakers')!;
    return setPageMeta(p.title, p.description, p.jsonLd);
  }, []);
  // Every single-file tool a filmmaker uses, grouped by workflow stage; unknown slugs are dropped.
  const kit = FILM_KIT.map((g) => ({ ...g, tools: g.tools.flatMap((x) => {
    const t = TOOLS.find((d) => d.slug === x.slug && d.status === 'available');
    return t ? [{ tool: t, note: x.note ?? t.summary }] : [];
  }) }));
  const kitCount = kit.reduce((n, g) => n + g.tools.length, 0);

  return (
    <div>
      <section className="grain border-b border-line">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 pb-14 pt-16 md:grid-cols-[1.3fr_1fr] md:pt-20">
          <div>
            <p className="slate mb-5">For Filmmakers</p>
            <h1 className="poster text-[clamp(3.6rem,10vw,7.5rem)]">Finish your short film <span className="text-accent">in the browser.</span></h1>
            <p className="mt-6 max-w-[52ch] text-lg leading-relaxed text-muted">
              Scopes for the grade, dialogue clean-up, delivery loudness, credits and a clean hand-off to Resolve. All of it runs on your own computer, so rushes and cuts
              never sit on someone else’s server.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/editor" className="inline-flex h-11 items-center rounded-md bg-accent px-5 font-medium text-accent-fg hover:brightness-110">
                Open the editor
              </Link>
              <a href="#tools" className="inline-flex h-11 items-center rounded-md border border-line-strong px-5 font-medium hover:bg-surface-2">
                All {kitCount} film tools
              </a>
            </div>
          </div>
          <nav aria-label="On this page" className="self-end text-sm">
            <ol className="divide-y divide-line border-y border-line">
              {[['tools', `Film tools (${kitCount})`], ...GROUPS.map((g) => [g.id, g.title] as const), ['limits', 'What it can’t do yet']].map(([id, title]) => (
                <li key={id}>
                  <a href={`#${id}`} className="flex items-center justify-between py-2.5 text-muted hover:text-fg">
                    {title}
                    <span aria-hidden className="text-faint">↓</span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </div>
      </section>

      <section id="tools" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16">
        <p className="slate mb-3">One file in, one file out</p>
        <h2 className="poster text-5xl sm:text-6xl">Film tools</h2>
        <p className="mt-2 max-w-[60ch] text-muted">
          {kitCount} tools for single jobs on a single file, no timeline needed, in the order a film gets finished. Tools marked <span className="font-mono text-xs text-accent">Made for film</span> were built for filmmakers.
        </p>
        <nav aria-label="Film tool groups" className="mt-6 flex flex-wrap gap-2">
          {kit.map((g) => (
            <a key={g.id} href={`#${g.id}`} className="rounded-full border border-line px-3 py-1 text-sm text-muted hover:border-line-strong hover:text-fg">
              {g.title} <span className="font-mono text-xs text-faint">{g.tools.length}</span>
            </a>
          ))}
        </nav>
        <div className="mt-10 space-y-12">
          {kit.map((g) => (
            <div key={g.id} id={g.id} className="scroll-mt-20">
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <h3 className="text-xl font-semibold">{g.title}</h3>
                <p className="text-sm text-muted">{g.lede}</p>
              </div>
              <ul className="mt-4 grid overflow-hidden rounded-lg border-l border-t border-line sm:grid-cols-2 lg:grid-cols-3">
                {g.tools.map(({ tool: t, note }) => (
                  <li key={t.slug} className="border-b border-r border-line bg-canvas">
                    <Link to={`/tools/${t.slug}`} className="group flex h-full flex-col p-5 hover:bg-surface">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium group-hover:text-accent">{t.title}</span>
                        {t.category === 'film' && <span className="rounded border border-accent/40 px-1.5 py-px font-mono text-[10px] uppercase tracking-wide text-accent">Made for film</span>}
                      </span>
                      <span className="mt-1.5 text-sm leading-relaxed text-muted">{note}</span>
                      <span className="mt-auto pt-4 font-mono text-xs text-faint group-hover:text-accent">Open tool →</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {GROUPS.map((g) => (
        <section key={g.id} id={g.id} className="scroll-mt-20 border-t border-line">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 md:grid-cols-[1fr_2fr]">
            <div>
              <p className="slate mb-3">In the editor</p>
              <h2 className="poster text-5xl">{g.title}</h2>
              <p className="mt-2 text-muted">{g.lede}</p>
            </div>
            <dl className="divide-y divide-line border-y border-line">
              {g.items.map(([name, what, where]) => (
                <div key={name} className="grid gap-1 py-4 sm:grid-cols-[13rem_1fr] sm:gap-6">
                  <dt className="font-medium">{name}</dt>
                  <dd className="text-sm leading-relaxed text-muted">
                    {what}
                    {where && <span className="mt-1 block font-mono text-xs text-faint">{where}</span>}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      ))}

      <section id="limits" className="scroll-mt-20 border-t border-line bg-surface">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 md:grid-cols-[1fr_2fr]">
          <div>
            <p className="slate mb-3">Limits</p>
            <h2 className="poster text-5xl">What it can’t do yet</h2>
            <p className="mt-2 text-muted">
              Better to know now than halfway through a cut. Missing something? <Link to="/feedback?type=idea" className="text-accent underline underline-offset-2">Ask for it</Link>.
            </p>
          </div>
          <ul className="divide-y divide-line border-y border-line">
            {LIMITS.map((l) => (
              <li key={l} className="py-4 text-sm leading-relaxed text-muted">
                {l}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
