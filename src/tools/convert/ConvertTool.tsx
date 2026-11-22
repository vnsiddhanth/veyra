/**
 * One component for every single-file conversion tool (compress, convert, resize, crop, rotate,
 * frame rate, extract audio, mute, repair…). Each registry entry picks a mode and optional preset.
 * Processing is the media engine's validated `convert` job (or `render` for blur-fill).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { mediaEngine, type ConvertOptions, type ConvertResult, type MediaInfo, type OutputContainer, type QualityLevel } from '@/media-engine';
import { probeCodecs, VIDEO_CODEC_LABELS, type CodecCapabilities } from '@/media-engine/capabilities/codecs';
import { formatBytes } from '@/utils/format';
import type { ToolDef } from '../registry';
import { Composition } from '../shared/compose';
import { CheckField, ChoiceGroup, NumberField, Panel, SelectField } from '../shared/controls';
import { AUDIO_ACCEPT, baseName, ConvertResultCard, JobArea, SourceGate, SourceHeader, VIDEO_ACCEPT } from '../shared/ToolParts';
import { useMediaJob } from '../shared/useMediaJob';
import { useSource } from '../shared/useSource';
import { CropSelector, type CropRect } from './CropSelector';

export type ConvertMode = 'compress' | 'compress-size' | 'convert' | 'audio' | 'fps' | 'resolution' | 'resize' | 'aspect' | 'crop' | 'rotate' | 'repair' | 'mute';

const VIDEO_CONTAINERS: OutputContainer[] = ['mp4', 'webm', 'mov', 'mkv'];
const AUDIO_CONTAINERS: { value: OutputContainer; label: string; codec: string }[] = [
  { value: 'mp3', label: 'MP3', codec: 'mp3' },
  { value: 'm4a', label: 'M4A (AAC)', codec: 'aac' },
  { value: 'ogg', label: 'Ogg (Opus)', codec: 'opus' },
  { value: 'wav', label: 'WAV (uncompressed)', codec: 'pcm-s16' },
  { value: 'flac', label: 'FLAC (lossless)', codec: 'flac' },
  { value: 'adts', label: 'AAC (raw .aac)', codec: 'aac' },
];
const CONTAINER_VIDEO_CODECS: Record<string, string[]> = {
  mp4: ['avc', 'hevc', 'vp9', 'av1'],
  mov: ['avc', 'hevc', 'vp9', 'av1'],
  webm: ['vp9', 'av1', 'vp8'],
  mkv: ['avc', 'hevc', 'vp9', 'av1', 'vp8'],
};
const RESOLUTIONS: [string, number][] = [
  ['2160p (4K)', 2160],
  ['1440p', 1440],
  ['1080p', 1080],
  ['720p', 720],
  ['480p', 480],
  ['360p', 360],
];
const SIZE_PRESETS: { id: string; label: string; w: number; h: number }[] = [
  { id: 'yt', label: 'YouTube / landscape 1920×1080', w: 1920, h: 1080 },
  { id: 'reel', label: 'Reels / TikTok / Shorts 1080×1920', w: 1080, h: 1920 },
  { id: 'square', label: 'Square post 1080×1080', w: 1080, h: 1080 },
  { id: 'portrait', label: 'Portrait post 1080×1350', w: 1080, h: 1350 },
  { id: 'x', label: 'X / Twitter 1280×720', w: 1280, h: 720 },
  { id: 'custom', label: 'Custom size', w: 0, h: 0 },
];
const RATIOS: [string, number, number][] = [
  ['16:9', 16, 9],
  ['9:16', 9, 16],
  ['1:1', 1, 1],
  ['4:5', 4, 5],
  ['4:3', 4, 3],
  ['21:9', 21, 9],
];

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

function sourceContainer(mime: string): OutputContainer {
  if (mime.includes('quicktime')) return 'mov';
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('matroska')) return 'mkv';
  return 'mp4';
}

/** Scale (w, h) so the shorter side equals `p`, keeping aspect and even sizes. */
function scaleToP(info: MediaInfo, p: number): { width: number; height: number } {
  const portrait = info.height > info.width;
  if (portrait) return { width: p, height: even((p * info.height) / info.width) };
  return { width: even((p * info.width) / info.height), height: p };
}

/** Pick a resolution that a bitrate can carry reasonably (H.264-ish rule of thumb). */
function resolutionForBitrate(info: MediaInfo, bps: number): number | null {
  const short = Math.min(info.width, info.height);
  const steps: [number, number][] = [
    [1080, 3_500_000],
    [720, 1_500_000],
    [480, 700_000],
    [360, 350_000],
    [240, 0],
  ];
  for (const [p, min] of steps) if (bps >= min && p <= short) return p === short ? null : p;
  return 240;
}

export function ConvertTool({ tool }: { tool: ToolDef }) {
  const mode = (tool.mode ?? 'convert') as ConvertMode;
  const audioOnlyInput = tool.slug === 'audio-converter';
  const { source, open, clear } = useSource(audioOnlyInput ? 'audio' : mode === 'audio' ? 'audio' : true);
  const job = useMediaJob<ConvertResult>((r) => void mediaEngine.releaseOutput(r));
  const [caps, setCaps] = useState<CodecCapabilities | null>(null);
  useEffect(() => void probeCodecs().then(setCaps, () => setCaps(null)), []);

  // Options (only the ones relevant to the mode are shown).
  const [container, setContainer] = useState<OutputContainer>((tool.preset?.container as OutputContainer) ?? (mode === 'audio' ? 'mp3' : 'mp4'));
  const [videoCodec, setVideoCodec] = useState<string>('auto');
  const [quality, setQuality] = useState<QualityLevel>(mode === 'compress' ? 'low' : 'high');
  const [maxP, setMaxP] = useState<number>(0);
  const [targetMb, setTargetMb] = useState(25);
  const [audioKbps, setAudioKbps] = useState(mode === 'compress-size' ? 96 : 192);
  const [fps, setFps] = useState(30);
  const [resP, setResP] = useState(720);
  const [sizePreset, setSizePreset] = useState('yt');
  const [custom, setCustom] = useState({ w: 1280, h: 720 });
  const [fit, setFit] = useState<'contain' | 'cover' | 'fill'>('contain');
  const [ratio, setRatio] = useState('9:16');
  const [aspectMode, setAspectMode] = useState<'pad' | 'crop' | 'blur'>('blur');
  const [rotate, setRotate] = useState<0 | 90 | 180 | 270>(90);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [crop, setCrop] = useState<CropRect | null>(null);
  const [keepAudio, setKeepAudio] = useState(true);
  const attempt = useRef(0);

  const info = source.status === 'ready' ? source.info : null;
  const srcFps = info?.video[0]?.frameRate?.bestGuess ?? 30;

  useEffect(() => {
    if (!info) return;
    setFps(Math.round(srcFps) === 30 ? 60 : 30);
    setCrop({ left: 0, top: 0, width: info.width, height: info.height });
    if (mode === 'convert' && !tool.preset?.container) setContainer(sourceContainer(info.mimeType) === 'mp4' ? 'webm' : 'mp4');
    attempt.current = 0;
  }, [info, mode, srcFps, tool.preset]);

  const isAudioOut = mode === 'audio';
  const videoCodecs = useMemo(() => {
    const allowed = CONTAINER_VIDEO_CODECS[container] ?? [];
    return allowed.filter((c) => !caps || caps.encodeVideo.includes(c));
  }, [container, caps]);

  const targetSize = (() => {
    if (!info) return null;
    if (mode === 'resolution') return scaleToP(info, resP);
    if (mode === 'resize') {
      const p = SIZE_PRESETS.find((x) => x.id === sizePreset)!;
      return p.id === 'custom' ? { width: even(custom.w), height: even(custom.h) } : { width: p.w, height: p.h };
    }
    if (mode === 'aspect') {
      const r = RATIOS.find((x) => x[0] === ratio)!;
      // Keep the larger dimension of the source and derive the other from the ratio.
      const long = Math.max(info.width, info.height);
      return r[1] >= r[2] ? { width: even(long), height: even((long * r[2]) / r[1]) } : { width: even((long * r[1]) / r[2]), height: even(long) };
    }
    if (mode === 'compress' && maxP && maxP < Math.min(info.width, info.height)) return scaleToP(info, maxP);
    return null;
  })();

  const sizeBitrate = (() => {
    if (!info || mode !== 'compress-size' || info.duration <= 0) return null;
    const totalBits = targetMb * 1_000_000 * 8 * 0.96; // container overhead margin
    const audioBits = info.audio.length && keepAudio ? audioKbps * 1000 * info.duration : 0;
    return Math.floor((totalBits - audioBits) / info.duration);
  })();

  const build = (scale = 1): ConvertOptions | null => {
    if (source.status !== 'ready' || !info) return null;
    const name = `${baseName(source.file.name)}-${tool.slug}`;
    const o: ConvertOptions = { container, fileName: name, video: {}, audio: {} };
    const vcodec = videoCodec !== 'auto' && videoCodecs.includes(videoCodec) ? videoCodec : undefined;
    switch (mode) {
      case 'compress': {
        // A retry (scale < 1) uses an explicit bitrate below the source's: some encoders (Safari's
        // H.264) overshoot the quality presets on simple footage and would return a bigger file.
        const srcVideoBps = info.duration > 0 ? (source.file.size * 8) / info.duration - (info.audio.length ? 128_000 : 0) : 0;
        const vb = scale < 1 && srcVideoBps > 0 ? Math.max(80_000, Math.floor(srcVideoBps * scale)) : quality;
        o.video = { bitrate: vb, codec: vcodec, ...(targetSize ?? {}) };
        o.audio = { bitrate: quality === 'very-low' ? 64_000 : 128_000 };
        o.copy = 'never';
        break;
      }
      case 'compress-size': {
        const vb = Math.max(80_000, Math.floor((sizeBitrate ?? 500_000) * scale));
        const p = resolutionForBitrate(info, vb);
        o.video = { bitrate: vb, codec: vcodec, ...(p ? scaleToP(info, p) : {}) };
        o.audio = keepAudio ? { bitrate: audioKbps * 1000 } : { discard: true };
        o.copy = 'never';
        break;
      }
      case 'convert':
        o.video = { codec: vcodec };
        break;
      case 'audio': {
        const c = AUDIO_CONTAINERS.find((x) => x.value === container);
        o.audio = { codec: c?.codec, bitrate: container === 'wav' || container === 'flac' ? undefined : audioKbps * 1000 };
        break;
      }
      case 'fps':
        o.video = { frameRate: fps, codec: vcodec, bitrate: 'high' };
        break;
      case 'resolution':
      case 'resize':
        o.video = { ...targetSize!, fit: mode === 'resolution' ? 'fill' : fit, codec: vcodec, bitrate: 'high' };
        break;
      case 'aspect':
        o.video = { ...targetSize!, fit: aspectMode === 'crop' ? 'cover' : 'contain', codec: vcodec, bitrate: 'high' };
        break;
      case 'crop':
        if (crop) o.video = { crop: { left: Math.round(crop.left), top: Math.round(crop.top), width: even(crop.width), height: even(crop.height) }, codec: vcodec, bitrate: 'high' };
        break;
      case 'rotate':
        // Vertical flip = 180° rotation + horizontal flip.
        o.video = { rotate: ((rotate + (flipV ? 180 : 0)) % 360) as 0 | 90 | 180 | 270, flip: flipH !== flipV, codec: vcodec, bitrate: 'high' };
        break;
      case 'repair':
        o.copy = 'accurate';
        break;
      case 'mute':
        o.audio = { discard: true };
        break;
    }
    if (!keepAudio && mode !== 'mute' && mode !== 'audio') o.audio = { discard: true };
    return o;
  };

  const run = (scale = 1) => {
    if (source.status !== 'ready' || !info) return;
    if (mode === 'aspect' && aspectMode === 'blur' && targetSize) {
      // Blur-fill needs compositing: blurred, zoomed copy behind a fitted copy.
      const comp = Composition.fromVideo(info, targetSize);
      const asset = comp.asset(source.file, info, 'video', source.file.name);
      const bgTrack = comp.track('video', 'bottom');
      const fgTrack = comp.track('video', 'top');
      const dur = comp.q(info.duration, 'floor');
      const contain = Math.min(targetSize.width / info.width, targetSize.height / info.height);
      const cover = Math.max(targetSize.width / info.width, targetSize.height / info.height);
      const z = (cover / contain) * 1.05;
      comp.clip(bgTrack, {
        assetId: asset.id,
        start: 0,
        duration: dur,
        transform: { x: 0, y: 0, scaleX: z, scaleY: z, rotation: 0, flipH: false, flipV: false, crop: { left: 0, top: 0, right: 0, bottom: 0 } },
        effects: [
          { id: 'b', type: 'blur', enabled: true, params: { radius: 40 } },
          { id: 'd', type: 'brightness', enabled: true, params: { amount: -0.25 } },
        ],
        audio: { gain: 0, pan: 0, fadeIn: 0, fadeOut: 0 },
      });
      comp.clip(fgTrack, { assetId: asset.id, start: 0, duration: dur, ...(keepAudio ? {} : { audio: { gain: 0, pan: 0, fadeIn: 0, fadeOut: 0 } }) });
      job.run(() =>
        mediaEngine.render(
          comp.input({ container: container as 'mp4', videoCodec: videoCodec === 'auto' ? null : videoCodec, fileName: `${baseName(source.file.name)}-${ratio.replace(':', 'x')}`, videoBitrate: 'high' }),
        ),
      );
      return;
    }
    const o = build(scale);
    if (o) job.run(() => mediaEngine.convert(source.file, o));
  };

  // Compress-to-size: encoders do not hit a bitrate exactly. If the result is over the limit,
  // retry with a proportionally lower bitrate (up to two times) instead of handing over a file that doesn't fit.
  useEffect(() => {
    // Compress: never hand back a file bigger than the source; retry at an explicit, lower bitrate.
    if (mode === 'compress' && job.state.status === 'done' && source.status === 'ready') {
      if (job.state.result.file.size >= source.file.size && attempt.current < 2) {
        attempt.current++;
        run(0.6 ** attempt.current);
      }
      return;
    }
    if (mode !== 'compress-size' || job.state.status !== 'done') return;
    const size = job.state.result.file.size;
    const limit = targetMb * 1_000_000;
    if (size > limit && attempt.current < 2) {
      attempt.current++;
      const factor = (limit / size) * 0.92;
      run(factor ** attempt.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.state]);

  const gate = <SourceGate source={source} open={open} clear={clear} accept={audioOnlyInput || mode === 'audio' ? AUDIO_ACCEPT : VIDEO_ACCEPT} label={audioOnlyInput ? 'Drop an audio or video file here' : undefined} />;
  if (source.status !== 'ready' || !info) return gate;
  const busy = job.state.status === 'running';
  const hasAudio = info.audio.length > 0;

  const containerSelect = isAudioOut ? (
    <SelectField label="Output format" value={container} onChange={setContainer} options={AUDIO_CONTAINERS.map((c) => ({ value: c.value, label: c.label, disabled: caps ? c.codec !== 'mp3' && c.codec !== 'pcm-s16' && !caps.encodeAudio.includes(c.codec) : false }))} />
  ) : (
    <SelectField
      label="Output format"
      value={container}
      onChange={(v) => {
        setContainer(v);
        setVideoCodec('auto');
      }}
      options={VIDEO_CONTAINERS.filter((c) => !tool.preset?.container || c === tool.preset.container).map((c) => [c, c.toUpperCase()] as const)}
    />
  );
  const codecSelect = !isAudioOut && mode !== 'mute' && mode !== 'repair' && (
    <SelectField
      label="Video codec"
      value={videoCodec}
      onChange={setVideoCodec}
      options={[['auto', mode === 'convert' ? 'Automatic (copy if compatible)' : 'Automatic'] as const, ...videoCodecs.map((c) => [c, VIDEO_CODEC_LABELS[c] ?? c] as const)]}
      hint={caps ? 'Only codecs this browser can encode are listed.' : 'Checking encoders…'}
    />
  );
  const audioToggle = hasAudio && !isAudioOut && mode !== 'mute' && <CheckField label="Keep audio" checked={keepAudio} onChange={setKeepAudio} />;

  let controls: React.ReactNode = null;
  switch (mode) {
    case 'compress':
      controls = (
        <>
          <SelectField
            label="Compression"
            value={quality}
            onChange={setQuality}
            options={[
              ['very-low', 'Strongest (smallest file)'],
              ['low', 'Strong'],
              ['medium', 'Balanced'],
              ['high', 'Light (best quality)'],
            ]}
          />
          <SelectField label="Maximum resolution" value={String(maxP)} onChange={(v) => setMaxP(Number(v))} options={[['0', 'Keep original'], ...RESOLUTIONS.filter(([, p]) => p < Math.min(info.width, info.height)).map(([l, p]) => [String(p), l] as const)]} />
          {containerSelect}
          {codecSelect}
          {audioToggle}
        </>
      );
      break;
    case 'compress-size':
      controls = (
        <>
          <NumberField label="Target size" unit="MB" value={targetMb} min={1} max={4000} step={1} onChange={setTargetMb} hint={`Source is ${formatBytes(source.file.size)}.`} />
          <SelectField label="Audio bitrate" value={String(audioKbps)} onChange={(v) => setAudioKbps(Number(v))} options={[['64', '64 kbps'], ['96', '96 kbps'], ['128', '128 kbps']]} />
          {containerSelect}
          <div className="text-sm md:col-span-3">
            {sizeBitrate != null && sizeBitrate < 80_000 ? (
              <p className="text-danger">That target is too small for {info.duration.toFixed(1)} s of video. Raise the size or trim the video first.</p>
            ) : (
              <p className="text-muted">
                Video bitrate ≈ <span className="font-mono">{sizeBitrate ? Math.round(sizeBitrate / 1000) : '–'} kbps</span>
                {sizeBitrate && resolutionForBitrate(info, sizeBitrate) ? `, scaled to ${resolutionForBitrate(info, sizeBitrate)}p to keep it watchable` : ''}. If the first result is over the limit, it is re-encoded smaller automatically.
              </p>
            )}
          </div>
          {audioToggle}
        </>
      );
      break;
    case 'convert':
    case 'repair':
      controls = (
        <>
          {containerSelect}
          {codecSelect}
          {mode === 'repair' && <p className="text-sm text-muted md:col-span-2">Packets are copied into a fresh container without re-encoding. Missing or broken index data is rebuilt; damaged frames inside the stream cannot be recovered.</p>}
          {audioToggle}
        </>
      );
      break;
    case 'audio':
      controls = (
        <>
          {containerSelect}
          {container !== 'wav' && container !== 'flac' && (
            <SelectField label="Bitrate" value={String(audioKbps)} onChange={(v) => setAudioKbps(Number(v))} options={['96', '128', '160', '192', '256', '320'].map((b) => [b, `${b} kbps`] as const)} />
          )}
          <p className="text-xs text-faint md:col-span-3">MP3 is encoded with a WebAssembly LAME encoder when the browser has no native MP3 encoder.</p>
        </>
      );
      break;
    case 'fps':
      controls = (
        <>
          <SelectField label="New frame rate" value={String(fps)} onChange={(v) => setFps(Number(v))} options={['12', '15', '24', '25', '30', '48', '50', '60'].map((f) => [f, `${f} fps`] as const)} hint={`Source: ${Number(srcFps.toFixed(3))} fps. Lower rates drop frames; higher rates repeat frames (no interpolation).`} />
          {containerSelect}
          {codecSelect}
          {audioToggle}
        </>
      );
      break;
    case 'resolution':
      controls = (
        <>
          <SelectField
            label="Resolution"
            value={String(resP)}
            onChange={(v) => setResP(Number(v))}
            options={RESOLUTIONS.map(([l, p]) => {
              const s = scaleToP(info, p);
              const srcP = Math.min(info.width, info.height);
              const tag = p > srcP ? ' (upscale)' : p === srcP ? ' (same as source)' : '';
              return [String(p), `${l} → ${s.width}×${s.height}${tag}`] as const;
            })}
            hint={`Source: ${info.width}×${info.height}.`}
          />
          {containerSelect}
          {codecSelect}
          {audioToggle}
          {resP > Math.min(info.width, info.height) && (
            <p role="note" className="rounded-md border border-line bg-surface-2 p-3 text-sm text-muted md:col-span-3">
              <strong className="text-fg">Upscaling won’t make it sharper.</strong> It enlarges the frame to {scaleToP(info, resP).width}×{scaleToP(info, resP).height}, but it can’t add
              detail the camera didn’t record, so it will look about the same with a bigger file. Use it when a platform or editor needs that exact size.
            </p>
          )}
        </>
      );
      break;
    case 'resize':
      controls = (
        <>
          <SelectField label="Size" value={sizePreset} onChange={setSizePreset} options={SIZE_PRESETS.map((p) => [p.id, p.label] as const)} />
          {sizePreset === 'custom' && (
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="Width" unit="px" value={custom.w} min={16} max={7680} onChange={(w) => setCustom((c) => ({ ...c, w }))} />
              <NumberField label="Height" unit="px" value={custom.h} min={16} max={7680} onChange={(h) => setCustom((c) => ({ ...c, h }))} />
            </div>
          )}
          <ChoiceGroup
            name="fit"
            label="Fit"
            value={fit}
            onChange={setFit}
            options={[
              ['contain', 'Fit', 'Whole picture, black bars'],
              ['cover', 'Fill', 'Crop edges to fill'],
              ['fill', 'Stretch', 'Distort to fit'],
            ]}
          />
          {containerSelect}
          {codecSelect}
          {audioToggle}
        </>
      );
      break;
    case 'aspect':
      controls = (
        <>
          <SelectField label="Aspect ratio" value={ratio} onChange={setRatio} options={RATIOS.map(([r]) => [r, r] as const)} hint={targetSize ? `Output ${targetSize.width}×${targetSize.height}` : undefined} />
          <ChoiceGroup
            name="aspect-mode"
            label="Fill the new frame with"
            value={aspectMode}
            onChange={setAspectMode}
            options={[
              ['blur', 'Blurred background'],
              ['pad', 'Black bars'],
              ['crop', 'Crop'],
            ]}
          />
          {containerSelect}
          {audioToggle}
        </>
      );
      break;
    case 'crop':
      controls = (
        <>
          <div className="md:col-span-3">
            <CropSelector src={source.url} info={info} value={crop} onChange={setCrop} />
          </div>
          {containerSelect}
          {codecSelect}
          {audioToggle}
        </>
      );
      break;
    case 'rotate':
      controls = (
        <>
          <ChoiceGroup
            name="rotate"
            label="Rotate clockwise"
            value={String(rotate) as '0' | '90' | '180' | '270'}
            onChange={(v) => setRotate(Number(v) as 0 | 90 | 180 | 270)}
            options={[
              ['0', 'None'],
              ['90', '90°'],
              ['180', '180°'],
              ['270', '270°'],
            ]}
          />
          <div className="space-y-2">
            <CheckField label="Flip horizontally (mirror)" checked={flipH} onChange={setFlipH} />
            <CheckField label="Flip vertically" checked={flipV} onChange={setFlipV} />
          </div>
          {containerSelect}
          {codecSelect}
          {audioToggle}
        </>
      );
      break;
    case 'mute':
      controls = (
        <>
          {containerSelect}
          <p className="text-sm text-muted md:col-span-2">The video stream is copied unchanged; only the audio track is removed.</p>
        </>
      );
      break;
  }

  const disabledReason =
    mode === 'mute' && !hasAudio
      ? 'This video has no audio track.'
      : mode === 'compress-size' && (sizeBitrate ?? 0) < 80_000
        ? 'Target size too small.'
        : mode === 'rotate' && rotate === 0 && !flipH && !flipV
          ? 'Choose a rotation or flip.'
          : mode === 'crop' && crop && crop.width >= info.width - 1 && crop.height >= info.height - 1
            ? 'Drag on the picture to choose a crop.'
            : null;

  return (
    <div className="space-y-4">
      <SourceHeader file={source.file} info={info} onChange={() => (job.reset(), clear())} disabled={busy} />
      {mode !== 'crop' && info.video.length > 0 && <video src={source.url} controls preload="metadata" className="max-h-72 w-full rounded-lg bg-black" aria-label="Source preview" />}
      {mode !== 'crop' && info.video.length === 0 && <audio src={source.url} controls className="w-full" aria-label="Source preview" />}
      <Panel>{controls}</Panel>
      <JobArea
        state={job.state}
        onCancel={job.cancel}
        label={(mode === 'compress-size' || mode === 'compress') && attempt.current > 0 ? `Re-encoding smaller (attempt ${attempt.current + 1})` : 'Processing'}
        action={tool.action ?? 'Convert'}
        disabledReason={disabledReason}
        onRun={() => {
          attempt.current = 0;
          run();
        }}
        done={(r) => (
          <>
            {mode === 'compress-size' && r.file.size > targetMb * 1_000_000 && (
              <p className="rounded-md border border-warn/40 bg-warn/10 p-2 text-sm text-warn">
                The smallest result is {formatBytes(r.file.size)}, still over {targetMb} MB. Trim the video or choose a larger target.
              </p>
            )}
            {mode === 'compress' && r.file.size >= source.file.size && (
              <p className="rounded-md border border-warn/40 bg-warn/10 p-2 text-sm text-warn">
                This browser’s video encoder could not make this file smaller at {r.info.width}×{r.info.height}: the original is already compact.
                Keep the original, or choose a lower maximum resolution.
              </p>
            )}
            {mode.startsWith('compress') && (
              <p className="text-sm text-muted">
                {formatBytes(source.file.size)} → {formatBytes(r.file.size)} (
                {r.file.size < source.file.size ? `${Math.round((1 - r.file.size / source.file.size) * 100)}% smaller` : `${Math.round((r.file.size / source.file.size - 1) * 100)}% larger`})
              </p>
            )}
            <ConvertResultCard result={r} onReset={job.reset} resetLabel="Change settings" />
          </>
        )}
      />
    </div>
  );
}
