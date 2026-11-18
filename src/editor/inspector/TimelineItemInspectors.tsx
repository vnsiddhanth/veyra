import { Field, SectionTitle } from '@/components/ui/primitives';
import type { Project } from '@/project/schema/types';
import { removeMarker, removeTransition, setTransitionAfter, updateMarker } from '@/timeline/model/edit';
import { flicksToSeconds, formatTimecode, secondsToFlicks } from '@/utils/time';
import { useEditorUi } from '../editor-ui-store';
import { tryEdit } from '../timeline/commands';

export const TRANSITION_TYPES: [string, string][] = [
  ['crossfade', 'Crossfade'],
  ['dip-black', 'Dip to black'],
  ['dip-white', 'Dip to white'],
  ['wipe-left', 'Wipe left'],
  ['wipe-right', 'Wipe right'],
  ['wipe-up', 'Wipe up'],
  ['wipe-down', 'Wipe down'],
  ['slide-left', 'Slide left'],
  ['slide-right', 'Slide right'],
  ['zoom', 'Zoom in'],
  ['circle', 'Circle reveal'],
];

const input = 'h-7 w-full rounded-sm border border-line bg-surface-2 px-1.5 text-xs';

export function TransitionInspector({ project, id }: { project: Project; id: string }) {
  const tr = project.transitions[id];
  if (!tr) return null;
  const replace = (type: string, seconds: number) =>
    tryEdit((p) => {
      const q = setTransitionAfter(removeTransition(p, id), tr.fromClipId, type, secondsToFlicks(seconds));
      const added = Object.values(q.transitions).find((t) => t.fromClipId === tr.fromClipId && t.toClipId === tr.toClipId);
      if (added) queueMicrotask(() => useEditorUi.getState().selectTransition(added.id));
      return q;
    });
  return (
    <div>
      <SectionTitle>Transition</SectionTitle>
      <div className="space-y-2 px-3 text-xs">
        <label className="block">
          <span className="mb-1 block text-muted">Type</span>
          <select className={input} value={tr.type} onChange={(e) => replace(e.target.value, flicksToSeconds(tr.duration))}>
            {TRANSITION_TYPES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-muted">Duration (s)</span>
          <input
            type="number"
            min={0.1}
            step={0.1}
            defaultValue={flicksToSeconds(tr.duration).toFixed(2)}
            key={tr.duration}
            className={input}
            onBlur={(e) => {
              const v = Number(e.target.value);
              if (v > 0 && Math.abs(v - flicksToSeconds(tr.duration)) > 1e-3) replace(tr.type, v);
            }}
          />
        </label>
        <p className="text-2xs text-faint">Centred on the cut. Both clips show real frames where their media extends past the cut; otherwise the edge frame is held.</p>
        <button type="button" className="text-danger hover:underline" onClick={() => (tryEdit((p) => removeTransition(p, id)), useEditorUi.getState().selectTransition(null))}>
          Remove transition
        </button>
      </div>
    </div>
  );
}

export function MarkerInspector({ project, id }: { project: Project; id: string }) {
  const m = project.markers.find((x) => x.id === id);
  if (!m) return null;
  return (
    <div>
      <SectionTitle>Marker</SectionTitle>
      <div className="space-y-2 px-3 text-xs">
        <label className="block">
          <span className="mb-1 block text-muted">Label</span>
          <input key={m.id} defaultValue={m.label} className={input} onBlur={(e) => e.target.value !== m.label && tryEdit((p) => updateMarker(p, id, { label: e.target.value.slice(0, 200) }))} />
        </label>
        <label className="block">
          <span className="mb-1 block text-muted">Colour</span>
          <input type="color" value={m.color} onChange={(e) => tryEdit((p) => updateMarker(p, id, { color: e.target.value }))} className="h-7 w-12 rounded-sm border border-line" />
        </label>
        <dl>
          <Field label="Time">{formatTimecode(m.t, project.settings.frameRate)}</Field>
        </dl>
        <button type="button" className="text-danger hover:underline" onClick={() => (tryEdit((p) => removeMarker(p, id)), useEditorUi.getState().selectMarker(null))}>
          Delete marker
        </button>
      </div>
    </div>
  );
}
