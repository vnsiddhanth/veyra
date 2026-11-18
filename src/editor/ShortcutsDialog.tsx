import { useEffect, useRef } from 'react';
import { Button, Kbd } from '@/components/ui/primitives';

const mod = typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac') ? '⌘' : 'Ctrl';

const GROUPS: [string, [string, string][]][] = [
  [
    'Playback',
    [
      ['Space', 'Play / pause'],
      ['K / L', 'Stop / play'],
      ['← →', 'Previous / next frame (Shift: 10 frames)'],
      ['↑ ↓', 'Previous / next edit point'],
      ['Home / End', 'Go to start / end'],
    ],
  ],
  [
    'Editing',
    [
      ['S', 'Split at the playhead'],
      ['Delete', 'Delete selection'],
      ['Shift+Delete', 'Ripple delete (close the gap)'],
      [`${mod}+C / X / V`, 'Copy / cut / paste at the playhead'],
      [`${mod}+D`, 'Duplicate'],
      [`${mod}+A`, 'Select all clips'],
      ['T', 'Add a title'],
      [`${mod}+Z / ${mod}+Shift+Z`, 'Undo / redo'],
    ],
  ],
  [
    'Timeline',
    [
      ['M', 'Add a marker'],
      ['I / O / X', 'Set in / set out / clear range'],
      ['N', 'Snapping on or off (hold Shift while dragging to invert)'],
      ['+ / −', 'Zoom in / out (or Ctrl + mouse wheel)'],
      ['Drag a clip', 'Move (also to another track)'],
      ['R', 'Rearrange mode: drag a clip between others to reorder them'],
      ['Drag a clip edge', 'Trim'],
      [`${mod} + drag an edge`, 'Roll edit between touching clips'],
      ['Alt + drag a clip', 'Slip the source inside the clip'],
      ['Right-click a clip', 'More actions'],
    ],
  ],
  [
    'Project',
    [
      [`${mod}+I`, 'Import media'],
      ['Alt + arrow on a media card', 'Change its place in “My order”'],
      [`${mod}+E`, 'Export'],
      [`${mod}+S`, 'Save now (projects also save automatically)'],
      ['?', 'This list'],
      ['Esc', 'Clear selection'],
    ],
  ],
];

export function ShortcutsDialog({ onClose }: { onClose(): void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector('button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === '?') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" className="max-h-full w-full max-w-3xl overflow-y-auto rounded-lg border border-line-strong bg-surface p-5 shadow-2xl">
        <div className="mb-3 flex items-center">
          <h2 className="text-lg font-semibold">Keyboard shortcuts</h2>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          {GROUPS.map(([title, rows]) => (
            <section key={title}>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">{title}</h3>
              <dl className="space-y-1 text-sm">
                {rows.map(([k, d]) => (
                  <div key={k} className="flex gap-3">
                    <dt className="w-40 shrink-0">
                      <Kbd>{k}</Kbd>
                    </dt>
                    <dd className="text-muted">{d}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
