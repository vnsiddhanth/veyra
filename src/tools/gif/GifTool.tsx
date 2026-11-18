import { useEffect, useState } from 'react';
import { mediaEngine, type FileResult } from '@/media-engine';
import { Button } from '@/components/ui/primitives';
import { FileDrop } from '@/components/ui/FileDrop';
import type { ToolDef } from '../registry';
import { ChoiceGroup, ColorField, NumberField, Panel, RangeField, SelectField } from '../shared/controls';
import { baseName, FileResultCard, IMAGE_ACCEPT, JobArea, SourceGate, SourceHeader, VIDEO_ACCEPT } from '../shared/ToolParts';
import { useMediaJob } from '../shared/useMediaJob';
import { useSource } from '../shared/useSource';
import { MAX_GIF_FRAMES } from '@/media-engine/core/limits';

export function GifTool({ tool }: { tool: ToolDef }) {
  const [from, setFrom] = useState<'video' | 'images'>('video');
  return (
    <div className="space-y-4">
      {tool.slug === 'gif-maker' && (
        <ChoiceGroup
          name="gif-from"
          label="Make a GIF from"
          value={from}
          onChange={setFrom}
          options={[
            ['video', 'A video clip'],
            ['images', 'A set of images'],
          ]}
        />
      )}
      {from === 'video' ? <VideoGif /> : <ImagesGif />}
    </div>
  );
}

function VideoGif() {
  const { source, open, clear } = useSource(true);
  const job = useMediaJob<FileResult>();
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(5);
  const [fps, setFps] = useState(12);
  const [width, setWidth] = useState(480);
  const [colors, setColors] = useState(256);
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState<'forever' | 'once'>('forever');
  const info = source.status === 'ready' ? source.info : null;
  useEffect(() => {
    if (!info) return;
    setStart(0);
    setEnd(Math.min(info.duration, 5));
    setWidth(Math.min(480, info.width));
  }, [info]);
  if (source.status !== 'ready' || !info) return <SourceGate source={source} open={open} clear={clear} accept={VIDEO_ACCEPT} />;
  const frames = Math.floor((end - start) * fps);
  const height = Math.round((width * info.height) / info.width);
  return (
    <div className="space-y-4">
      <SourceHeader file={source.file} info={info} onChange={() => (job.reset(), clear())} disabled={job.state.status === 'running'} />
      <video src={source.url} controls preload="metadata" className="max-h-64 w-full rounded-lg bg-black" aria-label="Source preview" />
      <Panel>
        <NumberField label="Start" unit="s" value={start} min={0} max={info.duration} step={0.1} onChange={setStart} />
        <NumberField label="End" unit="s" value={end} min={0} max={info.duration} step={0.1} onChange={setEnd} />
        <SelectField label="Frame rate" value={String(fps)} onChange={(v) => setFps(Number(v))} options={['5', '8', '10', '12', '15', '20', '25'].map((f) => [f, `${f} fps`] as const)} />
        <NumberField label="Width" unit="px" value={width} min={64} max={Math.min(1280, info.width)} step={2} onChange={setWidth} hint={`Height ${height} px`} />
        <SelectField label="Colours" value={String(colors)} onChange={(v) => setColors(Number(v))} options={['256', '128', '64', '32', '16'].map((c) => [c, `${c} colours`] as const)} hint="Fewer colours → smaller file." />
        <RangeField label="Playback speed" value={speed} min={0.25} max={4} step={0.25} onChange={setSpeed} format={(v) => `${v}×`} />
        <ChoiceGroup
          name="loop"
          label="Loop"
          value={loop}
          onChange={setLoop}
          options={[
            ['forever', 'Forever'],
            ['once', 'Play once'],
          ]}
        />
        <p className="text-sm text-muted md:col-span-2">
          {frames} frames · {width}×{height}
          {frames > MAX_GIF_FRAMES && <span className="text-danger"> — over the {MAX_GIF_FRAMES}-frame limit</span>}
        </p>
      </Panel>
      <JobArea
        state={job.state}
        onCancel={job.cancel}
        label="Making GIF"
        action="Make GIF"
        disabledReason={end <= start ? 'End must be after start.' : frames > MAX_GIF_FRAMES ? 'Too many frames.' : null}
        onRun={() => job.run(() => mediaEngine.gif(source.file, { start, end, fps, width, colors, speed, repeat: loop === 'forever' ? 0 : -1, fileName: baseName(source.file.name) }))}
        done={(r) => <FileResultCard result={r} onReset={job.reset} resetLabel="Change settings" />}
      />
    </div>
  );
}

function ImagesGif() {
  const [files, setFiles] = useState<File[]>([]);
  const job = useMediaJob<FileResult>();
  const [width, setWidth] = useState(480);
  const [height, setHeight] = useState(480);
  const [delay, setDelay] = useState(500);
  const [colors, setColors] = useState(256);
  const [bg, setBg] = useState('#000000');
  return (
    <div className="space-y-4">
      <FileDrop onFiles={(entries) => setFiles((f) => [...f, ...entries.map((e) => e.file).filter((x) => x.type.startsWith('image/'))])} multiple accept={IMAGE_ACCEPT}>
        {({ dragging, open }) => (
          <div className={`flex items-center gap-3 rounded-lg border border-dashed p-4 text-sm ${dragging ? 'border-accent bg-accent-soft' : 'border-line-strong bg-surface'}`}>
            <span className="text-muted">{files.length ? `${files.length} image(s), shown in this order` : 'Drop images here (PNG, JPEG, WebP…)'}</span>
            <Button size="sm" className="ml-auto" onClick={open}>
              Add images
            </Button>
            {files.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setFiles([])}>
                Clear
              </Button>
            )}
          </div>
        )}
      </FileDrop>
      {files.length > 0 && (
        <ol className="flex flex-wrap gap-2 text-xs">
          {files.map((f, i) => (
            <li key={i} className="flex items-center gap-1 rounded border border-line bg-surface px-2 py-1">
              <span className="text-faint">{i + 1}.</span> <span className="max-w-[10rem] truncate">{f.name}</span>
              <button className="text-faint hover:text-danger" aria-label={`Remove ${f.name}`} onClick={() => setFiles((x) => x.filter((_, j) => j !== i))}>
                ×
              </button>
            </li>
          ))}
        </ol>
      )}
      <Panel>
        <NumberField label="Width" unit="px" value={width} min={16} max={1280} onChange={setWidth} />
        <NumberField label="Height" unit="px" value={height} min={16} max={1280} onChange={setHeight} />
        <NumberField label="Time per image" unit="ms" value={delay} min={20} max={10000} step={10} onChange={setDelay} />
        <SelectField label="Colours" value={String(colors)} onChange={(v) => setColors(Number(v))} options={['256', '128', '64', '32'].map((c) => [c, `${c} colours`] as const)} />
        <ColorField label="Background" value={bg} onChange={setBg} />
      </Panel>
      <JobArea
        state={job.state}
        onCancel={job.cancel}
        label="Making GIF"
        action="Make GIF"
        disabledReason={files.length === 0 ? 'Add images first.' : null}
        onRun={() => job.run(() => mediaEngine.gifFromImages(files, { width, height, delay, colors, repeat: 0, background: bg, fileName: 'animation' }))}
        done={(r) => <FileResultCard result={r} onReset={job.reset} resetLabel="Change settings" />}
      />
    </div>
  );
}
