/** Detect silent passages from the audio envelope and cut them out. */
import { useEffect, useMemo, useState } from 'react';
import { mediaEngine, type ConvertResult, type WaveformData } from '@/media-engine';
import { formatDuration } from '@/utils/format';
import { Composition } from '../shared/compose';
import { NumberField, Panel, RangeField } from '../shared/controls';
import { AUDIO_ACCEPT, baseName, ConvertResultCard, ErrorBox, JobArea, SourceGate, SourceHeader } from '../shared/ToolParts';
import { useMediaJob } from '../shared/useMediaJob';
import { useSource } from '../shared/useSource';
import { RenderFormatField, type RenderContainer } from './common';

/**
 * Ranges (seconds) to keep: everything except runs quieter than `thresholdDb` lasting at least
 * `minSilence`, with `pad` seconds of air kept around speech.
 */
export function keepRanges(w: WaveformData, thresholdDb: number, minSilence: number, pad: number): { start: number; end: number }[] {
  const thr = 255 * 10 ** (thresholdDb / 20);
  const n = w.peaks.length;
  const silent: [number, number][] = [];
  let runStart = -1;
  for (let i = 0; i <= n; i++) {
    const quiet = i < n && w.peaks[i]! <= thr;
    if (quiet && runStart < 0) runStart = i;
    if (!quiet && runStart >= 0) {
      const a = runStart / w.peaksPerSecond;
      const b = i / w.peaksPerSecond;
      if (b - a >= minSilence) silent.push([a + pad, b - pad]);
      runStart = -1;
    }
  }
  const keep: { start: number; end: number }[] = [];
  let t = 0;
  for (const [a, b] of silent) {
    if (b <= a) continue;
    if (a > t) keep.push({ start: t, end: a });
    t = b;
  }
  if (t < w.duration) keep.push({ start: t, end: w.duration });
  return keep.filter((r) => r.end - r.start > 0.05);
}

export function SilenceTool() {
  const { source, open, clear } = useSource('audio');
  const job = useMediaJob<ConvertResult>((r) => void mediaEngine.releaseOutput(r));
  const [wave, setWave] = useState<WaveformData | null>(null);
  const [waveErr, setWaveErr] = useState<string | null>(null);
  const [threshold, setThreshold] = useState(-40);
  const [minSilence, setMinSilence] = useState(0.6);
  const [pad, setPad] = useState(0.12);
  const [container, setContainer] = useState<RenderContainer>('mp4');
  const info = source.status === 'ready' ? source.info : null;

  useEffect(() => {
    setWave(null);
    setWaveErr(null);
    if (source.status !== 'ready') return;
    const j = mediaEngine.waveform(source.file, 100);
    j.result.then(setWave, (e) => setWaveErr(String(e?.message ?? e)));
    return () => j.cancel();
  }, [source]);

  const keep = useMemo(() => (wave ? keepRanges(wave, threshold, minSilence, pad) : []), [wave, threshold, minSilence, pad]);
  if (source.status !== 'ready' || !info) return <SourceGate source={source} open={open} clear={clear} accept={AUDIO_ACCEPT} label="Drop a video or audio recording" />;
  const kept = keep.reduce((s, r) => s + r.end - r.start, 0);
  const isVideo = info.video.length > 0;

  const run = () => {
    const comp = isVideo ? Composition.fromVideo(info) : new Composition({ width: 640, height: 360, frameRate: { num: 30, den: 1 } });
    const asset = comp.asset(source.file, info, isVideo ? 'video' : 'audio', source.file.name);
    const track = comp.track(isVideo ? 'video' : 'audio');
    let t = 0;
    const fade = comp.q(0.01, 'ceil');
    for (const r of keep) {
      const sIn = comp.q(r.start);
      const dur = comp.q(r.end) - sIn;
      if (dur <= 0) continue;
      comp.clip(track, { assetId: asset.id, start: t, duration: dur, sourceIn: sIn, audio: { gain: 1, pan: 0, fadeIn: fade, fadeOut: fade } });
      t += dur;
    }
    job.run(() =>
      mediaEngine.render(comp.input({ container: isVideo ? container : 'm4a', fileName: `${baseName(source.file.name)}-no-silence`, videoBitrate: 'high', audioBitrate: 'high' })),
    );
  };

  return (
    <div className="space-y-4">
      <SourceHeader file={source.file} info={info} onChange={() => (job.reset(), clear())} disabled={job.state.status === 'running'} />
      {waveErr && <ErrorBox error={waveErr} />}
      {wave ? (
        <SilenceMap wave={wave} keep={keep} threshold={threshold} />
      ) : (
        !waveErr && <p className="rounded-lg border border-line bg-surface p-4 text-sm text-muted">Analysing the audio…</p>
      )}
      <Panel>
        <RangeField label="Silence threshold" value={threshold} min={-70} max={-10} step={1} onChange={setThreshold} format={(v) => `${v} dBFS`} />
        <NumberField label="Shortest silence to cut" unit="s" value={minSilence} min={0.1} max={10} step={0.1} onChange={setMinSilence} />
        <NumberField label="Padding kept around sound" unit="s" value={pad} min={0} max={1} step={0.02} onChange={setPad} />
        {isVideo && <RenderFormatField value={container} onChange={setContainer} />}
        <p className="text-sm text-muted md:col-span-3">
          {keep.length} segment(s) kept · {formatDuration(kept, 1)} of {formatDuration(info.duration, 1)} ({Math.round((1 - kept / Math.max(0.01, info.duration)) * 100)}% removed)
        </p>
      </Panel>
      <JobArea
        state={job.state}
        onCancel={job.cancel}
        label="Rendering"
        action="Remove silence"
        disabledReason={!wave ? 'Analysing…' : keep.length === 0 ? 'Everything is below the threshold.' : kept >= info.duration - 0.05 ? 'No silence found with these settings.' : null}
        onRun={run}
        done={(r) => <ConvertResultCard result={r} onReset={job.reset} resetLabel="Change settings" />}
      />
    </div>
  );
}

function SilenceMap({ wave, keep, threshold }: { wave: WaveformData; keep: { start: number; end: number }[]; threshold: number }) {
  const W = 1000;
  const H = 80;
  const step = Math.max(1, Math.floor(wave.peaks.length / W));
  const pts: string[] = [];
  for (let i = 0, x = 0; i < wave.peaks.length; i += step, x++) {
    let m = 0;
    for (let j = i; j < Math.min(i + step, wave.peaks.length); j++) m = Math.max(m, wave.peaks[j]!);
    const h = (m / 255) * (H / 2);
    pts.push(`M${x} ${H / 2 - h}V${H / 2 + h}`);
  }
  const cols = Math.ceil(wave.peaks.length / step);
  const thrY = (255 * 10 ** (threshold / 20) * (H / 2)) / 255;
  return (
    <svg viewBox={`0 0 ${cols} ${H}`} preserveAspectRatio="none" className="h-24 w-full rounded-lg border border-line bg-surface" role="img" aria-label="Audio with kept segments highlighted">
      {keep.map((r, i) => (
        <rect key={i} x={(r.start / wave.duration) * cols} width={((r.end - r.start) / wave.duration) * cols} y={0} height={H} fill="var(--c-accent)" opacity={0.18} />
      ))}
      <path d={pts.join('')} stroke="var(--c-fg)" strokeWidth={1} opacity={0.6} />
      <line x1={0} x2={cols} y1={H / 2 - thrY} y2={H / 2 - thrY} stroke="var(--c-danger)" strokeDasharray="4 4" strokeWidth={0.8} />
      <line x1={0} x2={cols} y1={H / 2 + thrY} y2={H / 2 + thrY} stroke="var(--c-danger)" strokeDasharray="4 4" strokeWidth={0.8} />
    </svg>
  );
}
