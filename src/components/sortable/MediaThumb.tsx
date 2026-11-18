/**
 * Media thumbnail with hover-scrub: move the mouse across a video thumbnail to preview it frame by
 * frame (no click needed). Images show as-is. Uses the browser's own decoder on the local file URL.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/primitives';
import { formatDuration } from '@/utils/format';
import { cn } from '@/utils/id';

export function MediaThumb({ url, kind, duration, name, className }: { url: string | undefined; kind: 'video' | 'image' | 'audio' | string; duration?: number; name: string; className?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [scrub, setScrub] = useState<number | null>(null);
  if (!url) return <div className={cn('aspect-video animate-pulse rounded bg-surface-3', className)} aria-hidden />;
  if (kind === 'image') return <img src={url} alt="" draggable={false} className={cn('aspect-video w-full rounded bg-black object-contain', className)} />;
  if (kind !== 'video') return <div className={cn('flex aspect-video items-center justify-center rounded bg-surface-3 text-xs text-muted', className)}>♪</div>;
  return (
    <div
      className={cn('relative aspect-video overflow-hidden rounded bg-black', className)}
      onPointerMove={(e) => {
        if (e.pointerType !== 'mouse' || !duration) return;
        const r = e.currentTarget.getBoundingClientRect();
        const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
        setScrub(f);
        const v = videoRef.current;
        if (v && Math.abs(v.currentTime - f * duration) > 0.04) v.currentTime = f * duration;
      }}
      onPointerLeave={() => {
        setScrub(null);
        if (videoRef.current && duration) videoRef.current.currentTime = Math.min(duration * 0.1, 1);
      }}
      title={`${name} — move the mouse across to preview`}
    >
      {/* #t= shows a representative frame before any interaction. */}
      <video ref={videoRef} src={`${url}#t=${Math.min((duration ?? 1) * 0.1, 1).toFixed(2)}`} muted playsInline preload="metadata" className="pointer-events-none h-full w-full object-contain" aria-hidden />
      {scrub != null && duration ? (
        <>
          <span className="absolute inset-x-0 bottom-0 h-0.5 bg-white/20" aria-hidden>
            <span className="block h-full bg-accent" style={{ width: `${scrub * 100}%` }} />
          </span>
          <span className="absolute left-1 top-1 rounded-sm bg-black/75 px-1 font-mono text-2xs text-white tabular">{formatDuration(scrub * duration, 1)}</span>
        </>
      ) : null}
      {duration ? <span className="absolute bottom-1 right-1 rounded-sm bg-black/75 px-1 font-mono text-2xs text-white tabular">{formatDuration(duration, 0)}</span> : null}
    </div>
  );
}

export interface LightboxItem {
  url: string | undefined;
  kind: string;
  name: string;
}

/** Full-size preview of one item; ← → step through the list, Esc closes. */
export function Lightbox({ items, index, onIndex, onClose }: { items: LightboxItem[]; index: number; onIndex(i: number): void; onClose(): void }) {
  const ref = useRef<HTMLDivElement>(null);
  const item = items[index];
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') onIndex(Math.min(items.length - 1, index + 1));
      else if (e.key === 'ArrowLeft') onIndex(Math.max(0, index - 1));
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [index, items.length, onClose, onIndex]);
  if (!item) return null;
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`Preview: ${item.name}`} className="flex max-h-full w-full max-w-4xl flex-col gap-2 outline-none">
        <div className="flex items-center gap-2 text-sm text-white">
          <span className="min-w-0 flex-1 truncate">
            {index + 1} / {items.length} · {item.name}
          </span>
          <Button size="sm" onClick={() => onIndex(Math.max(0, index - 1))} disabled={index === 0}>
            ← Previous
          </Button>
          <Button size="sm" onClick={() => onIndex(Math.min(items.length - 1, index + 1))} disabled={index === items.length - 1}>
            Next →
          </Button>
          <Button size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        {item.kind === 'image' ? (
          <img src={item.url} alt={item.name} className="max-h-[80vh] w-full object-contain" />
        ) : item.kind === 'video' ? (
          <video key={item.url} src={item.url} controls autoPlay className="max-h-[80vh] w-full bg-black" />
        ) : (
          <audio key={item.url} src={item.url} controls autoPlay className="w-full" />
        )}
      </div>
    </div>,
    document.body,
  );
}
