import { useEffect, useState } from 'react';
import type { Flicks } from '@/utils/time';
import { useEditorUi } from './editor-ui-store';

/**
 * The playhead for UI that does not need every frame: exact while paused (scrubbing), but updated at
 * most every `intervalMs` during playback so heavy panels do not re-render 60 times a second.
 */
export function useThrottledPlayhead(intervalMs = 250): Flicks {
  const [t, setT] = useState(() => useEditorUi.getState().playhead);
  useEffect(() => {
    let last = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = useEditorUi.subscribe((s, prev) => {
      if (s.playhead === prev.playhead && s.playing === prev.playing) return;
      if (!s.playing) {
        if (timer) clearTimeout(timer);
        timer = null;
        setT(s.playhead);
        return;
      }
      const now = performance.now();
      if (now - last >= intervalMs) {
        last = now;
        setT(s.playhead);
      } else if (!timer) {
        timer = setTimeout(() => {
          timer = null;
          last = performance.now();
          setT(useEditorUi.getState().playhead);
        }, intervalMs - (now - last));
      }
    });
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, [intervalMs]);
  return t;
}
