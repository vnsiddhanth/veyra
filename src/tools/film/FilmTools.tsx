/**
 * Film tools: dialogue noise reduction, loudness normalisation, cinematic bars, end credits,
 * freeze frame and colour scopes. Each builds a small timeline and renders it with the editor's
 * export engine, so a tool and the editor always produce the same result.
 */
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { mediaEngine, type ConvertResult, type MediaInfo } from '@/media-engine';
import { LOUDNESS_TARGETS } from '@/render/loudness';
import { computeScopes, clipping, type ScopeData } from '@/render/scopes';
import type { ToolDef } from '@/tools/registry';
import { ScopeView } from '@/editor/preview/MonitorOverlays';
import { createId } from '@/utils/id';
import { formatDuration } from '@/utils/format';
import { Composition } from '../shared/compose';
import { NumberField, Panel, RangeField, SelectField } from '../shared/controls';
import { FramePlayer, formatFrameTime, type FramePlayerHandle } from '../shared/FramePlayer';
import { AUDIO_ACCEPT, baseName, ConvertResultCard, JobArea, SourceGate, SourceHeader, VIDEO_ACCEPT } from '../shared/ToolParts';
import { useMediaJob } from '../shared/useMediaJob';
import { useSource } from '../shared/useSource';
import { RenderFormatField, type RenderContainer } from '../compose/common';

type AudioOut = 'm4a' | 'wav';

const fpsOf = (info: MediaInfo) => info.video[0]?.frameRate?.bestGuess ?? 30;

/** A one-clip composition of the whole file (video or audio-only). */
function wholeFile(file: File, info: MediaInfo, effects: { type: string; params: Record<string, number | string | boolean> }[] = []) {
  const isVideo = info.video.length > 0;
  const comp = isVideo ? Composition.fromVideo(info) : new Composition({ width: 640, height: 360, frameRate: { num: 30, den: 1 } });
  const asset = comp.asset(file, info, isVideo ? 'video' : 'audio', file.name);
  const track = comp.track(isVideo ? 'video' : 'audio');
  comp.clip(track, { assetId: asset.id, start: 0, duration: comp.q(info.duration, 'floor'), effects: effects.map((e) => ({ id: createId('fx'), enabled: true, ...e })) });
  return { comp, isVideo };
}

function OutputField({ isVideo, video, setVideo, audio, setAudio }: { isVideo: boolean; video: RenderContainer; setVideo(v: RenderContainer): void; audio: AudioOut; setAudio(v: AudioOut): void }) {
  return isVideo ? (
    <RenderFormatField value={video} onChange={setVideo} />
  ) : (
    <SelectField
      label="Output format"
      value={audio}
      onChange={setAudio}
      options={[
        ['m4a', 'M4A (AAC, small)'],
        ['wav', 'WAV (lossless)'],
      ]}
    />
  );
}

// ── Remove background noise ───────────────────────────────────────────────

function DenoiseTool() {
  const { source, open, clear } = useSource('audio');
  const job = useMediaJob<ConvertResult>((r) => void mediaEngine.releaseOutput(r));
  const [reduction, setReduction] = useState(15);
  const [video, setVideo] = useState<RenderContainer>('mp4');
  const [audio, setAudio] = useState<AudioOut>('m4a');
  if (source.status !== 'ready') return <SourceGate source={source} open={open} clear={clear} accept={AUDIO_ACCEPT} label="Drop a video or audio recording with background noise" />;
  const info = source.info;
  const isVideo = info.video.length > 0;
  const run = () => {
    const { comp } = wholeFile(source.file, info, [{ type: 'denoise', params: { reduction } }]);
    job.run(() => mediaEngine.render(comp.input({ container: isVideo ? video : audio, fileName: `${baseName(source.file.name)}-clean`, videoBitrate: 'high', audioBitrate: 'high' })));
  };
  return (
    <div className="space-y-4">
      <SourceHeader file={source.file} info={info} onChange={() => (job.reset(), clear())} disabled={job.state.status === 'running'} />
      {isVideo ? <video src={source.url} controls preload="metadata" className="max-h-64 w-full rounded-lg bg-black" aria-label="Source preview" /> : <audio src={source.url} controls className="w-full" aria-label="Source preview" />}
      <Panel>
        <RangeField label="Reduction" value={reduction} min={3} max={30} step={1} onChange={setReduction} format={(v) => `${v} dB`} />
        <OutputField isVideo={isVideo} video={video} setVideo={setVideo} audio={audio} setAudio={setAudio} />
        <p className="text-sm text-muted md:col-span-3">
          Learns the hiss, hum or room tone from the first seconds of the recording, then lowers it everywhere while keeping voices natural. 15 dB suits most recordings;
          go higher for very noisy ones, lower if voices start to sound thin.{isVideo ? ' The picture is re-encoded at high quality.' : ''}
        </p>
      </Panel>
      <JobArea state={job.state} onCancel={job.cancel} label="Cleaning" action="Remove noise" onRun={run} done={(r) => <ConvertResultCard result={r} onReset={job.reset} resetLabel="Change settings" />} />
    </div>
  );
}

// ── Normalize loudness ────────────────────────────────────────────────────

function LoudnessTool() {
  const { source, open, clear } = useSource('audio');
  const job = useMediaJob<ConvertResult>((r) => void mediaEngine.releaseOutput(r));
  const [target, setTarget] = useState<string>('-14');
  const [video, setVideo] = useState<RenderContainer>('mp4');
  const [audio, setAudio] = useState<AudioOut>('m4a');
  if (source.status !== 'ready') return <SourceGate source={source} open={open} clear={clear} accept={AUDIO_ACCEPT} label="Drop a video or audio file" />;
  const info = source.info;
  const isVideo = info.video.length > 0;
  const run = () => {
    const { comp } = wholeFile(source.file, info);
    job.run(() =>
      mediaEngine.render(
        comp.input({ container: isVideo ? video : audio, fileName: `${baseName(source.file.name)}-${Math.abs(Number(target))}lufs`, videoBitrate: 'high', audioBitrate: 'high', loudnessTarget: Number(target) }),
      ),
    );
  };
  return (
    <div className="space-y-4">
      <SourceHeader file={source.file} info={info} onChange={() => (job.reset(), clear())} disabled={job.state.status === 'running'} />
      <Panel>
        <SelectField label="Target loudness" value={target} onChange={setTarget} options={LOUDNESS_TARGETS.map((t) => [String(t.lufs), t.label] as const)} />
        <OutputField isVideo={isVideo} video={video} setVideo={setVideo} audio={audio} setAudio={setAudio} />
        <p className="text-sm text-muted md:col-span-3">
          Measures the whole file the way broadcasters and streaming services do (ITU-R BS.1770 / EBU R128), sets the level to the target and keeps peaks under −1 dB.
          The result card shows the measured loudness and the change.
        </p>
      </Panel>
      <JobArea state={job.state} onCancel={job.cancel} label="Measuring and levelling" action="Normalize loudness" onRun={run} done={(r) => <ConvertResultCard result={r} onReset={job.reset} resetLabel="Change settings" />} />
    </div>
  );
}

// ── Cinematic bars ────────────────────────────────────────────────────────

const BAR_RATIOS: [string, string, number][] = [
  ['2.39', '2.39:1 · anamorphic scope', 2.39],
  ['2.00', '2.00:1 · Univisium', 2],
  ['1.85', '1.85:1 · flat widescreen', 1.85],
  ['1.33', '4:3 · academy / pillarbox', 4 / 3],
];

/** Crop fractions that leave an `r`:1 window in a `w`×`h` frame (bars top/bottom or left/right). */
export function barCrop(w: number, h: number, r: number): { top: number; bottom: number; left: number; right: number } {
  const a = w / h;
  if (r >= a) {
    const f = (1 - a / r) / 2;
    return { top: f, bottom: f, left: 0, right: 0 };
  }
  const f = (1 - r / a) / 2;
  return { top: 0, bottom: 0, left: f, right: f };
}

function BarsTool() {
  const { source, open, clear } = useSource();
  const job = useMediaJob<ConvertResult>((r) => void mediaEngine.releaseOutput(r));
  const [ratio, setRatio] = useState('2.39');
  const [video, setVideo] = useState<RenderContainer>('mp4');
  if (source.status !== 'ready') return <SourceGate source={source} open={open} clear={clear} accept={VIDEO_ACCEPT} />;
  const info = source.info;
  const r = BAR_RATIOS.find((x) => x[0] === ratio)![2];
  const crop = barCrop(info.width, info.height, r);
  const run = () => {
    const comp = Composition.fromVideo(info);
    const asset = comp.asset(source.file, info, 'video', source.file.name);
    const track = comp.track('video');
    comp.clip(track, {
      assetId: asset.id,
      start: 0,
      duration: comp.q(info.duration, 'floor'),
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, flipH: false, flipV: false, crop },
    });
    job.run(() => mediaEngine.render(comp.input({ container: video, fileName: `${baseName(source.file.name)}-${ratio.replace('.', '_')}`, videoBitrate: 'high' })));
  };
  return (
    <div className="space-y-4">
      <SourceHeader file={source.file} info={info} onChange={() => (job.reset(), clear())} disabled={job.state.status === 'running'} />
      <div className="relative overflow-hidden rounded-lg bg-black" style={{ aspectRatio: `${info.width} / ${info.height}` }}>
        <video src={source.url} controls preload="metadata" className="h-full w-full" aria-label="Source preview" />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 bg-black" style={{ height: `${crop.top * 100}%` }} />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 bg-black" style={{ height: `${crop.bottom * 100}%` }} />
        <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 bg-black" style={{ width: `${crop.left * 100}%` }} />
        <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 bg-black" style={{ width: `${crop.right * 100}%` }} />
      </div>
      <Panel>
        <SelectField label="Aspect ratio" value={ratio} onChange={setRatio} options={BAR_RATIOS.map(([v, l]) => [v, l] as const)} />
        <RenderFormatField value={video} onChange={setVideo} />
        <p className="text-sm text-muted md:col-span-3">
          Masks the frame to the chosen ratio with black bars. The video keeps its size ({info.width}×{info.height}), so it plays everywhere; what you see above is what you
          get.
        </p>
      </Panel>
      <JobArea state={job.state} onCancel={job.cancel} label="Rendering" action="Add bars" onRun={run} done={(r) => <ConvertResultCard result={r} onReset={job.reset} resetLabel="Change settings" />} />
    </div>
  );
}

// ── End credits ───────────────────────────────────────────────────────────

const CREDITS = ['A FILM BY', 'Your Name', '', 'CAST', 'Lead — Actor Name', 'Supporting — Actor Name', '', 'CREW', 'Director — Name', 'Cinematography — Name', 'Editor — Name', 'Sound — Name', 'Music — Name', '', 'SPECIAL THANKS', 'Everyone who helped'].join('\n');

function CreditsTool() {
  const { source, open, clear } = useSource();
  const job = useMediaJob<ConvertResult>((r) => void mediaEngine.releaseOutput(r));
  const [text, setText] = useState(CREDITS);
  const [seconds, setSeconds] = useState(20);
  const [place, setPlace] = useState<'after' | 'over'>('after');
  const [video, setVideo] = useState<RenderContainer>('mp4');
  if (source.status !== 'ready') return <SourceGate source={source} open={open} clear={clear} accept={VIDEO_ACCEPT} />;
  const info = source.info;
  const over = place === 'over' && seconds < info.duration;
  const run = () => {
    const comp = Composition.fromVideo(info);
    const asset = comp.asset(source.file, info, 'video', source.file.name);
    const v = comp.track('video');
    const tx = comp.track('text', 'top');
    const dur = comp.q(info.duration, 'floor');
    const len = comp.q(seconds);
    comp.clip(v, { assetId: asset.id, start: 0, duration: dur });
    comp.clip(tx, {
      assetId: null,
      start: over ? dur - len : dur,
      duration: len,
      name: 'Credits',
      text: { text, fontFamily: 'system-ui, sans-serif', fontSize: Math.round(info.height / 22), fontWeight: 500, color: '#ffffff', background: null, align: 'center', outline: null, shadow: over ? { color: 'rgba(0,0,0,0.8)', blur: 8, x: 0, y: 2 } : null, letterSpacing: 0, lineHeight: 1.6 },
      effects: [{ id: createId('fx'), type: 'credits-roll', enabled: true, params: { direction: 'up' } }],
    });
    job.run(() => mediaEngine.render(comp.input({ container: video, fileName: `${baseName(source.file.name)}-credits`, videoBitrate: 'high' })));
  };
  return (
    <div className="space-y-4">
      <SourceHeader file={source.file} info={info} onChange={() => (job.reset(), clear())} disabled={job.state.status === 'running'} />
      <Panel>
        <div className="text-sm md:col-span-2 md:row-span-3">
          <label htmlFor="credits-text" className="mb-1 block text-xs text-muted">
            Credits (one line each; blank lines make gaps)
          </label>
          <textarea id="credits-text" value={text} onChange={(e) => setText(e.target.value)} rows={12} className="w-full rounded-md border border-line bg-surface-2 p-2 font-mono text-sm" />
        </div>
        <SelectField
          label="Where"
          value={place}
          onChange={setPlace}
          options={[
            ['after', 'After the video, on black'],
            ['over', 'Over the end of the video'],
          ]}
        />
        <NumberField label="Roll length" unit="s" value={seconds} min={5} max={120} step={1} onChange={setSeconds} hint="Longer rolls move slower." />
        <RenderFormatField value={video} onChange={setVideo} />
      </Panel>
      <p className="text-sm text-muted">
        Result: {formatDuration(place === 'after' ? info.duration + seconds : info.duration, 1)} long. The names scroll up at a steady speed from below the frame to above it.
      </p>
      <JobArea
        state={job.state}
        onCancel={job.cancel}
        label="Rendering"
        action="Add credits"
        disabledReason={!text.trim() ? 'Type the credits first.' : null}
        onRun={run}
        done={(r) => <ConvertResultCard result={r} onReset={job.reset} resetLabel="Change settings" />}
      />
    </div>
  );
}

// ── Freeze frame ──────────────────────────────────────────────────────────

function FreezeTool() {
  const { source, open, clear } = useSource();
  const job = useMediaJob<ConvertResult>((r) => void mediaEngine.releaseOutput(r));
  const player = useRef<FramePlayerHandle>(null);
  const [now, setNow] = useState(0);
  const [hold, setHold] = useState(2);
  const [video, setVideo] = useState<RenderContainer>('mp4');
  if (source.status !== 'ready') return <SourceGate source={source} open={open} clear={clear} accept={VIDEO_ACCEPT} />;
  const info = source.info;
  const fps = fpsOf(info);
  const run = () => {
    const comp = Composition.fromVideo(info);
    const asset = comp.asset(source.file, info, 'video', source.file.name);
    const v = comp.track('video');
    const at = comp.q(now, 'floor');
    const len = comp.q(hold);
    const dur = comp.q(info.duration, 'floor');
    if (at > 0) comp.clip(v, { assetId: asset.id, start: 0, duration: at, sourceIn: 0 });
    comp.clip(v, { assetId: asset.id, start: at, duration: len, sourceIn: at, speed: 0, name: 'freeze', effects: [{ id: createId('fx'), type: 'mute-audio', enabled: true, params: {} }] });
    if (dur > at) comp.clip(v, { assetId: asset.id, start: at + len, duration: dur - at, sourceIn: at });
    job.run(() => mediaEngine.render(comp.input({ container: video, fileName: `${baseName(source.file.name)}-freeze`, videoBitrate: 'high' })));
  };
  return (
    <div className="space-y-4">
      <SourceHeader file={source.file} info={info} onChange={() => (job.reset(), clear())} disabled={job.state.status === 'running'} />
      <FramePlayer ref={player} src={source.url} duration={info.duration} fps={fps} onTime={setNow} />
      <Panel>
        <div className="text-sm">
          <span className="mb-1 block text-xs text-muted">Freeze at</span>
          <span className="font-mono text-base tabular">{formatFrameTime(now, fps)}</span>
          <span className="block text-xs text-faint">Step with ← / → to pick the exact frame.</span>
        </div>
        <NumberField label="Hold for" unit="s" value={hold} min={0.5} max={30} step={0.5} onChange={setHold} />
        <RenderFormatField value={video} onChange={setVideo} />
      </Panel>
      <JobArea state={job.state} onCancel={job.cancel} label="Rendering" action="Freeze this frame" onRun={run} done={(r) => <ConvertResultCard result={r} onReset={job.reset} resetLabel="Change settings" />} />
    </div>
  );
}

// ── Color scopes ──────────────────────────────────────────────────────────

function ScopesTool() {
  const { source, open, clear } = useSource();
  const player = useRef<FramePlayerHandle>(null);
  const [data, setData] = useState<ScopeData | null>(null);
  const [now, setNow] = useState(0);
  const canvas = useRef<HTMLCanvasElement | null>(null);

  const analyse = useCallback(() => {
    const v = player.current?.video;
    if (!v || v.readyState < 2 || !v.videoWidth) return;
    const w = Math.min(480, v.videoWidth);
    const h = Math.max(1, Math.round((v.videoHeight * w) / v.videoWidth));
    canvas.current ??= document.createElement('canvas');
    const c = canvas.current;
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, w, h);
    setData(computeScopes(ctx.getImageData(0, 0, w, h).data, w, h));
  }, []);

  useEffect(() => {
    if (source.status !== 'ready') return;
    let raf = 0;
    let last = 0;
    const loop = (t: number) => {
      if (t - last > 120) {
        last = t;
        analyse();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [source.status, analyse]);

  if (source.status !== 'ready') return <SourceGate source={source} open={open} clear={clear} accept={VIDEO_ACCEPT} />;
  const info = source.info;
  const clip = data ? clipping(data) : null;
  return (
    <div className="space-y-4">
      <SourceHeader file={source.file} info={info} onChange={clear} />
      <FramePlayer ref={player} src={source.url} duration={info.duration} fps={fpsOf(info)} onTime={setNow} />
      <p className="text-xs text-muted" aria-live="polite">
        Frame at <span className="font-mono">{formatFrameTime(now, fpsOf(info))}</span>
        {clip && (
          <>
            {' · '}
            <span className={clip.highlights > 1 ? 'text-warn' : ''}>{clip.highlights.toFixed(1)}% clipped highlights</span>
            {' · '}
            <span className={clip.shadows > 1 ? 'text-warn' : ''}>{clip.shadows.toFixed(1)}% crushed blacks</span>
          </>
        )}
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <ScopeView kind="waveform" data={data} className="rounded-lg border border-line bg-surface p-3" />
        <ScopeView kind="parade" data={data} className="rounded-lg border border-line bg-surface p-3" />
        <ScopeView kind="vectorscope" data={data} className="rounded-lg border border-line bg-surface p-3" />
        <ScopeView kind="histogram" data={data} className="rounded-lg border border-line bg-surface p-3" />
      </div>
      <p className="text-sm text-muted">
        Scopes update as you play or step through the video. Nothing is rendered or saved; this tool only measures. To fix what you see, open the video in the editor and
        grade it with curves, colour balance or a LUT.
      </p>
    </div>
  );
}

const BY_MODE: Record<string, () => ReactElement> = {
  denoise: DenoiseTool,
  loudness: LoudnessTool,
  bars: BarsTool,
  credits: CreditsTool,
  freeze: FreezeTool,
  scopes: ScopesTool,
};

export function FilmTool({ tool }: { tool: ToolDef }) {
  const C = BY_MODE[tool.mode ?? ''];
  return C ? <C /> : null;
}
