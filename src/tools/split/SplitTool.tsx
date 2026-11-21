/**
 * Split a video into parts. Each part is an independent, validated `convert` job (run one after
 * another so memory stays bounded); every part gets its own download.
 */
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/primitives';
import { mediaEngine, MediaError, type ConvertResult, type CopyPolicy, type Job } from '@/media-engine';
import { formatBytes, formatDuration } from '@/utils/format';
import { ChoiceGroup, NumberField, Panel, TextField } from '../shared/controls';
import { baseName, ErrorBox, SourceGate, SourceHeader, useObjectUrl, VIDEO_ACCEPT } from '../shared/ToolParts';
import { Progress } from '@/components/ui/primitives';
import { useSource } from '../shared/useSource';

export function splitPoints(duration: number, mode: 'every' | 'parts' | 'at', every: number, parts: number, at: string): number[] {
  let cuts: number[] = [];
  if (mode === 'every' && every > 0) for (let t = every; t < duration - 0.05; t += every) cuts.push(t);
  else if (mode === 'parts') for (let i = 1; i < parts; i++) cuts.push((duration * i) / parts);
  else
    cuts = at
      .split(/[,;\s]+/)
      .map((s) => {
        const m = /^(?:(\d+):)?(\d+(?:\.\d+)?)$/.exec(s.trim());
        return m ? Number(m[1] ?? 0) * 60 + Number(m[2]) : NaN;
      })
      .filter((t) => Number.isFinite(t) && t > 0.05 && t < duration - 0.05)
      .sort((a, b) => a - b);
  return [0, ...cuts, duration];
}

function PartRow({ r, i }: { r: ConvertResult; i: number }) {
  const url = useObjectUrl(r.file);
  return (
    <li className="flex items-center gap-3 rounded-md border border-line bg-surface px-3 py-2 text-sm">
      <span className="w-14 text-faint">Part {i + 1}</span>
      <span className="min-w-0 flex-1 truncate">{r.file.name}</span>
      <span className="text-xs text-muted">
        {formatDuration(r.info.duration, 2)} · {formatBytes(r.file.size)} · {r.checks.filter((c) => c.ok).length}/{r.checks.length} checks
      </span>
      <a href={url ?? undefined} download={r.file.name} className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-accent-fg">
        Download
      </a>
    </li>
  );
}

export function SplitTool() {
  const { source, open, clear } = useSource(true);
  const [mode, setMode] = useState<'every' | 'parts' | 'at'>('parts');
  const [every, setEvery] = useState(10);
  const [parts, setParts] = useState(2);
  const [at, setAt] = useState('');
  const [precision, setPrecision] = useState<CopyPolicy>('fast');
  const [results, setResults] = useState<ConvertResult[]>([]);
  const [running, setRunning] = useState<{ part: number; of: number; progress: number } | null>(null);
  const [error, setError] = useState<MediaError | null>(null);
  const current = useRef<Job<ConvertResult> | null>(null);
  const cancelled = useRef(false);
  const info = source.status === 'ready' ? source.info : null;

  const release = (rs: ConvertResult[]) => rs.forEach((r) => void mediaEngine.releaseOutput(r));
  useEffect(() => () => current.current?.cancel(), []);
  useEffect(() => () => release(results), [results]);

  if (source.status !== 'ready' || !info) return <SourceGate source={source} open={open} clear={clear} accept={VIDEO_ACCEPT} />;
  const pts = splitPoints(info.duration, mode, every, parts, at);
  const n = pts.length - 1;

  const run = async () => {
    setResults([]);
    setError(null);
    cancelled.current = false;
    const out: ConvertResult[] = [];
    try {
      for (let i = 0; i < n; i++) {
        if (cancelled.current) throw new MediaError('cancelled', 'Cancelled.');
        setRunning({ part: i, of: n, progress: 0 });
        const container = info.mimeType.includes('webm') ? 'webm' : info.mimeType.includes('quicktime') ? 'mov' : 'mp4';
        const job = mediaEngine.convert(source.file, { container, trim: { start: pts[i]!, end: pts[i + 1]! }, copy: precision, fileName: `${baseName(source.file.name)}-part${String(i + 1).padStart(2, '0')}` });
        current.current = job;
        job.onProgress((p) => setRunning({ part: i, of: n, progress: p }));
        out.push(await job.result);
      }
      setResults(out);
    } catch (e) {
      release(out);
      const err = MediaError.from(e);
      if (err.code !== 'cancelled') setError(err);
    } finally {
      setRunning(null);
      current.current = null;
    }
  };

  return (
    <div className="space-y-4">
      <SourceHeader file={source.file} info={info} onChange={() => (setResults([]), clear())} disabled={!!running} />
      <video src={source.url} controls preload="metadata" className="max-h-64 w-full rounded-lg bg-black" aria-label="Source preview" />
      <Panel>
        <ChoiceGroup
          name="split-mode"
          label="Split"
          value={mode}
          onChange={setMode}
          options={[
            ['parts', 'Into equal parts'],
            ['every', 'Every N seconds'],
            ['at', 'At times I choose'],
          ]}
        />
        {mode === 'parts' && <NumberField label="Number of parts" value={parts} min={2} max={100} onChange={setParts} />}
        {mode === 'every' && <NumberField label="Part length" unit="s" value={every} min={1} max={36000} onChange={setEvery} />}
        {mode === 'at' && <TextField label="Split times (seconds or m:ss, comma separated)" value={at} onChange={setAt} placeholder="12.5, 1:30, 2:45" />}
        <ChoiceGroup
          name="split-precision"
          label="Precision"
          value={precision}
          onChange={setPrecision}
          options={[
            ['fast', 'Fast', 'No re-encode; cuts snap to the nearest key frames'],
            ['accurate', 'Frame-accurate', 'Exact cuts; re-encodes where needed'],
          ]}
        />
        <p className="text-sm text-muted md:col-span-3">
          {n} part(s): {pts.slice(0, -1).map((t, i) => `${formatDuration(t, 1)}–${formatDuration(pts[i + 1]!, 1)}`).join(', ')}
        </p>
      </Panel>
      {running ? (
        <div className="space-y-2 rounded-md border border-line bg-surface p-3" aria-live="polite">
          <div className="flex items-center gap-3 text-sm">
            <span className="font-medium">
              Part {running.part + 1} of {running.of}
            </span>
            <Button
              size="sm"
              className="ml-auto"
              onClick={() => {
                cancelled.current = true;
                current.current?.cancel();
              }}
            >
              Cancel
            </Button>
          </div>
          <Progress value={(running.part + running.progress) / running.of} label="Splitting" />
        </div>
      ) : (
        <Button variant="primary" size="lg" onClick={run} disabled={n < 2}>
          Split into {n} parts
        </Button>
      )}
      {error && <ErrorBox error={error} />}
      {results.length > 0 && (
        <ol className="space-y-2" aria-label="Parts">
          {results.map((r, i) => (
            <PartRow key={r.file.name} r={r} i={i} />
          ))}
        </ol>
      )}
    </div>
  );
}
