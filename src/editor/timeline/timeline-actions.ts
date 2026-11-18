import type { Project } from '@/project/schema/types';
import { useProjectStore } from '@/state/project-store';
import { clipEnd, insertClip, trackAccepts } from '@/timeline/model/ops';
import { useEditorUi } from '../editor-ui-store';

/** The default track for an asset kind: the lowest unlocked video track for visuals, the first audio track for audio. */
export function defaultTrackFor(p: Project, assetKind: string): string | null {
  const want = assetKind === 'audio' ? 'audio' : assetKind === 'subtitle' ? 'text' : 'video';
  const candidates = p.tracks.filter((t) => !t.locked && trackAccepts(t.kind, assetKind) && t.kind === want);
  if (candidates.length === 0) return null;
  // Track list is ordered top → bottom; the main video track is the lowest one.
  return assetKind === 'audio' ? candidates[0]!.id : candidates[candidates.length - 1]!.id;
}

/** Append an asset at the end of its default track (one undo step). */
export function appendToTimeline(assetId: string): void {
  const store = useProjectStore.getState();
  const p = store.history?.present;
  if (!p) return;
  const asset = p.assets.find((a) => a.id === assetId);
  if (!asset) return;
  const trackId = defaultTrackFor(p, asset.kind);
  if (!trackId) {
    useEditorUi.getState().notify(`Add an unlocked ${asset.kind === 'audio' ? 'audio' : asset.kind === 'subtitle' ? 'text' : 'video'} track first.`);
    return;
  }
  const track = p.tracks.find((t) => t.id === trackId)!;
  const last = track.clipIds.length ? p.clips[track.clipIds[track.clipIds.length - 1]!]! : null;
  try {
    let newId = '';
    store.apply((proj) => {
      const [next, id] = insertClip(proj, { trackId, assetId, start: last ? clipEnd(last) : 0 });
      newId = id;
      return next;
    });
    useEditorUi.getState().selectClips([newId]);
  } catch (e) {
    useEditorUi.getState().notify(e instanceof Error ? e.message : String(e));
  }
}
