/**
 * Timeline export: format, codec (from this browser's capability probe), size, quality, range.
 * Rendering happens in the media worker (`render`), and the output is validated before it is
 * offered. Chromium can stream the validated file to a location the user picks.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/primitives';
import { mediaEngine, type ConvertResult, type QualityLevel } from '@/media-engine';
import { AUDIO_CODEC_LABELS, probeCodecs, VIDEO_CODEC_LABELS, type CodecCapabilities } from '@/media-engine/capabilities/codecs';
import type { ExportPreferences, Project } from '@/project/schema/types';
import type { RenderSettings } from '@/render/render-project';
import { audibleClips } from '@/render/evaluate';
import { useLibraryStore } from '@/state/library-store';
import { useProjectStore } from '@/state/project-store';
import { projectDuration } from '@/timeline/model/ops';
import { ConvertResultCard, ErrorBox, JobProgress } from '@/tools/shared/ToolParts';
import { useMediaJob } from '@/tools/shared/useMediaJob';
import { formatBytes } from '@/utils/format';
import { flicksToSeconds, formatTimecode, rateToNumber } from '@/utils/time';

type Container = ExportPreferences['container'];

const FORMATS: { value: Container; label: string; video: boolean; vcodecs: string[]; acodecs: string[] }[] = [
  { value: 'mp4', label: 'MP4', video: true, vcodecs: ['avc', 'hevc', 'vp9', 'av1'], acodecs: ['aac', 'opus', 'mp3'] },
  { value: 'webm', label: 'WebM', video: true, vcodecs: ['vp9', 'av1', 'vp8'], acodecs: ['opus', 'vorbis'] },
  { value: 'mov', label: 'MOV', video: true, vcodecs: ['avc', 'hevc'], acodecs: ['aac'] },
  { value: 'mkv', label: 'MKV', video: true, vcodecs: ['avc', 'hevc', 'vp9', 'av1'], acodecs: ['aac', 'opus', 'flac'] },
  { value: 'm4a', label: 'Audio only · M4A (AAC)', video: false, vcodecs: [], acodecs: ['aac'] },
  { value: 'wav', label: 'Audio only · WAV', video: false, vcodecs: [], acodecs: ['pcm-s16'] },
  { value: 'flac', label: 'Audio only · FLAC', video: false, vcodecs: [], acodecs: ['flac'] },
  { value: 'ogg', label: 'Audio only · Ogg (Opus)', video: false, vcodecs: [], acodecs: ['opus'] },
];

const QUALITY: { value: ExportPreferences['quality']; label: string; level: QualityLevel | null; hint: string }[] = [
  { value: 'small', label: 'Small', level: 'low', hint: 'For sharing in chat' },
  { value: 'balanced', label: 'Balanced', level: 'medium', hint: 'Good for most uses' },
  { value: 'high', label: 'High', level: 'high', hint: 'Uploads, archives' },
  { value: 'max', label: 'Maximum practical', level: 'very-high', hint: 'Large files' },
  { value: 'custom', label: 'Custom bitrate', level: null, hint: '' },
];

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
const field = 'h-8 w-full rounded-md border border-line bg-surface-2 px-2 text-sm';

export function ExportDialog({ project, onClose }: { project: Project; onClose(): void }) {
  const files = useLibraryStore((s) => s.files);
  const job = useMediaJob<ConvertResult>((r) => void mediaEngine.releaseOutput(r));
  const [caps, setCaps] = useState<CodecCapabilities | null>(null);
  const prefs = project.exportPrefs;
  const [container, setContainer] = useState<Container>((prefs.container as Container) ?? 'mp4');
  const [vcodec, setVcodec] = useState<string>(prefs.videoCodec ?? 'auto');
  const [acodec, setAcodec] = useState<string>(prefs.audioCodec ?? 'auto');
  const [height, setHeight] = useState<number>(prefs.height ?? project.settings.height);
  const [quality, setQuality] = useState<ExportPreferences['quality']>(prefs.quality);
  const [kbps, setKbps] = useState<number>(Math.round((prefs.videoBitrate ?? 8_000_000) / 1000));
  const [range, setRange] = useState<'all' | 'inout'>(project.inPoint != null && project.outPoint != null ? 'inout' : 'all');
  const [name, setName] = useState(prefs.fileName ?? project.name);
  const [savedTo, setSavedTo] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => void probeCodecs().then(setCaps, () => setCaps(null)), []);
  useEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>('select, input, button')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && job.state.status !== 'running' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, job.state.status]);

  const fmt = FORMATS.find((f) => f.value === container)!;
  const vOptions = fmt.vcodecs.filter((c) => !caps || caps.encodeVideo.includes(c));
  const aOptions = fmt.acodecs.filter((c) => !caps || c === 'pcm-s16' || c === 'mp3' || caps.encodeAudio.includes(c));
  const width = even((height * project.settings.width) / project.settings.height);
  const hasAudio = audibleClips(project).length > 0;

  const missing = useMemo(() => {
    const used = new Set(Object.values(project.clips).map((c) => c.assetId).filter((x): x is string => !!x));
    return project.assets.filter((a) => used.has(a.id) && a.kind !== 'subtitle' && !files[a.id]);
  }, [project, files]);
  const rangeFl = range === 'inout' && project.inPoint != null && project.outPoint != null ? { start: project.inPoint, end: project.outPoint } : { start: 0, end: projectDuration(project) };
  const seconds = flicksToSeconds(rangeFl.end - rangeFl.start);
  const q = QUALITY.find((x) => x.value === quality)!;
  // Rough size estimate (bitrate reference ≈ 8 Mbps at 1080p30 H.264, scaled by pixels and fps).
  const ref = 8_000_000 * ((width * height) / (1920 * 1080)) * Math.sqrt(rateToNumber(project.settings.frameRate) / 30);
  const factor = { small: 0.5, balanced: 1, high: 1.6, max: 2.5, custom: 0 }[quality];
  const vbps = quality === 'custom' ? kbps * 1000 : ref * factor;
  const estimate = ((fmt.video ? vbps : 0) + (hasAudio ? 160_000 : 0)) * seconds / 8;

  const disabled = missing.length > 0 ? 'Reconnect offline media first.' : seconds <= 0 ? 'The timeline is empty.' : !fmt.video && !hasAudio ? 'There is no audio to export.' : null;

  const start = () => {
    const settings: RenderSettings = {
      container,
      videoCodec: vcodec === 'auto' ? null : vcodec,
      audioCodec: acodec === 'auto' ? null : acodec,
      width: fmt.video ? width : null,
      height: fmt.video ? height : null,
      videoBitrate: quality === 'custom' ? kbps * 1000 : (q.level ?? 'high'),
      audioBitrate: quality === 'small' ? 96_000 : quality === 'balanced' ? 160_000 : 256_000,
      range: rangeFl,
      fileName: name.trim() || 'export',
    };
    // Remember the choices with the project (no undo step).
    useProjectStore.getState().apply(
      (p) => ({ ...p, exportPrefs: { ...p.exportPrefs, container, videoCodec: settings.videoCodec ?? null, audioCodec: settings.audioCodec ?? null, height, width, quality, videoBitrate: quality === 'custom' ? kbps * 1000 : null, fileName: name } }),
      { undoable: false },
    );
    setSavedTo(null);
    const blobs = Object.fromEntries(Object.entries(files).filter(([, f]) => !!f)) as Record<string, Blob>;
    job.run(() => mediaEngine.render({ project, files: blobs, settings }));
  };

  const saveAs = async (r: ConvertResult) => {
    const picker = (window as unknown as { showSaveFilePicker?: (o: object) => Promise<FileSystemFileHandle> }).showSaveFilePicker;
    if (!picker) return;
    try {
      const handle = await picker({ suggestedName: r.file.name });
      const writable = await (handle as unknown as { createWritable(): Promise<FileSystemWritableFileStream> }).createWritable();
      // Stream from the on-disk OPFS result; nothing is buffered in memory.
      await r.file.stream().pipeTo(writable as unknown as WritableStream<Uint8Array>);
      setSavedTo(handle.name);
    } catch (e) {
      if ((e as DOMException)?.name !== 'AbortError') setSavedTo(`Could not save: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && job.state.status !== 'running' && onClose()}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Export video" className="theme-dark max-h-full w-full max-w-2xl overflow-y-auto rounded-lg border border-line-strong bg-surface p-5 text-fg shadow-2xl">
        <div className="mb-4 flex items-center">
          <h2 className="text-lg font-semibold">Export</h2>
          <span className="ml-3 text-xs text-muted">
            {formatTimecode(rangeFl.end - rangeFl.start, project.settings.frameRate)} · {Number(rateToNumber(project.settings.frameRate).toFixed(3))} fps
          </span>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={onClose} disabled={job.state.status === 'running'}>
            Close
          </Button>
        </div>

        {job.state.status === 'done' ? (
          <div className="space-y-3">
            <ConvertResultCard result={job.state.result} onReset={job.reset} resetLabel="Export again" />
            {'showSaveFilePicker' in window && (
              <div className="flex items-center gap-3">
                <Button onClick={() => void saveAs((job.state as { result: ConvertResult }).result)}>Save to a folder…</Button>
                {savedTo && <span className="text-xs text-muted">{savedTo.startsWith('Could not') ? savedTo : `Saved as ${savedTo}`}</span>}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-muted">Format</span>
                <select className={field} value={container} onChange={(e) => (setContainer(e.target.value as Container), setVcodec('auto'), setAcodec('auto'))} aria-label="Format">
                  {FORMATS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-muted">File name</span>
                <input className={field} value={name} onChange={(e) => setName(e.target.value)} aria-label="File name" />
              </label>
              {fmt.video && (
                <>
                  <label className="block text-sm">
                    <span className="mb-1 block text-xs text-muted">Video codec</span>
                    <select className={field} value={vcodec} onChange={(e) => setVcodec(e.target.value)} aria-label="Video codec">
                      <option value="auto">Automatic (best supported)</option>
                      {vOptions.map((c) => (
                        <option key={c} value={c}>
                          {VIDEO_CODEC_LABELS[c] ?? c}
                        </option>
                      ))}
                    </select>
                    <span className="mt-1 block text-2xs text-faint">{caps ? 'Codecs this browser cannot encode are hidden.' : 'Checking encoders…'}</span>
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block text-xs text-muted">Resolution</span>
                    <select className={field} value={height} onChange={(e) => setHeight(Number(e.target.value))} aria-label="Resolution">
                      {[...new Set([project.settings.height, 2160, 1440, 1080, 720, 540, 480, 360])]
                        .filter((h) => h <= Math.max(project.settings.height, 2160))
                        .sort((a, b) => b - a)
                        .map((h) => (
                          <option key={h} value={h}>
                            {even((h * project.settings.width) / project.settings.height)}×{h}
                            {h === project.settings.height ? ' (project)' : ''}
                          </option>
                        ))}
                    </select>
                  </label>
                </>
              )}
              {hasAudio && (
                <label className="block text-sm">
                  <span className="mb-1 block text-xs text-muted">Audio codec</span>
                  <select className={field} value={acodec} onChange={(e) => setAcodec(e.target.value)} aria-label="Audio codec">
                    <option value="auto">Automatic</option>
                    {aOptions.map((c) => (
                      <option key={c} value={c}>
                        {AUDIO_CODEC_LABELS[c] ?? c}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {fmt.video && (
                <fieldset className="sm:col-span-2">
                  <legend className="mb-1 text-xs text-muted">Quality</legend>
                  <div className="flex flex-wrap gap-2">
                    {QUALITY.map((x) => (
                      <label key={x.value} className={`flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm ${quality === x.value ? 'border-accent bg-accent-soft/40' : 'border-line'}`}>
                        <input type="radio" name="quality" checked={quality === x.value} onChange={() => setQuality(x.value)} className="accent-[var(--c-accent)]" />
                        {x.label}
                      </label>
                    ))}
                  </div>
                  {quality === 'custom' && (
                    <label className="mt-2 flex items-center gap-2 text-sm">
                      Video bitrate
                      <input type="number" min={200} max={200_000} step={100} value={kbps} onChange={(e) => setKbps(Number(e.target.value))} className="h-8 w-28 rounded-md border border-line bg-surface-2 px-2 font-mono" aria-label="Video bitrate in kbps" />
                      kbps
                    </label>
                  )}
                </fieldset>
              )}
              <fieldset className="sm:col-span-2">
                <legend className="mb-1 text-xs text-muted">Range</legend>
                <div className="flex gap-2 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="radio" name="range" checked={range === 'all'} onChange={() => setRange('all')} className="accent-[var(--c-accent)]" /> Whole timeline
                  </label>
                  <label className={`flex items-center gap-2 ${project.inPoint == null || project.outPoint == null ? 'opacity-40' : ''}`}>
                    <input type="radio" name="range" disabled={project.inPoint == null || project.outPoint == null} checked={range === 'inout'} onChange={() => setRange('inout')} className="accent-[var(--c-accent)]" /> In to out (I / O)
                  </label>
                </div>
              </fieldset>
            </div>

            {missing.length > 0 && (
              <ErrorBox error={`Offline media: ${missing.map((a) => a.name).join(', ')}. Reconnect these files in the media panel; exporting without them would leave gaps.`} />
            )}
            <p className="mt-4 text-xs text-muted">
              Estimated size ≈ {formatBytes(estimate)} {fmt.video && `· ${width}×${height}`}. Rendering runs on this device; keep this tab open. The result is checked (container, duration, size, codecs, first/last frame decode) before it is offered.
            </p>
            <div className="mt-4 space-y-3">
              <JobProgress state={job.state} onCancel={job.cancel} label="Exporting" />
              {job.state.status === 'error' && <ErrorBox error={job.state.error} />}
              {job.state.status === 'cancelled' && <p className="text-sm text-muted">Cancelled. Nothing was saved.</p>}
              {job.state.status !== 'running' && (
                <Button variant="primary" size="lg" onClick={start} disabled={!!disabled}>
                  Export
                </Button>
              )}
              {disabled && <span className="ml-3 text-xs text-muted">{disabled}</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
