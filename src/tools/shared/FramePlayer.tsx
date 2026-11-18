import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react';
import { IconButton, Kbd } from '@/components/ui/primitives';

export interface FramePlayerHandle {
  seek(t: number): void;
  step(frames: number): void;
  play(from?: number, until?: number): void;
  pause(): void;
  readonly time: number;
}

interface FramePlayerProps {
  src: string;
  duration: number;
  fps: number;
  onTime?(t: number): void;
  /** Extra transport buttons rendered after the built-ins. */
  children?: ReactNode;
}

/** Snap a time to the start of the frame that contains it (with a tiny epsilon for float error). */
export function frameStart(t: number, fps: number): number {
  return Math.floor(t * fps + 1e-6) / fps;
}

export function formatFrameTime(t: number, fps: number): string {
  const f = Math.floor(t * fps + 1e-6);
  const fr = Math.round(fps);
  const s = Math.floor(f / fr);
  const ff = f % fr;
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${h > 0 ? `${h}:` : ''}${p(m % 60)}:${p(s % 60)}.${p(ff)}`;
}

/**
 * Preview player with frame stepping. Seeks target the middle of a frame so browsers
 * show that frame rather than its neighbour. Keyboard: Space play/pause, ←/→ one frame
 * (Shift: one second).
 */
export const FramePlayer = forwardRef<FramePlayerHandle, FramePlayerProps>(function FramePlayer({ src, duration, fps, onTime, children }, ref) {
  const video = useRef<HTMLVideoElement>(null);
  const until = useRef<number | null>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timeRef = useRef(0);

  const report = useCallback(
    (t: number) => {
      timeRef.current = t;
      setTime(t);
      onTime?.(t);
    },
    [onTime],
  );

  const seek = useCallback(
    (t: number) => {
      const v = video.current;
      if (!v) return;
      const clamped = Math.max(0, Math.min(duration - 1e-3, t));
      const start = frameStart(clamped, fps);
      v.currentTime = Math.min(duration - 1e-3, start + 0.5 / fps);
      report(start);
    },
    [duration, fps, report],
  );

  useImperativeHandle(
    ref,
    () => ({
      seek,
      step: (n) => seek(timeRef.current + n / fps),
      play: (from, end) => {
        const v = video.current;
        if (!v) return;
        if (from != null) v.currentTime = from + 0.5 / fps;
        until.current = end ?? null;
        void v.play();
      },
      pause: () => video.current?.pause(),
      get time() {
        return timeRef.current;
      },
    }),
    [seek, fps],
  );

  // While playing, follow the media clock per animation frame (timeupdate is only ~4 Hz).
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const v = video.current;
      if (v) {
        if (until.current != null && v.currentTime >= until.current) {
          v.pause();
          until.current = null;
        }
        report(frameStart(v.currentTime, fps));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, fps, report]);

  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) {
      until.current = null;
      void v.play();
    } else v.pause();
  };

  return (
    <div
      className="overflow-hidden rounded-lg border border-line bg-black outline-none focus-visible:ring-2 focus-visible:ring-accent"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.target instanceof HTMLInputElement) return;
        if (e.key === ' ') toggle();
        else if (e.key === 'ArrowLeft') seek(timeRef.current - (e.shiftKey ? 1 : 1 / fps));
        else if (e.key === 'ArrowRight') seek(timeRef.current + (e.shiftKey ? 1 : 1 / fps));
        else return;
        e.preventDefault();
      }}
    >
      <video
        ref={video}
        src={src}
        preload="auto"
        playsInline
        className="mx-auto block max-h-[52vh] w-full"
        onPlay={() => setPlaying(true)}
        onPause={() => {
          setPlaying(false);
          const v = video.current;
          if (v) report(frameStart(v.currentTime, fps));
        }}
        onClick={toggle}
      />
      <div className="theme-dark flex flex-wrap items-center gap-1 border-t border-line bg-surface px-2 py-1.5 text-fg">
        <IconButton label="Previous frame (←)" onClick={() => seek(timeRef.current - 1 / fps)}>
          ‹
        </IconButton>
        <IconButton label={playing ? 'Pause (Space)' : 'Play (Space)'} onClick={toggle}>
          {playing ? '❚❚' : '▶'}
        </IconButton>
        <IconButton label="Next frame (→)" onClick={() => seek(timeRef.current + 1 / fps)}>
          ›
        </IconButton>
        <span className="ml-1 font-mono text-xs tabular" aria-label="Current time">
          {formatFrameTime(time, fps)} <span className="text-faint">/ {formatFrameTime(duration, fps)}</span>
        </span>
        <span className="ml-1 hidden text-2xs text-faint md:inline">
          <Kbd>←</Kbd> <Kbd>→</Kbd> frame · <Kbd>Shift</Kbd> 1 s
        </span>
        <div className="ml-auto flex items-center gap-1">{children}</div>
      </div>
    </div>
  );
});
