/**
 * Live preview for single-video compositions (text, watermark, looks, subtitles): plays the source
 * in a hidden <video> and draws every frame through the same Compositor the exporter uses, so the
 * preview shows exactly what will be rendered.
 */
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/primitives';
import type { Project } from '@/project/schema/types';
import { Compositor, type LayerImage } from '@/render/compositor';
import { resolveFrame } from '@/render/evaluate';
import { formatDuration } from '@/utils/format';
import { secondsToFlicks } from '@/utils/time';

export function CompositionPreview({
  project,
  videoUrl,
  videoAssetId,
  stills,
  duration,
}: {
  project: Project;
  videoUrl: string | null;
  /** The asset whose frames come from the <video> element. */
  videoAssetId: string | null;
  /** Decoded stills by asset id (watermarks, slideshow images). */
  stills?: ReadonlyMap<string, ImageBitmap>;
  duration: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const compRef = useRef<Compositor | null>(null);
  const projectRef = useRef(project);
  projectRef.current = project;
  const stillsRef = useRef(stills);
  stillsRef.current = stills;
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timeRef = useRef(0);

  const W = Math.min(960, project.settings.width);
  const H = Math.round((W * project.settings.height) / project.settings.width);

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!compRef.current || compRef.current.canvas !== canvas) compRef.current = new Compositor(canvas);
    const p = projectRef.current;
    const v = videoRef.current;
    const t = v && videoAssetId ? v.currentTime : timeRef.current;
    const layers = resolveFrame(p, secondsToFlicks(t));
    const images = new Map<string, LayerImage>();
    for (const l of layers) {
      if (l.asset && l.asset.id === videoAssetId && v && v.readyState >= 2) {
        images.set(l.clip.id, { source: v as unknown as LayerImage['source'], width: v.videoWidth, height: v.videoHeight });
      } else if (l.asset && stillsRef.current?.has(l.asset.id)) {
        const b = stillsRef.current.get(l.asset.id)!;
        images.set(l.clip.id, { source: b, width: b.width, height: b.height });
      }
    }
    compRef.current.render(p, layers, images, Math.round(t * 30));
  };

  // Redraw whenever the composition changes.
  useEffect(draw);

  useEffect(() => {
    const v = videoRef.current;
    if (!playing) return;
    let raf = 0;
    const start = performance.now() - timeRef.current * 1000;
    const tick = () => {
      if (v && videoAssetId) {
        timeRef.current = v.currentTime;
        if (v.ended) setPlaying(false);
      } else {
        timeRef.current = (performance.now() - start) / 1000;
        if (timeRef.current >= duration) {
          timeRef.current = 0;
          setPlaying(false);
        }
      }
      setTime(timeRef.current);
      draw();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, duration, videoAssetId]);

  const toggle = () => {
    const v = videoRef.current;
    if (playing) {
      v?.pause();
      setPlaying(false);
    } else {
      if (v && videoAssetId) void v.play().catch(() => undefined);
      setPlaying(true);
    }
  };
  const seek = (t: number) => {
    timeRef.current = t;
    setTime(t);
    if (videoRef.current && videoAssetId) videoRef.current.currentTime = t;
    else draw();
  };

  return (
    <div className="space-y-2">
      <canvas ref={canvasRef} width={W} height={H} className="mx-auto block max-h-[420px] w-auto max-w-full rounded-lg bg-black" aria-label="Output preview" />
      {videoUrl && <video ref={videoRef} src={videoUrl} preload="auto" playsInline className="hidden" onSeeked={draw} onLoadedData={draw} />}
      <div className="flex items-center gap-3">
        <Button size="sm" onClick={toggle}>
          {playing ? 'Pause' : 'Play'}
        </Button>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.01}
          value={time}
          onChange={(e) => seek(Number(e.target.value))}
          className="flex-1 accent-[var(--c-accent)]"
          aria-label="Preview position"
        />
        <span className="font-mono text-xs text-muted tabular">
          {formatDuration(time, 2)} / {formatDuration(duration, 2)}
        </span>
      </div>
      <p className="text-xs text-faint">Preview uses the same renderer as the export.</p>
    </div>
  );
}
