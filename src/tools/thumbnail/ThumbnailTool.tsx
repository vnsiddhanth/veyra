import { useEffect, useMemo, useRef, useState } from 'react';
import { IconDownload } from '@/components/ui/icons';
import { Button } from '@/components/ui/primitives';
import { mediaEngine, MediaError, type FrameResult } from '@/media-engine';
import { formatBytes } from '@/utils/format';
import { FramePlayer, formatFrameTime, type FramePlayerHandle } from '../shared/FramePlayer';
import { ErrorBox, FileNotes, JobProgress, SourceDrop } from '../shared/ToolParts';
import { useMediaJob } from '../shared/useMediaJob';
import { useSource } from '../shared/useSource';

type Format = 'png' | 'jpeg' | 'webp';
const SIZES: Array<[string, number | null]> = [
  ['Original', null],
  ['1920 px wide', 1920],
  ['1280 px wide', 1280],
  ['640 px wide', 640],
];

interface VerifiedFrame extends FrameResult {
  url: string;
}

/** Pick a frame and export it as an image. The image is decoded again before it is offered. */
export function ThumbnailTool() {
  const { source, open, clear } = useSource(true);
  const player = useRef<FramePlayerHandle>(null);
  const [now, setNow] = useState(0);
  const [format, setFormat] = useState<Format>('png');
  const [quality, setQuality] = useState(0.92);
  const [width, setWidth] = useState<number | null>(null);
  const job = useMediaJob<VerifiedFrame>((r) => URL.revokeObjectURL(r.url));

  const info = source.status === 'ready' ? source.info : null;
  const fps = info?.video[0]?.frameRate?.bestGuess || 30;
  const sizes = useMemo(() => SIZES.filter(([, w]) => w == null || (info && w < info.width)), [info]);
  useEffect(() => setWidth(null), [info]);

  const capture = () => {
    if (source.status !== 'ready') return;
    const file = source.file;
    job.run(() => {
      const inner = mediaEngine.extractFrame(file, { timestamp: now + 0.5 / fps, format, quality, width: width ?? undefined });
      // Validate: the image must decode, at the promised size, before we call it done.
      const verified = inner.result.then(async (r) => {
        const bitmap = await createImageBitmap(r.blob).catch(() => null);
        if (!bitmap) throw new MediaError('validation-failed', 'The exported image could not be decoded.');
        const ok = bitmap.width === r.width && bitmap.height === r.height;
        bitmap.close();
        if (!ok) throw new MediaError('validation-failed', 'The exported image has unexpected dimensions.');
        return { ...r, url: URL.createObjectURL(r.blob) };
      });
      return { id: inner.id, result: verified, onProgress: inner.onProgress.bind(inner), cancel: inner.cancel.bind(inner) };
    });
  };

  if (source.status === 'empty') return <SourceDrop onFile={open} accept="video/*,.mp4,.mov,.webm,.mkv,.ts" />;
  if (source.status === 'probing') return <p className="rounded-lg border border-line bg-surface p-6 text-sm text-muted">Reading {source.file.name}…</p>;
  if (source.status === 'error')
    return (
      <ErrorBox error={source.error}>
        <Button size="sm" className="mt-2" onClick={clear}>
          Choose another file
        </Button>
      </ErrorBox>
    );

  const ext = format === 'jpeg' ? 'jpg' : format;
  const base = source.file.name.replace(/\.[^.]+$/, '');
  const frameNo = Math.floor(now * fps + 1e-6);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        <span className="min-w-0 truncate font-medium">{source.file.name}</span>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => (job.reset(), clear())}>
          Change file
        </Button>
      </div>
      <FileNotes info={source.info} />
      <FramePlayer ref={player} src={source.url} duration={source.info.duration} fps={fps} onTime={setNow} />
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-surface p-4 text-sm">
        <label>
          <span className="mb-1 block text-xs text-muted">Format</span>
          <select value={format} onChange={(e) => setFormat(e.target.value as Format)} className="h-9 rounded-md border border-line bg-surface-2 px-2">
            <option value="png">PNG (lossless)</option>
            <option value="jpeg">JPEG</option>
            <option value="webp">WebP</option>
          </select>
        </label>
        {format !== 'png' && (
          <label>
            <span className="mb-1 block text-xs text-muted">Quality {Math.round(quality * 100)}</span>
            <input type="range" min={0.5} max={1} step={0.01} value={quality} onChange={(e) => setQuality(Number(e.target.value))} className="h-9 w-32 accent-[var(--c-accent)]" />
          </label>
        )}
        <label>
          <span className="mb-1 block text-xs text-muted">Size</span>
          <select value={width ?? ''} onChange={(e) => setWidth(e.target.value ? Number(e.target.value) : null)} className="h-9 rounded-md border border-line bg-surface-2 px-2">
            {sizes.map(([label, w]) => (
              <option key={label} value={w ?? ''}>
                {label}
                {w == null ? ` (${source.info.width}×${source.info.height})` : ''}
              </option>
            ))}
          </select>
        </label>
        <Button variant="primary" size="lg" className="ml-auto" onClick={capture} disabled={job.state.status === 'running'}>
          Capture frame {frameNo}
        </Button>
      </div>
      <JobProgress state={job.state} onCancel={job.cancel} label="Capturing" />
      {job.state.status === 'error' && <ErrorBox error={job.state.error} />}
      {job.state.status === 'done' && (
        <div className="overflow-hidden rounded-lg border border-ok/40 bg-surface">
          <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium uppercase tracking-wider text-ok">Frame captured · verified</p>
              <p className="text-xs text-muted">
                {job.state.result.width}×{job.state.result.height} {format.toUpperCase()} · {formatBytes(job.state.result.blob.size)} · frame at {formatFrameTime(job.state.result.frameTimestamp, fps)}
              </p>
            </div>
            <a
              href={job.state.result.url}
              download={`${base}-frame-${Math.floor(job.state.result.frameTimestamp * fps + 1e-6)}.${ext}`}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-accent-fg hover:brightness-110"
            >
              <IconDownload /> Download
            </a>
          </div>
          <img src={job.state.result.url} alt="Captured frame" className="max-h-80 w-full bg-black object-contain" />
        </div>
      )}
    </div>
  );
}
