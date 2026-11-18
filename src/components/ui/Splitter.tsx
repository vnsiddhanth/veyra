import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/utils/id';

/** Persisted panel size (px). Falls back to the default when storage is unavailable. */
export function usePanelSize(key: string, initial: number, min: number, max: number) {
  const [size, setSize] = useState(() => {
    try {
      const v = Number(localStorage.getItem(`veyra.panel.${key}`));
      return Number.isFinite(v) && v >= min && v <= max ? v : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(`veyra.panel.${key}`, String(Math.round(size)));
    } catch {
      /* private mode */
    }
  }, [key, size]);
  const set = useCallback((v: number) => setSize(Math.min(max, Math.max(min, v))), [min, max]);
  return [size, set] as const;
}

interface SplitterProps {
  orientation: 'vertical' | 'horizontal'; // vertical = drag left/right
  /** Called with the pointer delta (px) since drag start, plus the size at drag start. */
  onResize(startSize: number, delta: number): void;
  size: number;
  label: string;
  /** +1 when dragging right/down grows the panel, -1 when it shrinks it. */
  direction?: 1 | -1;
}

/** Drag handle between panels. Keyboard accessible (arrows resize by 16px). */
export function Splitter({ orientation, onResize, size, label, direction = 1 }: SplitterProps) {
  const start = useRef<{ pos: number; size: number } | null>(null);
  const [active, setActive] = useState(false);
  const vertical = orientation === 'vertical';
  return (
    <div
      role="separator"
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      aria-label={label}
      aria-valuenow={Math.round(size)}
      tabIndex={0}
      className={cn(
        'group relative z-10 shrink-0 bg-line transition-colors hover:bg-accent/60 focus-visible:bg-accent',
        vertical ? 'w-px cursor-col-resize' : 'h-px cursor-row-resize',
        active && 'bg-accent',
      )}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { pos: vertical ? e.clientX : e.clientY, size };
        setActive(true);
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        const delta = (vertical ? e.clientX : e.clientY) - start.current.pos;
        onResize(start.current.size, delta * direction);
      }}
      onPointerUp={() => {
        start.current = null;
        setActive(false);
      }}
      onKeyDown={(e) => {
        const grow = vertical ? 'ArrowRight' : 'ArrowDown';
        const shrink = vertical ? 'ArrowLeft' : 'ArrowUp';
        if (e.key === grow) onResize(size, 16 * direction);
        else if (e.key === shrink) onResize(size, -16 * direction);
        else return;
        e.preventDefault();
      }}
    >
      {/* Wider invisible hit area */}
      <div className={cn('absolute', vertical ? '-left-1.5 -right-1.5 inset-y-0' : '-top-1.5 -bottom-1.5 inset-x-0')} />
    </div>
  );
}
