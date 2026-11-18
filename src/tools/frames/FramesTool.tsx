import { useEffect, useState } from 'react';
import { mediaEngine, type FileResult } from '@/media-engine';
import { MAX_ZIP_FRAMES } from '@/media-engine/core/limits';
import { ChoiceGroup, NumberField, Panel, SelectField } from '../shared/controls';
import { baseName, FileResultCard, JobArea, SourceGate, SourceHeader, VIDEO_ACCEPT } from '../shared/ToolParts';
import { useMediaJob } from '../shared/useMediaJob';
import { useSource } from '../shared/useSource';

export function FramesTool() {
  const { source, open, clear } = useSource(true);
  const job = useMediaJob<FileResult>((r) => void mediaEngine.releaseOutput(r));
  const [mode, setMode] = useState<'interval' | 'count' | 'all'>('interval');
  const [interval, setIntervalS] = useState(1);
  const [count, setCount] = useState(10);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [format, setFormat] = useState<'png' | 'jpeg' | 'webp'>('jpeg');
  const [width, setWidth] = useState(0);
  const info = source.status === 'ready' ? source.info : null;
  useEffect(() => {
    if (!info) return;
    setStart(0);
    setEnd(info.duration);
    setWidth(info.width);
  }, [info]);
  if (source.status !== 'ready' || !info) return <SourceGate source={source} open={open} clear={clear} accept={VIDEO_ACCEPT} />;
  const fps = info.video[0]?.frameRate?.bestGuess ?? 30;
  const expected = mode === 'interval' ? Math.ceil((end - start) / Math.max(0.01, interval)) : mode === 'count' ? count : Math.round((end - start) * fps);
  return (
    <div className="space-y-4">
      <SourceHeader file={source.file} info={info} onChange={() => (job.reset(), clear())} disabled={job.state.status === 'running'} />
      <video src={source.url} controls preload="metadata" className="max-h-64 w-full rounded-lg bg-black" aria-label="Source preview" />
      <Panel>
        <ChoiceGroup
          name="frames-mode"
          label="Which frames"
          value={mode}
          onChange={setMode}
          options={[
            ['interval', 'Every N seconds'],
            ['count', 'A fixed number'],
            ['all', 'Every frame'],
          ]}
        />
        {mode === 'interval' && <NumberField label="Interval" unit="s" value={interval} min={0.04} max={3600} step={0.1} onChange={setIntervalS} />}
        {mode === 'count' && <NumberField label="Number of frames" value={count} min={1} max={MAX_ZIP_FRAMES} onChange={setCount} />}
        <NumberField label="From" unit="s" value={start} min={0} max={info.duration} step={0.1} onChange={setStart} />
        <NumberField label="To" unit="s" value={end} min={0} max={info.duration} step={0.1} onChange={setEnd} />
        <SelectField label="Image format" value={format} onChange={setFormat} options={[['jpeg', 'JPEG (small)'], ['png', 'PNG (lossless)'], ['webp', 'WebP']]} />
        <NumberField label="Width" unit="px" value={width} min={16} max={info.width} step={2} onChange={setWidth} hint={`Source width ${info.width} px`} />
        <p className="text-sm text-muted md:col-span-3">
          About {expected} images, packed into one ZIP file.{expected > MAX_ZIP_FRAMES && <span className="text-danger"> That is over the {MAX_ZIP_FRAMES}-image limit.</span>}
        </p>
      </Panel>
      <JobArea
        state={job.state}
        onCancel={job.cancel}
        label="Extracting frames"
        action="Extract frames"
        disabledReason={end <= start ? 'The range is empty.' : expected > MAX_ZIP_FRAMES ? 'Too many frames.' : null}
        onRun={() => job.run(() => mediaEngine.frames(source.file, { mode, interval, count, start, end, format, width, quality: 0.9, fileName: baseName(source.file.name) }))}
        done={(r) => <FileResultCard result={r} onReset={job.reset} resetLabel="Change settings" />}
      />
    </div>
  );
}
