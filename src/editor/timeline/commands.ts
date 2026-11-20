/**
 * Timeline commands shared by keyboard shortcuts, the toolbar and context menus. Each edit is one
 * undo step; failures are shown as a toast, never thrown into the UI.
 */
import type { Project } from '@/project/schema/types';
import { selectProject, useProjectStore } from '@/state/project-store';
import {
  addMarker,
  addTextClip,
  copyClips,
  detachAudio,
  pasteClips,
  removeMarker,
  removeTransition,
  rippleDeleteClips,
  setInOut,
  setTransitionAfter,
  splitAt,
  freezeFrame,
} from '@/timeline/model/edit';
import { clipEnd, projectDuration, removeClips } from '@/timeline/model/ops';
import { frameDuration, secondsToFlicks, type Flicks } from '@/utils/time';
import { useEditorUi } from '../editor-ui-store';
import { createId } from '@/utils/id';

const ui = () => useEditorUi.getState();
const project = (): Project | null => selectProject(useProjectStore.getState());

/** Apply an edit; returns false (and shows why) if it was rejected. */
export function tryEdit(fn: (p: Project) => Project): boolean {
  try {
    useProjectStore.getState().apply(fn);
    return true;
  } catch (e) {
    ui().notify(e instanceof Error ? e.message : String(e));
    return false;
  }
}

export function splitAtPlayhead() {
  let ids: string[] = [];
  const sel = ui().selectedClipIds;
  if (
    tryEdit((p) => {
      const [q, right] = splitAt(p, ui().playhead, sel.length ? sel : undefined);
      ids = right;
      return q;
    })
  )
    ui().selectClips(ids);
}

/** Freeze the frame under the playhead for 2 s: the selected video clip, else the top visible one there. */
export function freezeFrameAtPlayhead() {
  const p = project();
  if (!p) return;
  const t = ui().playhead;
  const isVideo = (id: string) => {
    const c = p.clips[id];
    const a = c?.assetId ? p.assets.find((x) => x.id === c.assetId) : undefined;
    return !!c && a?.kind === 'video' && c.start <= t && t < clipEnd(c) && c.speed > 0;
  };
  const target =
    ui().selectedClipIds.find(isVideo) ??
    p.tracks.filter((tr) => tr.kind === 'video' && !tr.hidden).flatMap((tr) => tr.clipIds).find(isVideo);
  if (!target) {
    ui().notify('Put the playhead over a video clip to freeze a frame.');
    return;
  }
  let id = '';
  if (
    tryEdit((q) => {
      const [r, fz] = freezeFrame(q, target, t, secondsToFlicks(2));
      id = fz;
      return r;
    })
  ) {
    ui().selectClips([id]);
    ui().notify('Added a 2-second freeze frame. Trim it to change its length.');
  }
}

export function deleteSelection(ripple: boolean) {
  const s = ui();
  if (s.selectedTransitionId) {
    const id = s.selectedTransitionId;
    tryEdit((p) => removeTransition(p, id));
    s.selectTransition(null);
    return;
  }
  if (s.selectedMarkerId) {
    const id = s.selectedMarkerId;
    tryEdit((p) => removeMarker(p, id));
    s.selectMarker(null);
    return;
  }
  const ids = s.selectedClipIds;
  if (!ids.length) return;
  if (tryEdit((p) => (ripple ? rippleDeleteClips(p, ids) : removeClips(p, ids)))) s.selectClips([]);
}

export function copySelection(cut = false) {
  const p = project();
  const ids = ui().selectedClipIds;
  if (!p || !ids.length) return;
  ui().setClipboard(copyClips(p, ids));
  if (cut) deleteSelection(false);
  else ui().notify(`Copied ${ids.length} clip${ids.length > 1 ? 's' : ''}.`);
}

export function paste() {
  const data = ui().clipboard;
  if (!data) return;
  let ids: string[] = [];
  if (
    tryEdit((p) => {
      const [q, out] = pasteClips(p, data, ui().playhead);
      ids = out;
      return q;
    })
  )
    ui().selectClips(ids);
}

export function duplicateSelection() {
  const p = project();
  const ids = ui().selectedClipIds;
  if (!p || !ids.length) return;
  const data = copyClips(p, ids);
  const end = Math.max(...ids.map((id) => clipEnd(p.clips[id]!)));
  let out: string[] = [];
  if (
    tryEdit((q) => {
      const [r, n] = pasteClips(q, data, end);
      out = n;
      return r;
    })
  )
    ui().selectClips(out);
}

export function addMarkerAtPlayhead() {
  let id = '';
  if (
    tryEdit((p) => {
      const [q, m] = addMarker(p, ui().playhead);
      id = m;
      return q;
    })
  )
    ui().selectMarker(id);
}

export function setInPoint() {
  tryEdit((p) => setInOut(p, ui().playhead, p.outPoint != null && p.outPoint > ui().playhead ? p.outPoint : null));
}
export function setOutPoint() {
  tryEdit((p) => setInOut(p, p.inPoint != null && p.inPoint < ui().playhead ? p.inPoint : null, ui().playhead));
}
export function clearInOut() {
  tryEdit((p) => setInOut(p, null, null));
}

export function detachSelectedAudio() {
  const ids = ui().selectedClipIds;
  if (ids.length !== 1) return ui().notify('Select one video clip.');
  tryEdit((p) => detachAudio(p, ids[0]!)[0]);
}

export function addTransitionAfter(clipId: string, type = 'crossfade', seconds = 1) {
  tryEdit((p) => setTransitionAfter(p, clipId, type, secondsToFlicks(seconds)));
}

export function addTitle() {
  let id = '';
  if (
    tryEdit((p) => {
      const [q, c] = addTextClip(p, ui().playhead);
      id = c;
      return q;
    })
  )
    ui().selectClips([id]);
}

const CREDITS_TEMPLATE = [
  'A FILM BY',
  'Your Name',
  '',
  'CAST',
  'Lead — Actor Name',
  'Supporting — Actor Name',
  '',
  'CREW',
  'Director — Name',
  'Cinematography — Name',
  'Editor — Name',
  'Sound — Name',
  'Music — Name',
  '',
  'SPECIAL THANKS',
  'Everyone who helped',
  '',
  'Edited with Veyra',
].join('\n');

/** End credits at the playhead: a 20 s title that rolls up at constant speed. Edit the text in the inspector. */
export function addCredits() {
  let id = '';
  if (
    tryEdit((p) => {
      const [q, c] = addTextClip(p, ui().playhead, secondsToFlicks(20), CREDITS_TEMPLATE);
      id = c;
      const clip = q.clips[c]!;
      const size = Math.round(p.settings.height / 22);
      return {
        ...q,
        clips: {
          ...q.clips,
          [c]: {
            ...clip,
            name: 'Credits',
            text: { ...clip.text!, fontSize: size, fontWeight: 500, align: 'center', lineHeight: 1.6, background: null },
            effects: [...clip.effects.filter((e) => e.type !== 'text-animation'), { id: createId('fx'), type: 'credits-roll', enabled: true, params: { direction: 'up' } }],
          },
        },
      };
    })
  ) {
    ui().selectClips([id]);
    ui().notify('Added rolling credits (20 s). Edit the names in the inspector; trim the clip to change the speed.');
  }
}

export function selectAll() {
  const p = project();
  if (p) ui().selectClips(Object.keys(p.clips));
}

/** Move the playhead by whole frames. */
export function stepFrames(n: number) {
  const p = project();
  if (!p) return;
  ui().setPlayhead(ui().playhead + n * frameDuration(p.settings.frameRate));
}

/** Jump to the previous/next clip edge or marker. */
export function jumpToEdit(dir: -1 | 1) {
  const p = project();
  if (!p) return;
  const points = new Set<Flicks>([0, projectDuration(p)]);
  for (const c of Object.values(p.clips)) {
    points.add(c.start);
    points.add(clipEnd(c));
  }
  for (const m of p.markers) points.add(m.t);
  const sorted = [...points].sort((a, b) => a - b);
  const now = ui().playhead;
  const next = dir > 0 ? sorted.find((t) => t > now) : [...sorted].reverse().find((t) => t < now);
  if (next != null) ui().setPlayhead(next);
}

export function goToEnd(end: boolean) {
  const p = project();
  if (p) ui().setPlayhead(end ? projectDuration(p) : 0);
}
