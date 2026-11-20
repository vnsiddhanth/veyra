/**
 * Program monitor tools for grading and framing: video scopes (drawn from data the preview worker
 * computes) and framing guides (safe areas, rule of thirds, aspect-ratio masks).
 */
import { useEffect, useRef } from 'react';
import { LEVELS, VS, clipping, luma, type ScopeData } from '@/render/scopes';

export type ScopeKind = 'off' | 'waveform' | 'parade' | 'vectorscope' | 'histogram';
export const SCOPE_OPTIONS: [ScopeKind, string][] = [
  ['off', 'Scopes: off'],
  ['waveform', 'Waveform (luma)'],
  ['parade', 'RGB parade'],
  ['vectorscope', 'Vectorscope'],
  ['histogram', 'Histogram'],
];

export type GuideKind = 'off' | 'safe' | 'thirds' | '2.39' | '1.85' | '4:3' | '1:1' | '9:16';
export const GUIDE_OPTIONS: [GuideKind, string][] = [
  ['off', 'Guides: off'],
  ['safe', 'Title / action safe'],
  ['thirds', 'Rule of thirds'],
  ['2.39', '2.39:1 scope'],
  ['1.85', '1.85:1 flat'],
  ['4:3', '4:3'],
  ['1:1', '1:1 square'],
  ['9:16', '9:16 vertical'],
];

const RATIO: Partial<Record<GuideKind, number>> = { '2.39': 2.39, '1.85': 1.85, '4:3': 4 / 3, '1:1': 1, '9:16': 9 / 16 };

/** Framing guides drawn over the monitor (preview only; nothing is added to the export). */
export function GuidesOverlay({ kind, aspect }: { kind: GuideKind; aspect: number }) {
  if (kind === 'off') return null;
  const line = 'absolute border-white/70';
  if (kind === 'safe')
    return (
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {/* SMPTE ST 2046-1: action safe 93%, title safe 90%. */}
        <div className={`${line} border border-dashed`} style={{ inset: '3.5%' }} />
        <div className={`${line} border`} style={{ inset: '5%' }} />
        <span className="absolute left-[5.5%] top-[5.5%] text-[10px] text-white/80">Title safe</span>
        <span className="absolute left-[4%] top-[1%] text-[10px] text-white/60">Action safe</span>
        <div className="absolute left-1/2 top-1/2 h-4 w-px -translate-x-1/2 -translate-y-1/2 bg-white/70" />
        <div className="absolute left-1/2 top-1/2 h-px w-4 -translate-x-1/2 -translate-y-1/2 bg-white/70" />
      </div>
    );
  if (kind === 'thirds')
    return (
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {[1 / 3, 2 / 3].map((f) => (
          <div key={`v${f}`} className="absolute inset-y-0 w-px bg-white/50" style={{ left: `${f * 100}%` }} />
        ))}
        {[1 / 3, 2 / 3].map((f) => (
          <div key={`h${f}`} className="absolute inset-x-0 h-px bg-white/50" style={{ top: `${f * 100}%` }} />
        ))}
      </div>
    );
  const r = RATIO[kind]!;
  const bar = 'absolute bg-black/75';
  if (r > aspect) {
    const h = ((1 - aspect / r) / 2) * 100;
    return (
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className={`${bar} inset-x-0 top-0 border-b border-white/40`} style={{ height: `${h}%` }} />
        <div className={`${bar} inset-x-0 bottom-0 border-t border-white/40`} style={{ height: `${h}%` }} />
      </div>
    );
  }
  const w = ((1 - r / aspect) / 2) * 100;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className={`${bar} inset-y-0 left-0 border-r border-white/40`} style={{ width: `${w}%` }} />
      <div className={`${bar} inset-y-0 right-0 border-l border-white/40`} style={{ width: `${w}%` }} />
    </div>
  );
}

/** Brightness for a count: square-root response so faint traces stay visible. */
function level(count: number, norm: number): number {
  return count === 0 ? 0 : Math.min(255, Math.round(40 + 215 * Math.sqrt(Math.min(1, count / norm))));
}

function drawTrace(img: ImageData, x0: number, cols: number, data: Uint32Array, offset: number, rowsPerCol: number, rgb: [number, number, number]) {
  const norm = Math.max(1, rowsPerCol * 0.12);
  for (let x = 0; x < cols; x++)
    for (let l = 0; l < LEVELS; l++) {
      const a = level(data[offset + x * LEVELS + l]!, norm);
      if (!a) continue;
      const i = ((LEVELS - 1 - l) * img.width + x0 + x) * 4;
      img.data[i] = Math.min(255, img.data[i]! + (rgb[0] * a) / 255);
      img.data[i + 1] = Math.min(255, img.data[i + 1]! + (rgb[1] * a) / 255);
      img.data[i + 2] = Math.min(255, img.data[i + 2]! + (rgb[2] * a) / 255);
      img.data[i + 3] = 255;
    }
}

/** Vectorscope target for a colour, in VS-cell coordinates (same maths as the worker). */
function vsPoint(r: number, g: number, b: number): [number, number] {
  const y = luma(r, g, b);
  const cb = (b - y) / 1.8556 / 255;
  const cr = (r - y) / 1.5748 / 255;
  return [VS / 2 + cb * VS * 0.95, VS / 2 - cr * VS * 0.95];
}

function drawScope(canvas: HTMLCanvasElement, kind: ScopeKind, d: ScopeData) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const rowsPerCol = d.samples / d.cols;
  if (kind === 'waveform' || kind === 'parade') {
    const w = kind === 'waveform' ? d.cols : d.cols * 3 + 8;
    canvas.width = w;
    canvas.height = LEVELS;
    const img = ctx.createImageData(w, LEVELS);
    if (kind === 'waveform') drawTrace(img, 0, d.cols, d.waveform, 0, rowsPerCol, [140, 255, 160]);
    else
      ([[255, 70, 70], [80, 255, 100], [90, 140, 255]] as [number, number, number][]).forEach((c, k) => drawTrace(img, k * (d.cols + 4), d.cols, d.parade, k * d.cols * LEVELS, rowsPerCol, c));
    ctx.putImageData(img, 0, 0);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = '9px system-ui';
    for (const p of [0, 25, 50, 75, 100]) {
      const y = Math.round(LEVELS - 1 - (p / 100) * 255) + 0.5;
      ctx.fillRect(0, y, w, 1);
      ctx.fillText(String(p), 2, Math.max(9, y - 2));
    }
    return;
  }
  if (kind === 'vectorscope') {
    const S = VS * 2;
    canvas.width = S;
    canvas.height = S;
    const small = ctx.createImageData(VS, VS);
    const norm = Math.max(1, d.samples * 0.002);
    for (let i = 0; i < VS * VS; i++) {
      const a = level(d.vectorscope[i]!, norm);
      if (!a) continue;
      small.data.set([a * 0.6, a, a * 0.7, 255], i * 4);
    }
    const tmp = new OffscreenCanvas(VS, VS);
    tmp.getContext('2d')!.putImageData(small, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, S, S);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(tmp, 0, 0, S, S);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S * 0.475, 0, Math.PI * 2);
    ctx.moveTo(S / 2, 0);
    ctx.lineTo(S / 2, S);
    ctx.moveTo(0, S / 2);
    ctx.lineTo(S, S / 2);
    ctx.stroke();
    // Skin-tone line (the "I" line, about 123° on a hardware scope).
    const [sx, sy] = vsPoint(224, 172, 140);
    const ang = Math.atan2(sy - VS / 2, sx - VS / 2);
    ctx.strokeStyle = 'rgba(255,200,150,0.55)';
    ctx.beginPath();
    ctx.moveTo(S / 2, S / 2);
    ctx.lineTo(S / 2 + Math.cos(ang) * S * 0.475, S / 2 + Math.sin(ang) * S * 0.475);
    ctx.stroke();
    // 75% colour-bar targets.
    ctx.font = '9px system-ui';
    for (const [lbl, c] of [
      ['R', [191, 0, 0]],
      ['Mg', [191, 0, 191]],
      ['B', [0, 0, 191]],
      ['Cy', [0, 191, 191]],
      ['G', [0, 191, 0]],
      ['Yl', [191, 191, 0]],
    ] as [string, [number, number, number]][]) {
      const [x, y] = vsPoint(...c);
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.strokeRect(x * 2 - 4, y * 2 - 4, 8, 8);
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillText(lbl, x * 2 + 6, y * 2 + 3);
    }
    return;
  }
  // Histogram
  const H = 128;
  canvas.width = LEVELS;
  canvas.height = H;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, LEVELS, H);
  let max = 1;
  for (let i = 2; i < 4 * LEVELS - 2; i++) if (i % LEVELS > 1 && i % LEVELS < 254) max = Math.max(max, d.histogram[i]!);
  ctx.globalCompositeOperation = 'lighter';
  (['rgba(255,60,60,0.7)', 'rgba(60,255,90,0.7)', 'rgba(80,130,255,0.7)'] as const).forEach((color, c) => {
    ctx.fillStyle = color;
    for (let x = 0; x < LEVELS; x++) {
      const h = Math.min(H, (d.histogram[c * LEVELS + x]! / max) * H);
      ctx.fillRect(x, H - h, 1, h);
    }
  });
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  for (let x = 0; x < LEVELS; x++) {
    const h = Math.min(H, (d.histogram[3 * LEVELS + x]! / max) * H);
    if (x === 0) ctx.moveTo(x, H - h);
    else ctx.lineTo(x, H - h);
  }
  ctx.stroke();
}

/** Scope display; `data` comes from the preview worker for the frame on screen. */
export function ScopesPanel({ kind, data }: { kind: ScopeKind; data: ScopeData | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current && data && kind !== 'off') drawScope(ref.current, kind, data);
  }, [kind, data]);
  if (kind === 'off') return null;
  const clip = data ? clipping(data) : null;
  const label = SCOPE_OPTIONS.find(([k]) => k === kind)![1];
  return (
    <figure className="pointer-events-none absolute bottom-2 right-2 z-10 w-[min(42%,320px)] rounded-md border border-white/15 bg-black/85 p-1.5 shadow-lg" aria-label={label}>
      <canvas ref={ref} role="img" aria-label={`${label} of the current frame`} className={kind === 'vectorscope' ? 'mx-auto block aspect-square w-3/4' : 'block h-auto w-full'} style={{ imageRendering: 'auto' }} />
      <figcaption className="mt-1 flex justify-between gap-2 font-mono text-[10px] text-white/70">
        <span>{label}</span>
        {clip && (
          <span title="Pixels at pure white / pure black">
            <span className={clip.highlights > 1 ? 'text-warn' : ''}>clip {clip.highlights.toFixed(1)}%</span> ·{' '}
            <span className={clip.shadows > 1 ? 'text-warn' : ''}>crush {clip.shadows.toFixed(1)}%</span>
          </span>
        )}
      </figcaption>
    </figure>
  );
}
