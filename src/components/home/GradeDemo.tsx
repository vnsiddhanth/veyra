/**
 * Homepage demo: grade a real frame with three sliders (or a look) and watch the editor's own
 * waveform and vectorscope respond. Everything runs here in the page; nothing is uploaded.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScopeView } from '@/editor/preview/MonitorOverlays';
import { clipping, computeScopes, type ScopeData } from '@/render/scopes';

interface Grade {
  exposure: number; // stops
  temperature: number; // −100 cool … +100 warm
  saturation: number; // 0 … 2
}

const NEUTRAL: Grade = { exposure: 0, temperature: 0, saturation: 1 };
const LOOKS: [string, Grade][] = [
  ['As shot', NEUTRAL],
  ['Golden hour', { exposure: 0.35, temperature: 55, saturation: 1.2 }],
  ['Moonlight', { exposure: -0.6, temperature: -70, saturation: 0.65 }],
  ['Bleach bypass', { exposure: 0.15, temperature: -10, saturation: 0.35 }],
  ['Overexposed', { exposure: 1.6, temperature: 0, saturation: 1 }],
];

const W = 640;
const H = 360;

function apply(src: Uint8ClampedArray, dst: Uint8ClampedArray, g: Grade) {
  const gain = 2 ** g.exposure;
  const warm = (g.temperature / 100) * 38;
  const sat = g.saturation;
  for (let i = 0; i < src.length; i += 4) {
    let r = src[i]! * gain + warm;
    let gr = src[i + 1]! * gain + warm * 0.25;
    let b = src[i + 2]! * gain - warm;
    const y = 0.2126 * r + 0.7152 * gr + 0.0722 * b;
    r = y + (r - y) * sat;
    gr = y + (gr - y) * sat;
    b = y + (b - y) * sat;
    dst[i] = r;
    dst[i + 1] = gr;
    dst[i + 2] = b;
    dst[i + 3] = 255;
  }
}

export function GradeDemo() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const source = useRef<ImageData | null>(null);
  const [grade, setGrade] = useState<Grade>(NEUTRAL);
  const [scopes, setScopes] = useState<ScopeData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const img = new Image();
    img.src = '/img/dusk-960.webp';
    img
      .decode()
      .then(() => {
        if (!alive) return;
        const c = document.createElement('canvas');
        c.width = W;
        c.height = H;
        const g = c.getContext('2d', { willReadFrequently: true })!;
        g.drawImage(img, 0, 0, W, H);
        source.current = g.getImageData(0, 0, W, H);
        setGrade((x) => ({ ...x }));
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  const render = useCallback((g: Grade) => {
    const c = canvas.current;
    const src = source.current;
    if (!c || !src) return;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    const out = ctx.createImageData(W, H);
    apply(src.data, out.data, g);
    ctx.putImageData(out, 0, 0);
    // Scopes from every other pixel: plenty for the traces, half the work.
    const half = new Uint8ClampedArray((W / 2) * (H / 2) * 4);
    for (let y = 0; y < H / 2; y++)
      for (let x = 0; x < W / 2; x++) {
        const s = ((y * 2) * W + x * 2) * 4;
        half.set(out.data.subarray(s, s + 4), (y * (W / 2) + x) * 4);
      }
    setScopes(computeScopes(half, W / 2, H / 2));
  }, []);

  useEffect(() => {
    const raf = requestAnimationFrame(() => render(grade));
    return () => cancelAnimationFrame(raf);
  }, [grade, render]);

  const clip = scopes ? clipping(scopes) : null;
  const slider = (key: keyof Grade, label: string, min: number, max: number, step: number, fmt: (v: number) => string) => (
    <label className="block">
      <span className="flex justify-between font-mono text-xs text-faint">
        <span>{label}</span>
        <span className="tabular text-muted">{fmt(grade[key])}</span>
      </span>
      <input type="range" className="demo-range" min={min} max={max} step={step} value={grade[key]} onChange={(e) => setGrade((g) => ({ ...g, [key]: Number(e.target.value) }))} aria-label={label} />
    </label>
  );

  return (
    <div className="theme-dark overflow-hidden rounded-lg border border-line-strong bg-[#0b0a09] text-[#efe8dc] shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)]">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2 font-mono text-[11px] text-white/50">
        <span>PROGRAM · dusk_A001_C004</span>
        <span className="tabular">00:00:01:18</span>
      </div>
      <div className="relative">
        <canvas ref={canvas} width={W} height={H} className="block aspect-video w-full" role="img" aria-label="A mountain range at dusk, graded live with the sliders below" />
        {failed && <p className="absolute inset-0 grid place-items-center text-sm text-white/60">The demo frame could not load.</p>}
        {/* 2.39:1 guide, the way the editor draws it. */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[12.8%] border-b border-white/25 bg-black/55" />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[12.8%] border-t border-white/25 bg-black/55" />
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-px border-t border-white/10 bg-white/10">
        <div className="bg-[#0b0a09] p-2">
          <ScopeView kind="waveform" data={scopes} className="[&_canvas]:h-28 [&_canvas]:w-full sm:[&_canvas]:h-32" />
        </div>
        <div className="bg-[#0b0a09] p-2">
          <ScopeView kind="vectorscope" data={scopes} className="[&_canvas]:h-28 [&_canvas]:w-28 sm:[&_canvas]:h-32 sm:[&_canvas]:w-32" />
        </div>
      </div>
      <div className="space-y-3 border-t border-white/10 p-4">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Looks">
          {LOOKS.map(([name, g]) => {
            const on = grade.exposure === g.exposure && grade.temperature === g.temperature && grade.saturation === g.saturation;
            return (
              <button
                key={name}
                type="button"
                aria-pressed={on}
                onClick={() => setGrade(g)}
                className={`rounded-sm border px-2 py-1 font-mono text-[11px] uppercase tracking-wider transition-colors ${on ? 'border-accent bg-accent text-accent-fg' : 'border-white/15 text-white/70 hover:border-white/40 hover:text-white'}`}
              >
                {name}
              </button>
            );
          })}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {slider('exposure', 'Exposure', -2, 2, 0.05, (v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)} st`)}
          {slider('temperature', 'Temperature', -100, 100, 1, (v) => (v === 0 ? '0' : v > 0 ? `+${v} warm` : `${v} cool`))}
          {slider('saturation', 'Saturation', 0, 2, 0.01, (v) => `${Math.round(v * 100)}%`)}
        </div>
        <p className="font-mono text-[11px] leading-relaxed text-white/45" aria-live="polite">
          {clip && (clip.highlights > 1 ? <span className="text-warn">Highlights clipping: {clip.highlights.toFixed(1)}% of the frame is pure white. </span> : clip.shadows > 1 ? <span className="text-warn">Blacks crushed: {clip.shadows.toFixed(1)}%. </span> : null)}
          These are the editor’s real scopes, running in this tab.
        </p>
      </div>
    </div>
  );
}
