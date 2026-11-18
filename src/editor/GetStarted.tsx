/** First-run guide shown on the empty program monitor: four steps that tick off as the user works. */
import { Button } from '@/components/ui/primitives';
import type { Project } from '@/project/schema/types';
import { useEditorUi } from './editor-ui-store';

export function GetStarted({ project }: { project: Project }) {
  const hasMedia = project.assets.length > 0;
  const hasClips = Object.keys(project.clips).length > 0;
  const steps: [boolean, string, React.ReactNode][] = [
    [hasMedia, 'Import your media', <Button key="b" size="sm" variant="primary" onClick={() => useEditorUi.getState().requestImport()}>Import files</Button>],
    [hasClips, 'Put it on the timeline', 'Drag a card from the media panel onto a track, or select it and click its + button.'],
    [false, 'Edit', 'Press S to split at the red playhead. Drag a clip’s edge to trim it. Space plays.'],
    [false, 'Export', 'Press Export at the top right (Ctrl+E). Your file is made on this device.'],
  ];
  return (
    <section aria-label="Get started" className="pointer-events-auto w-full max-w-sm rounded-lg border border-line bg-surface/95 p-4 text-left text-sm shadow-lg">
      <h2 className="mb-2 font-semibold">Get started</h2>
      <ol className="space-y-2">
        {steps.map(([done, title, body], i) => (
          <li key={title} className="flex gap-2.5">
            <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-2xs font-bold ${done ? 'bg-ok text-accent-fg' : 'bg-surface-3 text-muted'}`} aria-hidden>
              {done ? '✓' : i + 1}
            </span>
            <div>
              <p className={done ? 'text-muted line-through' : 'font-medium'}>
                {title}
                {done && <span className="sr-only"> (done)</span>}
              </p>
              {!done && <div className="mt-0.5 text-xs text-muted">{body}</div>}
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-muted">
        Press <kbd className="rounded border border-line px-1">?</kbd> for all keyboard shortcuts.
      </p>
    </section>
  );
}
