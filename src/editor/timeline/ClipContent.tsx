import { memo, useEffect, useRef } from 'react';
import type { WaveformData } from '@/media-engine';
import type { Filmstrip } from '@/state/library-store';

/** Canvas width cap. Past this the waveform is drawn at reduced resolution and stretched. */
const MAX_CANVAS_PX = 4096;

/**
 * Filmstrip for a video clip: one tile per ~tileWidth px, each showing the source frame nearest
 * to the tile's source time (accounts for sourceIn and speed).
 */
export const FilmstripTiles = memo(function FilmstripTiles(props: {
  strip: Filmstrip;
  width: number;
  height: number;
  sourceIn: number; // seconds
  span: number; // seconds of source covered by the clip
}) {
  const { strip, width, height, sourceIn, span } = props;
  const tileW = Math.max(24, Math.round(height * (16 / 9)));
  const count = Math.max(1, Math.min(200, Math.ceil(width / tileW)));
  const n = strip.urls.length;
  return (
    <div className="pointer-events-none absolute inset-0 flex overflow-hidden opacity-55">
      {Array.from({ length: count }, (_, i) => {
        const t = sourceIn + ((i + 0.5) / count) * span;
        const idx = Math.max(0, Math.min(n - 1, Math.floor((t / strip.duration) * n)));
        return <img key={i} src={strip.urls[idx]} alt="" draggable={false} className="h-full shrink-0 object-cover" style={{ width: tileW }} />;
      })}
    </div>
  );
});

/** Peak waveform for the part of the source a clip uses. */
export const Waveform = memo(function Waveform(props: { data: WaveformData; width: number; height: number; sourceIn: number; span: number; gain: number }) {
  const { data, width, height, sourceIn, span, gain } = props;
  const ref = useRef<HTMLCanvasElement>(null);
  const pxW = Math.max(1, Math.min(MAX_CANVAS_PX, Math.round(width)));
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(pxW * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, pxW, height);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    const mid = height / 2;
    const { peaks, peaksPerSecond } = data;
    for (let x = 0; x < pxW; x++) {
      // Max over the peaks that fall in this pixel column.
      const t0 = sourceIn + (x / pxW) * span;
      const t1 = sourceIn + ((x + 1) / pxW) * span;
      let i0 = Math.floor(t0 * peaksPerSecond);
      const i1 = Math.max(i0 + 1, Math.ceil(t1 * peaksPerSecond));
      let peak = 0;
      for (; i0 < i1 && i0 < peaks.length; i0++) if (i0 >= 0 && peaks[i0]! > peak) peak = peaks[i0]!;
      const h = Math.min(mid, (peak / 255) * mid * gain);
      if (h > 0.25) ctx.fillRect(x, mid - h, 1, h * 2);
    }
  }, [data, pxW, height, sourceIn, span, gain]);
  return <canvas ref={ref} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />;
});
