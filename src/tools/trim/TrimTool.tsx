import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/primitives';
import { mediaEngine, type ConvertResult, type CopyPolicy, type OutputContainer } from '@/media-engine';
import { formatDuration } from '@/utils/format';
import { cn } from '@/utils/id';
import { FramePlayer, formatFrameTime, frameStart, type FramePlayerHandle } from '../shared/FramePlayer';
import { ConvertResultCard, ErrorBox, JobProgress, SourceDrop } from '../shared/ToolParts';
import { useMediaJob } from '../shared/useMediaJob';
import { useSource } from '../shared/useSource';

const ACCEPT = 'video/*,.mp4,.mov,.m4v,.webm,.mkv,.ts,.mts,.m2ts';

function sourceContainer(mime: string): OutputContainer {
  if (mime.includes('quicktime')) return 'mov';
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('matroska')) return 'mkv';
  return 'mp4';
}

function baseName(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(0, i) : name;
}

export function TrimTool() {
  const { source, open, clear } = useSource(true);
  const job = useMediaJob<ConvertResult>((r) => void mediaEngine.releaseOutput(r));
  const player = useRef<FramePlayerHandle>(null);
  const [now, setNow] = useState(0);
  const [range, setRange] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
  const [precision, setPrecision] = useState<CopyPolicy>('accurate');
  const [format, setFormat] = useState<'same' | OutputContainer>('same');
  const [strip, setStrip] = useState<string[]>([]);

  const info = source.status === 'ready' ? source.info : null;
  const fps = info?.video[0]?.frameRate?.bestGuess || 30;
  const duration = info?.duration ?? 0;

  // Initialise the range and a filmstrip when a new file is ready.
  useEffect(() => {
    if (source.status !== 'ready') return;
    setRange({ start: 0, end: source.info.duration });
    setNow(0);
    const thumbs = mediaEngine.thumbnails(source.file, { count: 12, width: 120 }, 'interactive');
    let urls: string[] = [];
    thumbs.result.then(
      (t) => {
        urls = t.map((x) => URL.createObjectURL(x.blob));
        setStrip(urls);
      },
      () => setStrip([]),
    );
    return () => {
      thumbs.cancel();
      urls.forEach((u) => URL.revokeObjectURL(u));
      setStrip([]);
    };
  }, [source]);

  const setStart = useCallback((t: number) => setRange((r) => ({ start: Math.max(0, Math.min(frameStart(t, fps), r.end - 1 / fps)), end: r.end })), [fps]);
  const setEnd = useCallback(
    // The end is exclusive: "end at this frame" means include the frame shown, so add one frame.
    (t: number) => setRange((r) => ({ start: r.start, end: Math.min(duration, Math.max(frameStart(t, fps), r.start + 1 / fps)) })),
    [duration, fps],
  );

  // I / O keyboard shortcuts while the tool is open.
  useEffect(() => {
    if (!info) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.ctrlKey || e.metaKey) return;
      if (e.key === 'i' || e.key === 'I') setStart(player.current?.time ?? 0);
      else if (e.key === 'o' || e.key === 'O') setEnd((player.current?.time ?? 0) + 1 / fps);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [info, setStart, setEnd, fps]);

  const container: OutputContainer = format === 'same' && info ? sourceContainer(info.mimeType) : (format as OutputContainer);
  const length = range.end - range.start;
  const isFull = range.start <= 1e-6 && range.end >= duration - 1e-6;

  const exportTrim = () => {
    if (source.status !== 'ready') return;
    job.run(() =>
      mediaEngine.convert(source.file, {
        container,
        trim: { start: range.start, end: range.end },
        copy: precision,
        fileName: `${baseName(source.file.name)}-trim`,
      }),
    );
  };

  if (source.status === 'empty') return <SourceDrop onFile={open} accept={ACCEPT} />;
  if (source.status === 'probing') return <p className="rounded-lg border border-line bg-surface p-6 text-sm text-muted">Reading {source.file.name}…</p>;
  if (source.status === 'error')
    return (
      <ErrorBox error={source.error}>
        <Button size="sm" className="mt-2" onClick={clear}>
          Choose another file
        </Button>
      </ErrorBox>
    );

  const busy = job.state.status === 'running';
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        <span className="min-w-0 truncate font-medium">{source.file.name}</span>
        <span className="shrink-0 text-xs text-muted">
          {source.info.width}×{source.info.height} · {formatDuration(duration, 2)} · {Number(fps.toFixed(3))} fps
        </span>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => (job.reset(), clear())} disabled={busy}>
          Change file
        </Button>
      </div>

      <FramePlayer ref={player} src={source.url} duration={duration} fps={fps} onTime={setNow}>
        <Button size="sm" onClick={() => setStart(now)} title="Set start to the current frame (I)">
          Set start <span className="text-faint">I</span>
        </Button>
        <Button size="sm" onClick={() => setEnd(now + 1 / fps)} title="Set end after the current frame (O)">
          Set end <span className="text-faint">O</span>
        </Button>
        <Button size="sm" onClick={() => player.current?.play(range.start, range.end)}>
          Play selection
        </Button>
      </FramePlayer>

      <RangeBar duration={duration} range={range} now={now} strip={strip} onSeek={(t) => player.current?.seek(t)} onStart={setStart} onEnd={setEnd} />

      <div className="grid gap-4 rounded-lg border border-line bg-surface p-4 md:grid-cols-3">
        <TimeField label="Start" value={range.start} fps={fps} onChange={setStart} />
        <TimeField label="End" value={range.end} fps={fps} onChange={setEnd} />
        <div className="text-sm">
          <span className="mb-1 block text-xs text-muted">Length</span>
          <span className="font-mono tabular">{formatFrameTime(length, fps)}</span>{' '}
          <span className="text-xs text-faint">({Math.round(length * fps)} frames)</span>
        </div>
        <fieldset className="md:col-span-2">
          <legend className="mb-1 text-xs text-muted">Precision</legend>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['accurate', 'Frame-accurate', 'Cuts exactly where you set. Re-encodes only when it must.'],
                ['fast', 'Fast', 'Never re-encodes. Copies the original video, so quality is untouched.'],
              ] as const
            ).map(([value, label, hint]) => (
              <label key={value} className={cn('flex flex-1 cursor-pointer gap-2 rounded-md border p-2.5 text-sm', precision === value ? 'border-accent bg-accent-soft/40' : 'border-line')}>
                <input type="radio" name="precision" value={value} checked={precision === value} onChange={() => setPrecision(value)} className="mt-0.5 accent-[var(--c-accent)]" />
                <span>
                  <span className="block font-medium">{label}</span>
                  <span className="block text-xs text-muted">{hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-muted">Output format</span>
          <select value={format} onChange={(e) => setFormat(e.target.value as typeof format)} className="h-9 w-full rounded-md border border-line bg-surface-2 px-2">
            <option value="same">Same as source ({sourceContainer(source.info.mimeType).toUpperCase()})</option>
            <option value="mp4">MP4</option>
            <option value="webm">WebM</option>
            <option value="mov">MOV</option>
            <option value="mkv">MKV</option>
          </select>
        </label>
      </div>

      {job.state.status === 'done' ? (
        <ConvertResultCard result={job.state.result} onReset={job.reset} resetLabel="Trim again" />
      ) : (
        <>
          <JobProgress state={job.state} onCancel={job.cancel} label="Trimming" />
          {job.state.status === 'error' && <ErrorBox error={job.state.error} />}
          {job.state.status === 'cancelled' && <p className="text-sm text-muted">Cancelled. Nothing was saved.</p>}
          {!busy && (
            <div className="flex items-center gap-3">
              <Button variant="primary" size="lg" onClick={exportTrim} disabled={length <= 0 || isFull}>
                Trim and export
              </Button>
              {isFull && <span className="text-xs text-muted">Set a start or end point first.</span>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TimeField({ label, value, fps, onChange }: { label: string; value: number; fps: number; onChange(t: number): void }) {
  const [text, setText] = useState(value.toFixed(3));
  useEffect(() => setText(value.toFixed(3)), [value]);
  return (
    <label className="text-sm">
      <span className="mb-1 block text-xs text-muted">
        {label} <span className="font-mono text-faint">{formatFrameTime(value, fps)}</span>
      </span>
      <input
        inputMode="decimal"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const n = Number(text);
          if (Number.isFinite(n)) onChange(n);
          else setText(value.toFixed(3));
        }}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        aria-label={`${label} time in seconds`}
        className="h-9 w-full rounded-md border border-line bg-surface-2 px-2 font-mono tabular"
      />
    </label>
  );
}

/** Range selector over a filmstrip: drag handles to trim, click to seek. */
function RangeBar(props: {
  duration: number;
  range: { start: number; end: number };
  now: number;
  strip: string[];
  onSeek(t: number): void;
  onStart(t: number): void;
  onEnd(t: number): void;
}) {
  const { duration, range, now, strip, onSeek, onStart, onEnd } = props;
  const bar = useRef<HTMLDivElement>(null);
  const drag = useRef<'start' | 'end' | null>(null);
  const pct = (t: number) => `${(duration > 0 ? t / duration : 0) * 100}%`;
  const timeAt = (clientX: number) => {
    const r = bar.current!.getBoundingClientRect();
    return Math.max(0, Math.min(duration, ((clientX - r.left) / r.width) * duration));
  };
  const handle = useMemo(
    () => (which: 'start' | 'end') => ({
      onPointerDown: (e: React.PointerEvent) => {
        e.stopPropagation();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        drag.current = which;
      },
    }),
    [],
  );
  return (
    <div
      ref={bar}
      className="relative h-14 cursor-pointer select-none overflow-hidden rounded-md border border-line bg-black"
      onPointerDown={(e) => onSeek(timeAt(e.clientX))}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const t = timeAt(e.clientX);
        if (drag.current === 'start') onStart(t);
        else onEnd(t);
        onSeek(drag.current === 'start' ? t : Math.max(0, t - 1e-3));
      }}
      onPointerUp={() => (drag.current = null)}
      role="group"
      aria-label="Trim range"
    >
      <div className="absolute inset-0 flex">
        {strip.map((u, i) => (
          <img key={i} src={u} alt="" draggable={false} className="h-full min-w-0 flex-1 object-cover opacity-80" />
        ))}
      </div>
      <div className="absolute inset-y-0 left-0 bg-black/70" style={{ width: pct(range.start) }} />
      <div className="absolute inset-y-0 right-0 bg-black/70" style={{ left: pct(range.end) }} />
      <div className="absolute inset-y-0 border-y-2 border-accent" style={{ left: pct(range.start), right: `calc(100% - ${pct(range.end)})` }} />
      {(['start', 'end'] as const).map((w) => (
        <div
          key={w}
          {...handle(w)}
          role="slider"
          aria-label={w === 'start' ? 'Trim start' : 'Trim end'}
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={w === 'start' ? range.start : range.end}
          className="absolute inset-y-0 w-3 -translate-x-1/2 cursor-ew-resize rounded-sm bg-accent"
          style={{ left: pct(w === 'start' ? range.start : range.end) }}
        />
      ))}
      <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white" style={{ left: pct(now) }} />
    </div>
  );
}
