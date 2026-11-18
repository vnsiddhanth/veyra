/**
 * Continuous edits (slider drags, curve-point drags) update the project live without flooding the
 * undo history: the gesture's start state is remembered, intermediate states replace the present,
 * and the end collapses everything into a single undo step.
 */
import type { Project } from '@/project/schema/types';
import { useProjectStore } from '@/state/project-store';
import { useEditorUi } from '../editor-ui-store';

let gestureStart: Project | null = null;

export function beginGesture() {
  gestureStart ??= useProjectStore.getState().history?.present ?? null;
}

/** Apply during a gesture (or as a one-off undoable edit when no gesture is active). */
export function liveEdit(fn: (p: Project) => Project) {
  const store = useProjectStore.getState();
  try {
    store.apply(fn, { undoable: gestureStart == null });
  } catch (e) {
    useEditorUi.getState().notify(e instanceof Error ? e.message : String(e));
  }
}

export function endGesture() {
  const start = gestureStart;
  gestureStart = null;
  const store = useProjectStore.getState();
  const final = store.history?.present;
  if (!start || !final || final === start) return;
  store.apply(() => start, { undoable: false });
  store.apply(() => final);
}

/** Props for a range input that edits live and commits one undo step per drag. */
export function gestureProps(onValue: (v: number) => void) {
  return {
    onPointerDown: beginGesture,
    onKeyDown: beginGesture,
    onChange: (e: { target: { value: string } }) => onValue(Number(e.target.value)),
    onPointerUp: endGesture,
    onKeyUp: endGesture,
    onBlur: endGesture,
  };
}
