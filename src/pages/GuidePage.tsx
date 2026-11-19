/** User guide: short, task-based sections in plain language. */
import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Kbd } from '@/components/ui/primitives';
import { BRAND } from '@/config/brand';
import { setPageMeta } from '@/utils/meta';
import { ToolGuides } from '@/components/tools/ToolGuides';

const SECTIONS: [string, string][] = [
  ['start', 'Start in one minute'],
  ['reorder', 'Reorder videos and images'],
  ['timeline', 'Edit on the timeline'],
  ['preview', 'Preview your work'],
  ['look', 'Effects, text and animation'],
  ['audio', 'Sound'],
  ['export', 'Export'],
  ['tools', 'Every tool, step by step'],
  ['help', 'If something goes wrong'],
];

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-20 space-y-3">
      <h2 id={`${id}-h`} className="text-xl font-semibold tracking-tight">
        {title}
      </h2>
      <div className="space-y-3 text-[15px] leading-relaxed text-muted [&_strong]:text-fg">{children}</div>
    </section>
  );
}

function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="space-y-2">
      {items.map((x, i) => (
        <li key={i} className="flex gap-3">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-fg" aria-hidden>
            {i + 1}
          </span>
          <span>{x}</span>
        </li>
      ))}
    </ol>
  );
}

/** Tiny looping illustration of drag-to-reorder (static when reduced motion is requested). */
function ReorderDemo() {
  return (
    <figure className="rounded-lg border border-line bg-surface p-4">
      <style>{`
        @keyframes veyra-lift { 0%,15% { transform: translate(0,0) } 45%,70% { transform: translate(calc(-200% - 1rem), -8px) rotate(-2deg) } 85%,100% { transform: translate(calc(-200% - 1rem), 0) } }
        @keyframes veyra-make-room { 0%,30% { transform: translateX(0) } 55%,100% { transform: translateX(calc(100% + 0.5rem)) } }
        @media (prefers-reduced-motion: reduce) { .veyra-demo * { animation: none !important } }
      `}</style>
      <div className="veyra-demo flex gap-2" aria-hidden>
        {['A', 'B', 'C'].map((l, i) => (
          <div
            key={l}
            className={`flex h-14 flex-1 items-center justify-center rounded-md text-lg font-bold ${i === 2 ? 'z-10 bg-accent text-accent-fg shadow-lg' : 'bg-surface-3 text-fg'}`}
            style={{ animation: `${i === 2 ? 'veyra-lift' : 'veyra-make-room'} 3.2s ease-in-out infinite alternate` }}
          >
            {l}
          </div>
        ))}
      </div>
      <figcaption className="mt-2 text-xs text-muted">Drag “C” to the front: the others slide aside to show where it will land. Let go to drop it.</figcaption>
    </figure>
  );
}

export default function GuidePage() {
  useEffect(() => setPageMeta(`Guide · ${BRAND.name}`, `How to edit, reorder, preview and export video with ${BRAND.name}, step by step.`), []);
  // The page is code-split, so the browser's own jump to #section happens before it exists.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id) document.getElementById(id)?.scrollIntoView();
  }, []);
  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 lg:grid-cols-[220px_1fr]">
      <nav aria-label="Guide sections" className="lg:sticky lg:top-20 lg:self-start">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">On this page</p>
        <ul className="space-y-1 text-sm">
          {SECTIONS.map(([id, t]) => (
            <li key={id}>
              <a href={`#${id}`} className="text-muted hover:text-fg">
                {t}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <article className="max-w-3xl space-y-10">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">{BRAND.name} guide</h1>
          <p className="text-muted">
            Everything runs on your own device — files are never uploaded. Press <Kbd>?</Kbd> in the editor at any time for every keyboard shortcut.
          </p>
        </header>

        <Section id="start" title="Start in one minute">
          <Steps
            items={[
              <>
                Open the{' '}
                <Link to="/editor" className="text-accent">
                  editor
                </Link>{' '}
                and press <strong>New project</strong>.
              </>,
              <>
                Press <strong>Import files</strong> (or drag files onto the media panel on the left).
              </>,
              <>
                Drag a media card onto the timeline at the bottom — or select it and click its <strong>+</strong> button.
              </>,
              <>
                Press <Kbd>Space</Kbd> to play. Press <Kbd>S</Kbd> to cut at the red line. Drag a clip’s edge to shorten it.
              </>,
              <>
                Press <strong>Export</strong> (top right) and then <strong>Download</strong>.
              </>,
            ]}
          />
        </Section>

        <Section id="reorder" title="Reorder videos and images">
          <ReorderDemo />
          <p>
            There are three places where order matters. All of them work the same way: <strong>press and drag</strong>, watch the others make room, and let go.
          </p>
          <h3 className="pt-1 font-semibold text-fg">1. Lists in the quick tools (merge, slideshow, GIF)</h3>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Drag a thumbnail</strong> to a new place. The number in its corner is the order it will play in.
            </li>
            <li>
              <strong>Hover over a video</strong> and move the mouse left and right to preview it without opening it. Click <strong>⤢</strong> to see it full
              size; use <Kbd>←</Kbd> <Kbd>→</Kbd> to step through all of them.
            </li>
            <li>
              One click tidies the list: <strong>Sort A→Z</strong> (file names in natural order, so “2” comes before “10”), <strong>Sort by date</strong>,{' '}
              <strong>Reverse</strong>.
            </li>
            <li>
              Keyboard: <Kbd>Tab</Kbd> to a thumbnail, <Kbd>Space</Kbd> to pick it up, arrow keys to move it, <Kbd>Space</Kbd> to drop, <Kbd>Esc</Kbd> to cancel.
              Or hold <Kbd>Alt</Kbd> and press an arrow to move it one step.
            </li>
          </ul>
          <h3 className="pt-1 font-semibold text-fg">2. The media panel in the editor</h3>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              With <strong>Sort: My order</strong> (the default), drag a card onto another card to put it there. A yellow bar shows the side it will land on.
            </li>
            <li>Hover a video card and move the mouse across it to scrub through it.</li>
            <li>
              Keyboard: select a card and press <Kbd>Alt</Kbd> + an arrow key.
            </li>
          </ul>
          <h3 className="pt-1 font-semibold text-fg">3. Clips on the timeline</h3>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Turn on <strong>Rearrange</strong> in the timeline toolbar (or press <Kbd>R</Kbd>). Now dragging a clip slots it <em>between</em> other clips: the
              gap it leaves closes and the clips after the drop point move along to make room — like reordering cards.
            </li>
            <li>
              With Rearrange off, clips move freely to any time or another track, and never push other clips.
            </li>
            <li>Every change can be undone with <Kbd>Ctrl</Kbd>+<Kbd>Z</Kbd> — one drag is one undo step.</li>
          </ul>
        </Section>

        <Section id="timeline" title="Edit on the timeline">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Move:</strong> drag a clip (also up/down to another track). It snaps to edges, markers and the playhead; hold <Kbd>Shift</Kbd> to stop
              snapping.
            </li>
            <li>
              <strong>Trim:</strong> drag the left or right edge of a clip.
            </li>
            <li>
              <strong>Cut:</strong> put the red playhead where you want and press <Kbd>S</Kbd>. <strong>Ripple delete</strong> (<Kbd>Shift</Kbd>+<Kbd>Delete</Kbd>)
              removes a piece and closes the gap.
            </li>
            <li>
              <strong>Pro trims:</strong> <Kbd>Ctrl</Kbd> + drag the edge between two touching clips moves the cut (roll); <Kbd>Alt</Kbd> + drag a clip changes which
              part of the video it shows (slip).
            </li>
            <li>
              <strong>Select many:</strong> drag a box over empty space, or <Kbd>Shift</Kbd>-click. Copy, paste and duplicate with <Kbd>Ctrl</Kbd>+<Kbd>C</Kbd> /{' '}
              <Kbd>V</Kbd> / <Kbd>D</Kbd>.
            </li>
            <li>
              <strong>Right-click</strong> a clip for more: add a crossfade, detach its sound, and so on. <Kbd>M</Kbd> adds a marker.
            </li>
          </ul>
        </Section>

        <Section id="preview" title="Preview your work">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              The <strong>Program</strong> tab shows exactly what you will export. <strong>Source</strong> plays the media you selected in the library.
            </li>
            <li>
              Step frame by frame with <Kbd>←</Kbd> <Kbd>→</Kbd>; jump between cuts with <Kbd>↑</Kbd> <Kbd>↓</Kbd>.
            </li>
            <li>
              Big 4K files stuttering? Click a video card’s <strong>P</strong> button to make a small preview copy (“proxy”). Export always uses the original.
            </li>
          </ul>
        </Section>

        <Section id="look" title="Effects, text and animation">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Select a clip: the <strong>Inspector</strong> on the right shows position, size, rotation, opacity, crop and effects.
            </li>
            <li>
              <strong>Animate:</strong> move the playhead, click the <strong>◆</strong> next to a setting, move the playhead again and change the value. Click{' '}
              <strong>⌇</strong> to see the curve; choose “bezier” easing and drag the yellow handles to shape the motion.
            </li>
            <li>
              <strong>Speed ramps:</strong> add ◆ keyframes to <strong>Speed ramp</strong> to slow down and speed up smoothly inside one clip.
            </li>
            <li>
              <strong>Titles:</strong> press <Kbd>T</Kbd>, then type in the Inspector. Pick an animation under Effects → Text animation.
            </li>
            <li>
              Looks: colour, LUT (.cube), green-screen (chroma key), blur, vignette, masks — add them from “+ Add effect”, in any order, and switch each on/off.
            </li>
          </ul>
        </Section>

        <Section id="audio" title="Sound">
          <ul className="list-disc space-y-1 pl-5">
            <li>Volume, pan and fades are in the Inspector; volume can be keyframed like anything else.</li>
            <li>
              The <strong>Mixer</strong> (shown when nothing is selected) has a fader, <strong>M</strong>ute and <strong>S</strong>olo for every track.
            </li>
            <li>Add EQ, a compressor, or “Auto-duck under voice” to keep music under speech.</li>
          </ul>
        </Section>

        <Section id="export" title="Export">
          <Steps
            items={[
              <>
                Press <strong>Export</strong> (or <Kbd>Ctrl</Kbd>+<Kbd>E</Kbd>).
              </>,
              <>Choose a format (MP4 plays everywhere), a size and a quality. Only options your browser can really make are shown.</>,
              <>
                Press <strong>Export</strong>. When it says <strong>“output verified”</strong>, the file has been checked — press <strong>Download</strong>.
              </>,
            ]}
          />
        </Section>

        <Section id="tools" title="Every tool, step by step">
          <p>
            Each quick tool does one job and needs no editor. Find yours below — every guide also appears on the tool’s own page, next to the tool.
          </p>
          <ToolGuides />
        </Section>

        <Section id="help" title="If something goes wrong">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>“Media offline”</strong> after reopening a project: click <strong>Reconnect</strong> or <strong>Locate file…</strong> on the card. Your files
              are never copied into the browser, so it needs to see them again.
            </li>
            <li>
              <strong>A format isn’t offered:</strong> your browser can’t encode it. Chrome and Edge support the most; see{' '}
              <Link to="/compatibility" className="text-accent">
                Compatibility
              </Link>
              .
            </li>
            <li>
              <strong>Running out of space:</strong> clear finished exports and proxies on the{' '}
              <Link to="/privacy" className="text-accent">
                Privacy
              </Link>{' '}
              page.
            </li>
            <li>
              <strong>Slow?</strong> Lower the preview quality (bottom right of the monitor), make proxies, and close other heavy apps. Check your device on the{' '}
              <Link to="/benchmark" className="text-accent">
                Benchmark
              </Link>{' '}
              page.
            </li>
          </ul>
        </Section>
      </article>
    </div>
  );
}
