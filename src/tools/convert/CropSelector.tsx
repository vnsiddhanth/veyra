import { useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import type { MediaInfo } from '@/media-engine';
import { cn } from '@/utils/id';
import { NumberField, SelectField } from '../shared/controls';

export interface CropRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const RATIOS: [string, number | null][] = [
  ['free', null],
  ['16:9', 16 / 9],
  ['9:16', 9 / 16],
  ['1:1', 1],
  ['4:5', 4 / 5],
  ['4:3', 4 / 3],
];

type Handle = 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'new';

/** Drag a crop rectangle over the video. Coordinates are in display pixels of the source. */
export function CropSelector({ src, info, value, onChange }: { src: string; info: MediaInfo; value: CropRect | null; onChange(r: CropRect): void }) {
  const W = info.width;
  const H = info.height;
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ handle: Handle; start: CropRect; x: number; y: number } | null>(null);
  const [ratio, setRatio] = useState('free');
  const r = value ?? { left: 0, top: 0, width: W, height: H };
  const aspect = RATIOS.find((x) => x[0] === ratio)?.[1] ?? null;

  const clamp = (c: CropRect): CropRect => {
    let { left, top, width, height } = c;
    width = Math.max(16, Math.min(W, width));
    height = Math.max(16, Math.min(H, height));
    if (aspect) {
      if (width / height > aspect) width = height * aspect;
      else height = width / aspect;
    }
    left = Math.max(0, Math.min(W - width, left));
    top = Math.max(0, Math.min(H - height, top));
    return { left: Math.round(left), top: Math.round(top), width: Math.round(width), height: Math.round(height) };
  };

  const toSource = (e: RPointerEvent) => {
    const b = box.current!.getBoundingClientRect();
    return { x: ((e.clientX - b.left) / b.width) * W, y: ((e.clientY - b.top) / b.height) * H };
  };

  const onDown = (handle: Handle) => (e: RPointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const p = toSource(e);
    drag.current = { handle, start: handle === 'new' ? { left: p.x, top: p.y, width: 0, height: 0 } : r, x: p.x, y: p.y };
  };
  const onMove = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = toSource(e);
    const dx = p.x - d.x;
    const dy = p.y - d.y;
    const s = d.start;
    let next: CropRect;
    switch (d.handle) {
      case 'move':
        next = { ...s, left: s.left + dx, top: s.top + dy };
        break;
      case 'new':
        next = { left: Math.min(d.x, p.x), top: Math.min(d.y, p.y), width: Math.abs(dx), height: Math.abs(dy) };
        break;
      case 'se':
        next = { ...s, width: s.width + dx, height: s.height + dy };
        break;
      case 'nw':
        next = { left: s.left + dx, top: s.top + dy, width: s.width - dx, height: s.height - dy };
        break;
      case 'ne':
        next = { left: s.left, top: s.top + dy, width: s.width + dx, height: s.height - dy };
        break;
      case 'sw':
        next = { left: s.left + dx, top: s.top, width: s.width - dx, height: s.height + dy };
        break;
    }
    onChange(clamp(next));
  };
  const onUp = () => (drag.current = null);

  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  return (
    <div className="space-y-3">
      <div
        ref={box}
        className="relative mx-auto max-h-[420px] touch-none select-none overflow-hidden rounded-lg bg-black"
        style={{ aspectRatio: `${W} / ${H}`, maxWidth: `min(100%, ${(420 * W) / H}px)` }}
        onPointerDown={onDown('new')}
        onPointerMove={onMove}
        onPointerUp={onUp}
      >
        <video src={src} muted preload="auto" className="h-full w-full" aria-label="Crop preview" />
        <div
          className="absolute border-2 border-accent shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]"
          style={{ left: pct(r.left, W), top: pct(r.top, H), width: pct(r.width, W), height: pct(r.height, H) }}
          onPointerDown={onDown('move')}
          role="group"
          aria-label="Crop area"
        >
          {(['nw', 'ne', 'sw', 'se'] as const).map((h) => (
            <span
              key={h}
              onPointerDown={onDown(h)}
              className={cn(
                'absolute h-3.5 w-3.5 rounded-sm border border-black bg-accent',
                h[0] === 'n' ? '-top-2' : '-bottom-2',
                h[1] === 'w' ? '-left-2' : '-right-2',
                h === 'nw' || h === 'se' ? 'cursor-nwse-resize' : 'cursor-nesw-resize',
              )}
            />
          ))}
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-5">
        <SelectField
          label="Aspect"
          value={ratio}
          onChange={(v) => {
            setRatio(v);
            const a = RATIOS.find((x) => x[0] === v)?.[1];
            if (a) {
              const w = Math.min(W, H * a);
              onChange({ left: (W - w) / 2, top: (H - w / a) / 2, width: Math.round(w), height: Math.round(w / a) });
            }
          }}
          options={RATIOS.map(([k]) => [k, k === 'free' ? 'Free' : k] as const)}
        />
        <NumberField label="Left" unit="px" value={r.left} min={0} max={W - 16} onChange={(left) => onChange(clamp({ ...r, left }))} />
        <NumberField label="Top" unit="px" value={r.top} min={0} max={H - 16} onChange={(top) => onChange(clamp({ ...r, top }))} />
        <NumberField label="Width" unit="px" value={r.width} min={16} max={W} onChange={(width) => onChange(clamp({ ...r, width }))} />
        <NumberField label="Height" unit="px" value={r.height} min={16} max={H} onChange={(height) => onChange(clamp({ ...r, height }))} />
      </div>
    </div>
  );
}
