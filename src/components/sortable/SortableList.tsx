/**
 * Drag-to-reorder list/grid used wherever order matters (merge, slideshow, GIF frames, media library).
 *
 * - Mouse/touch/pen: press and drag an item (anywhere except its buttons). Other items move aside to
 *   show where it will land; release to drop, Esc to cancel. The page auto-scrolls near the edges.
 * - Keyboard: focus an item, press Space or Enter to pick it up, arrow keys to move, Space/Enter to
 *   drop, Esc to cancel. Alt + arrow moves it one step directly. Every move is announced to screen readers.
 */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { cn } from '@/utils/id';

export interface SortableListProps<T> {
  items: readonly T[];
  getKey(item: T): string;
  /** Accessible name for an item, used in announcements ("Moved beach.jpg to position 3 of 8"). */
  getLabel(item: T): string;
  renderItem(item: T, state: { index: number; dragging: boolean; lifted: boolean }): ReactNode;
  onMove(from: number, to: number): void;
  layout?: 'list' | 'grid';
  /** Accessible name of the whole list. */
  label: string;
  className?: string;
}

/** Move an element within an array (pure). */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [x] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(next.length, to)), 0, x!);
  return next;
}

interface Drag {
  from: number;
  to: number;
  dx: number;
  dy: number;
  rects: DOMRect[];
  pointer: { x: number; y: number };
  /** Page scroll since the rects were measured. */
  scroll: number;
}

const INTERACTIVE = 'button, a, input, select, textarea, [data-no-drag]';

export function SortableList<T>({ items, getKey, getLabel, renderItem, onMove, layout = 'list', label, className }: SortableListProps<T>) {
  const ref = useRef<HTMLOListElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;
  const [lifted, setLifted] = useState<number | null>(null);
  const [liftedTo, setLiftedTo] = useState<number | null>(null);
  const [announce, setAnnounce] = useState('');

  const say = useCallback((m: string) => setAnnounce(m), []);

  /** Target slot for a pointer position: the slot whose centre is nearest (grid) or the row it is over (list). */
  const targetFor = (x: number, y: number, rects: DOMRect[], from: number): number => {
    let best = from;
    let bestD = Infinity;
    rects.forEach((r, i) => {
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const d = layout === 'grid' ? (x - cx) ** 2 + (y - cy) ** 2 : Math.abs(y - cy);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  };

  const onPointerDown = (e: PointerEvent<HTMLLIElement>, index: number) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest(INTERACTIVE)) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const startScroll = window.scrollY;
    let started = false;
    let raf = 0;
    const els = Array.from(ref.current?.children ?? []) as HTMLElement[];
    const move = (ev: globalThis.PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!started) {
        if (Math.hypot(dx, dy) < 5) return;
        started = true;
        document.body.style.userSelect = 'none';
      }
      ev.preventDefault();
      const rects = dragRef.current?.rects ?? els.map((el) => el.getBoundingClientRect());
      // Rects are captured at drag start; compare in those coordinates by undoing scroll since then.
      const scroll = window.scrollY - startScroll;
      const to = targetFor(ev.clientX, ev.clientY + scroll, rects, index);
      setDrag({ from: index, to, dx, dy, rects, pointer: { x: ev.clientX, y: ev.clientY }, scroll });
      // Auto-scroll the page when the pointer nears the viewport edges.
      cancelAnimationFrame(raf);
      const edge = 60;
      const speed = ev.clientY < edge ? -(edge - ev.clientY) : ev.clientY > window.innerHeight - edge ? ev.clientY - (window.innerHeight - edge) : 0;
      if (speed) {
        const step = () => {
          window.scrollBy(0, speed / 3);
          raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', esc, true);
      cancelAnimationFrame(raf);
      document.body.style.userSelect = '';
      const d = dragRef.current;
      setDrag(null);
      if (started && d && d.to !== d.from) {
        onMove(d.from, d.to);
        say(`Moved ${getLabel(items[d.from]!)} to position ${d.to + 1} of ${items.length}.`);
      }
    };
    const cancel = () => {
      dragRef.current = null;
      setDrag(null);
      up();
    };
    const esc = (ev: globalThis.KeyboardEvent) => {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        cancel();
        say('Move cancelled.');
      }
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', esc, true);
  };

  const focusItem = (i: number) => requestAnimationFrame(() => (ref.current?.children[i] as HTMLElement | undefined)?.focus());

  const onKeyDown = (e: KeyboardEvent<HTMLLIElement>, index: number) => {
    if ((e.target as HTMLElement) !== e.currentTarget) return; // keys inside item controls
    const prevKeys = layout === 'grid' ? ['ArrowLeft', 'ArrowUp'] : ['ArrowUp'];
    const nextKeys = layout === 'grid' ? ['ArrowRight', 'ArrowDown'] : ['ArrowDown'];
    const dir = prevKeys.includes(e.key) ? -1 : nextKeys.includes(e.key) ? 1 : 0;
    if (lifted != null) {
      e.preventDefault();
      if (dir) {
        const to = Math.max(0, Math.min(items.length - 1, (liftedTo ?? lifted) + dir));
        setLiftedTo(to);
        say(`${getLabel(items[lifted]!)}: position ${to + 1} of ${items.length}.`);
      } else if (e.key === ' ' || e.key === 'Enter') {
        const to = liftedTo ?? lifted;
        if (to !== lifted) onMove(lifted, to);
        say(`Dropped ${getLabel(items[lifted]!)} at position ${to + 1} of ${items.length}.`);
        setLifted(null);
        setLiftedTo(null);
        focusItem(to);
      } else if (e.key === 'Escape') {
        say('Move cancelled.');
        setLifted(null);
        setLiftedTo(null);
      }
      return;
    }
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      setLifted(index);
      setLiftedTo(index);
      say(`Picked up ${getLabel(items[index]!)}, position ${index + 1} of ${items.length}. Use the arrow keys to move, Space to drop, Escape to cancel.`);
    } else if (e.altKey && dir) {
      e.preventDefault();
      const to = Math.max(0, Math.min(items.length - 1, index + dir));
      if (to !== index) {
        onMove(index, to);
        say(`Moved ${getLabel(items[index]!)} to position ${to + 1} of ${items.length}.`);
        focusItem(to);
      }
    } else if (dir) {
      e.preventDefault();
      focusItem(Math.max(0, Math.min(items.length - 1, index + dir)));
    }
  };

  // Display order while dragging (pointer) or while an item is lifted (keyboard).
  const from = drag?.from ?? lifted;
  const to = drag?.to ?? liftedTo;
  const order = from != null && to != null && from !== to ? moveItem(items.map((_, i) => i), from, to) : items.map((_, i) => i);

  useEffect(() => {
    if (lifted != null && lifted >= items.length) {
      setLifted(null);
      setLiftedTo(null);
    }
  }, [items.length, lifted]);

  return (
    <>
      <ol
        ref={ref}
        aria-label={label}
        aria-describedby={`${label.replace(/\W+/g, '-')}-help`}
        className={cn(layout === 'grid' ? 'grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-2' : 'space-y-1.5', className)}
      >
        {order.map((i, pos) => {
          const item = items[i]!;
          const isDragged = drag?.from === i;
          const isLifted = lifted === i;
          return (
            <li
              key={getKey(item)}
              tabIndex={0}
              aria-roledescription="sortable item"
              aria-label={`${getLabel(item)}, position ${pos + 1} of ${items.length}`}
              aria-grabbed={isLifted || isDragged}
              data-sortable-index={pos}
              onPointerDown={(e) => onPointerDown(e, i)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={cn(
                'relative cursor-grab touch-none rounded-md outline-none transition-[box-shadow,opacity] focus-visible:ring-2 focus-visible:ring-accent active:cursor-grabbing',
                isDragged && 'opacity-40',
                isLifted && 'ring-2 ring-accent',
              )}
            >
              {renderItem(item, { index: pos, dragging: isDragged, lifted: isLifted })}
            </li>
          );
        })}
      </ol>
      {drag && drag.from !== drag.to && <DropHint rect={drag.rects[drag.to]!} scroll={drag.scroll} />}
      {drag && <Ghost drag={drag} element={ref.current?.querySelector<HTMLElement>(`[data-sortable-index="${order.indexOf(drag.from)}"]`) ?? null} />}
      <p id={`${label.replace(/\W+/g, '-')}-help`} className="sr-only">
        Drag to reorder, or focus an item and press Space to pick it up, the arrow keys to move it and Space to drop it.
      </p>
      <p className="sr-only" aria-live="assertive">
        {announce}
      </p>
    </>
  );
}

/** Floating copy of the dragged item under the pointer. */
function Ghost({ drag, element }: { drag: Drag; element: HTMLElement | null }) {
  const r = drag.rects[drag.from];
  if (!r || !element) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed z-[60] rounded-md opacity-90 shadow-2xl ring-2 ring-accent"
      style={{ left: r.left + drag.dx, top: r.top + drag.dy, width: r.width, height: r.height, transform: 'rotate(1.5deg) scale(1.02)' }}
      // A static clone keeps the ghost cheap: no React subtree, no media re-decoding.
      ref={(el) => {
        if (el && !el.firstChild) {
          const clone = element.cloneNode(true) as HTMLElement;
          clone.querySelectorAll('video').forEach((v) => v.remove());
          clone.style.width = '100%';
          clone.style.height = '100%';
          el.appendChild(clone);
        }
      }}
    />
  );
}

/** Outline of the slot where the item will land. */
function DropHint({ rect, scroll }: { rect: DOMRect; scroll: number }) {
  return <div aria-hidden className="pointer-events-none fixed z-[55] rounded-md border-2 border-dashed border-accent bg-accent/10" style={{ left: rect.left, top: rect.top - scroll, width: rect.width, height: rect.height }} />;
}
