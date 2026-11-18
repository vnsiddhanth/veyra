/**
 * Single-video tools with a live preview: add text, add a watermark, burn in subtitles, and apply
 * a look (filters / colour). Everything is rendered by the same compositor used for export.
 */
import { useMemo, useState } from 'react';
import { mediaEngine, type ConvertResult, type MediaInfo } from '@/media-engine';
import { parseSubtitles, type SubtitleCue } from '@/media-engine/subtitles/parse';
import { identityTransform } from '@/project/schema/factory';
import type { EffectInstance, TextContent } from '@/project/schema/types';
import { DEFAULT_SUBTITLE_STYLE } from '@/render/compositor';
import { defaultParams, EFFECT_BY_TYPE, EFFECTS } from '@/render/effects';
import type { ToolDef } from '../registry';
import { Composition } from '../shared/compose';
import { CompositionPreview } from '../shared/CompositionPreview';
import { CheckField, ColorField, NumberField, Panel, RangeField, SelectField, TextField } from '../shared/controls';
import { baseName, ConvertResultCard, ErrorBox, IMAGE_ACCEPT, JobArea, SourceDrop, SourceGate, SourceHeader, VIDEO_ACCEPT } from '../shared/ToolParts';
import { useMediaJob } from '../shared/useMediaJob';
import { useSource } from '../shared/useSource';
import { RenderFormatField, useBitmaps, type RenderContainer } from './common';

export type DecorMode = 'text' | 'watermark' | 'subtitles' | 'look';

const POSITIONS: [string, string][] = [
  ['top-left', 'Top left'],
  ['top', 'Top centre'],
  ['top-right', 'Top right'],
  ['center', 'Centre'],
  ['bottom-left', 'Bottom left'],
  ['bottom', 'Bottom centre'],
  ['bottom-right', 'Bottom right'],
];

/** Offset from frame centre for a named position, given the item's size and a margin. */
function place(pos: string, W: number, H: number, w: number, h: number, margin: number): { x: number; y: number } {
  const x = pos.endsWith('left') ? -W / 2 + margin + w / 2 : pos.endsWith('right') ? W / 2 - margin - w / 2 : 0;
  const y = pos.startsWith('top') ? -H / 2 + margin + h / 2 : pos.startsWith('bottom') ? H / 2 - margin - h / 2 : 0;
  return { x, y };
}

export const LOOK_PRESETS: { id: string; label: string; effects: [string, Record<string, number | string | boolean>][] }[] = [
  { id: 'none', label: 'None', effects: [] },
  { id: 'bw', label: 'Black & white', effects: [['grayscale', { amount: 1 }], ['contrast', { amount: 0.15 }]] },
  { id: 'vintage', label: 'Vintage', effects: [['vintage', { amount: 1 }], ['vignette', { amount: 0.5, softness: 0.6 }], ['grain', { amount: 0.25 }]] },
  { id: 'warm', label: 'Warm', effects: [['color-balance', { temperature: 0.5, tint: 0 }], ['saturation', { amount: 0.1 }]] },
  { id: 'cool', label: 'Cool', effects: [['color-balance', { temperature: -0.5, tint: 0 }]] },
  { id: 'cinematic', label: 'Cinematic', effects: [['contrast', { amount: 0.2 }], ['saturation', { amount: -0.15 }], ['color-balance', { temperature: 0.15, tint: -0.1 }], ['vignette', { amount: 0.45, softness: 0.5 }]] },
  { id: 'vivid', label: 'Vivid', effects: [['saturation', { amount: 0.45 }], ['contrast', { amount: 0.1 }]] },
  { id: 'fade', label: 'Faded film', effects: [['curves', { shadows: 0.12, midtones: 1.05, highlights: -0.06 }], ['saturation', { amount: -0.25 }]] },
];

function effect(type: string, params: Record<string, number | string | boolean>): EffectInstance {
  return { id: `fx_${type}`, type, enabled: true, params: { ...defaultParams(EFFECT_BY_TYPE.get(type)!), ...params } };
}

export function DecorTool({ tool }: { tool: ToolDef }) {
  const mode = (tool.mode ?? 'text') as DecorMode;
  const video = useSource(true);
  if (video.source.status !== 'ready') return <SourceGate source={video.source} open={video.open} clear={video.clear} accept={VIDEO_ACCEPT} />;
  return <DecorEditor key={video.source.url} mode={mode} file={video.source.file} url={video.source.url} info={video.source.info} onChange={video.clear} />;
}

function DecorEditor({ mode, file, url, info, onChange }: { mode: DecorMode; file: File; url: string; info: MediaInfo; onChange(): void }) {
  const job = useMediaJob<ConvertResult>((r) => void mediaEngine.releaseOutput(r));
  const [container, setContainer] = useState<RenderContainer>('mp4');
  // Text
  const [text, setText] = useState('Your title here');
  const [fontSize, setFontSize] = useState(Math.round(info.height / 12));
  const [color, setColor] = useState('#ffffff');
  const [box, setBox] = useState(false);
  const [outline, setOutline] = useState(true);
  const [pos, setPos] = useState(mode === 'watermark' ? 'bottom-right' : 'bottom');
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(Math.min(info.duration, 5));
  const [anim, setAnim] = useState('fade');
  const [font, setFont] = useState('Inter, system-ui, sans-serif');
  // Watermark
  const watermark = useSource(false);
  const [wmKind, setWmKind] = useState<'image' | 'text'>('image');
  const [wmScale, setWmScale] = useState(0.18);
  const [wmOpacity, setWmOpacity] = useState(0.8);
  // Subtitles
  const [cues, setCues] = useState<SubtitleCue[] | null>(null);
  const [subError, setSubError] = useState<string | null>(null);
  // Look
  const [preset, setPreset] = useState('cinematic');
  const [adj, setAdj] = useState({ brightness: 0, contrast: 0, saturation: 0, temperature: 0, vignette: 0, blur: 0 });

  const W = info.width;
  const H = info.height;
  const wmFiles = useMemo(() => new Map(watermark.source.status === 'ready' && wmKind === 'image' ? [['wm', watermark.source.file as Blob]] : []), [watermark.source, wmKind]);
  const bitmaps = useBitmaps(wmFiles);

  const comp = useMemo(() => {
    const c = Composition.fromVideo(info);
    const asset = c.asset(file, info, 'video', file.name);
    const vTrack = c.track('video');
    const total = c.q(info.duration, 'floor');
    const effects: EffectInstance[] = [];
    if (mode === 'look') {
      for (const [type, params] of LOOK_PRESETS.find((p) => p.id === preset)?.effects ?? []) effects.push(effect(type, params));
      if (adj.brightness) effects.push({ ...effect('brightness', { amount: adj.brightness }), id: 'a_b' });
      if (adj.contrast) effects.push({ ...effect('contrast', { amount: adj.contrast }), id: 'a_c' });
      if (adj.saturation) effects.push({ ...effect('saturation', { amount: adj.saturation }), id: 'a_s' });
      if (adj.temperature && !effects.some((e) => e.type === 'color-balance')) effects.push(effect('color-balance', { temperature: adj.temperature, tint: 0 }));
      if (adj.vignette && !effects.some((e) => e.type === 'vignette')) effects.push(effect('vignette', { amount: adj.vignette, softness: 0.5 }));
      if (adj.blur) effects.push(effect('blur', { radius: adj.blur }));
    }
    c.clip(vTrack, { assetId: asset.id, start: 0, duration: total, effects, name: file.name });

    const style: TextContent = {
      text,
      fontFamily: font,
      fontSize,
      fontWeight: 700,
      color,
      background: box ? 'rgba(0,0,0,0.6)' : null,
      align: 'center',
      outline: outline ? { color: '#000000', width: Math.max(1, fontSize / 18) } : null,
      shadow: outline ? null : { color: 'rgba(0,0,0,0.6)', blur: fontSize / 6, x: 0, y: fontSize / 24 },
      letterSpacing: 0,
      lineHeight: 1.2,
    };
    const margin = Math.round(Math.min(W, H) * 0.05);
    if (mode === 'text' || (mode === 'watermark' && wmKind === 'text')) {
      const tTrack = c.track('text');
      const lines = text.split('\n').length;
      const approxW = Math.min(W * 0.9, fontSize * 0.6 * Math.max(...text.split('\n').map((l) => l.length)));
      const { x, y } = place(pos, W, H, approxW, fontSize * 1.2 * lines, margin);
      const start = mode === 'watermark' ? 0 : c.q(Math.min(from, info.duration - 0.1));
      const end = mode === 'watermark' ? total : Math.min(total, c.q(Math.max(to, from + 0.1)));
      c.clip(tTrack, {
        assetId: null,
        start,
        duration: Math.max(c.q(0.1), end - start),
        text: style,
        opacity: mode === 'watermark' ? wmOpacity : 1,
        transform: { ...identityTransform(), x, y },
        effects: mode === 'text' && anim !== 'none' ? [{ id: 'ta', type: 'text-animation', enabled: true, params: { in: anim, out: anim === 'typewriter' ? 'fade' : anim === 'slide-up' ? 'slide-down' : anim, duration: 0.5 } }] : [],
        name: 'Text',
      });
    }
    if (mode === 'watermark' && wmKind === 'image' && watermark.source.status === 'ready') {
      const wInfo = watermark.source.info;
      const wAsset = c.asset(watermark.source.file, wInfo, 'image', watermark.source.file.name);
      // Keep a stable id so the preview can find the bitmap.
      c.project = { ...c.project, assets: c.project.assets.map((a) => (a.id === wAsset.id ? { ...a, id: 'wm' } : a)) };
      c.files.wm = watermark.source.file;
      delete c.files[wAsset.id];
      const oTrack = c.track('overlay');
      // Image fitted into the frame at scale 1; scale so its width is wmScale × frame width.
      const fit = Math.min(W / wInfo.width, H / wInfo.height);
      const scale = (W * wmScale) / (wInfo.width * fit);
      const w = wInfo.width * fit * scale;
      const h = wInfo.height * fit * scale;
      const { x, y } = place(pos, W, H, w, h, margin);
      c.clip(oTrack, { assetId: 'wm', start: 0, duration: total, opacity: wmOpacity, transform: { ...identityTransform(), x, y, scaleX: scale, scaleY: scale }, name: 'Watermark' });
    }
    if (mode === 'subtitles' && cues) {
      const sAsset = c.asset(new Blob([]), null, 'subtitle', 'subtitles', cues);
      delete c.files[sAsset.id];
      const sTrack = c.track('text');
      c.clip(sTrack, { assetId: sAsset.id, start: 0, duration: total, text: { ...DEFAULT_SUBTITLE_STYLE, fontSize, color, background: box ? 'rgba(0,0,0,0.6)' : null, outline: outline ? { color: '#000', width: Math.max(1, fontSize / 16) } : null }, transform: { ...identityTransform(), y: H / 2 - margin * 1.5 - fontSize }, name: 'Subtitles' });
    }
    return c;
  }, [info, file, mode, text, font, fontSize, color, box, outline, pos, from, to, anim, wmKind, wmScale, wmOpacity, watermark.source, cues, preset, adj, W, H]);

  const loadSubs = async (f: File) => {
    try {
      const r = parseSubtitles(await f.text());
      if (!r.cues.length) throw new Error('No cues found in this file.');
      setCues(r.cues);
      setSubError(null);
    } catch (e) {
      setSubError(e instanceof Error ? e.message : String(e));
    }
  };

  const disabled =
    mode === 'subtitles' && !cues ? 'Add a subtitle file.' : mode === 'watermark' && wmKind === 'image' && watermark.source.status !== 'ready' ? 'Add a logo image.' : mode === 'text' && !text.trim() ? 'Type some text.' : null;

  return (
    <div className="space-y-4">
      <SourceHeader file={file} info={info} onChange={() => (job.reset(), onChange())} disabled={job.state.status === 'running'} />
      <CompositionPreview project={comp.project} videoUrl={url} videoAssetId={comp.project.assets[0]!.id} stills={bitmaps} duration={info.duration} />
      <Panel>
        {(mode === 'text' || (mode === 'watermark' && wmKind === 'text')) && (
          <>
            <div className="md:col-span-2">
              <TextField label="Text" value={text} onChange={setText} multiline />
            </div>
            <SelectField
              label="Font"
              value={font}
              onChange={setFont}
              options={[
                ['Inter, system-ui, sans-serif', 'Sans serif'],
                ['Georgia, "Times New Roman", serif', 'Serif'],
                ['"Courier New", monospace', 'Monospace'],
                ['Impact, "Arial Black", sans-serif', 'Impact'],
              ]}
            />
          </>
        )}
        {mode === 'watermark' && (
          <SelectField
            label="Watermark"
            value={wmKind}
            onChange={setWmKind}
            options={[
              ['image', 'Logo image'],
              ['text', 'Text'],
            ]}
          />
        )}
        {mode === 'watermark' && wmKind === 'image' && (
          <div className="md:col-span-2">
            {watermark.source.status === 'ready' ? (
              <SourceHeader file={watermark.source.file} info={watermark.source.info} onChange={watermark.clear} />
            ) : (
              <SourceDrop onFile={watermark.open} accept={IMAGE_ACCEPT} label="Drop your logo (PNG with transparency works best)" />
            )}
          </div>
        )}
        {mode === 'subtitles' && (
          <div className="md:col-span-3">
            {cues ? (
              <p className="text-sm">
                {cues.length} subtitle cues loaded.{' '}
                <button className="text-accent hover:underline" onClick={() => setCues(null)}>
                  Use another file
                </button>
              </p>
            ) : (
              <SourceDrop onFile={(f) => void loadSubs(f)} accept=".srt,.vtt,text/vtt" label="Drop an .srt or .vtt subtitle file" hint="Cue text is shown as plain text (no HTML)." />
            )}
            {subError && <ErrorBox error={subError} />}
          </div>
        )}
        {(mode === 'text' || mode === 'subtitles' || (mode === 'watermark' && wmKind === 'text')) && (
          <>
            <NumberField label="Text size" unit="px" value={fontSize} min={8} max={400} onChange={setFontSize} />
            <ColorField label="Colour" value={color} onChange={setColor} />
            <div className="space-y-2">
              <CheckField label="Background box" checked={box} onChange={setBox} />
              <CheckField label="Outline" checked={outline} onChange={setOutline} />
            </div>
          </>
        )}
        {(mode === 'text' || mode === 'watermark') && <SelectField label="Position" value={pos} onChange={setPos} options={POSITIONS} />}
        {mode === 'text' && (
          <>
            <NumberField label="Show from" unit="s" value={from} min={0} max={info.duration} step={0.1} onChange={setFrom} />
            <NumberField label="Until" unit="s" value={to} min={0} max={info.duration} step={0.1} onChange={setTo} />
            <SelectField
              label="Animation"
              value={anim}
              onChange={setAnim}
              options={[
                ['none', 'None'],
                ['fade', 'Fade'],
                ['slide-up', 'Slide up'],
                ['pop', 'Pop'],
                ['typewriter', 'Typewriter'],
              ]}
            />
          </>
        )}
        {mode === 'watermark' && (
          <>
            {wmKind === 'image' && <RangeField label="Size" value={wmScale} min={0.05} max={0.6} step={0.01} onChange={setWmScale} format={(v) => `${Math.round(v * 100)}% of width`} />}
            <RangeField label="Opacity" value={wmOpacity} min={0.1} max={1} step={0.05} onChange={setWmOpacity} format={(v) => `${Math.round(v * 100)}%`} />
          </>
        )}
        {mode === 'look' && (
          <>
            <SelectField label="Look" value={preset} onChange={setPreset} options={LOOK_PRESETS.map((p) => [p.id, p.label] as const)} />
            <RangeField label="Brightness" value={adj.brightness} min={-1} max={1} onChange={(v) => setAdj((a) => ({ ...a, brightness: v }))} format={(v) => v.toFixed(2)} />
            <RangeField label="Contrast" value={adj.contrast} min={-1} max={1} onChange={(v) => setAdj((a) => ({ ...a, contrast: v }))} format={(v) => v.toFixed(2)} />
            <RangeField label="Saturation" value={adj.saturation} min={-1} max={1} onChange={(v) => setAdj((a) => ({ ...a, saturation: v }))} format={(v) => v.toFixed(2)} />
            <RangeField label="Temperature" value={adj.temperature} min={-1} max={1} onChange={(v) => setAdj((a) => ({ ...a, temperature: v }))} format={(v) => v.toFixed(2)} />
            <RangeField label="Vignette" value={adj.vignette} min={0} max={1} onChange={(v) => setAdj((a) => ({ ...a, vignette: v }))} format={(v) => v.toFixed(2)} />
            <RangeField label="Blur" value={adj.blur} min={0} max={20} step={0.5} onChange={(v) => setAdj((a) => ({ ...a, blur: v }))} format={(v) => `${v}px`} />
            <p className="text-xs text-faint md:col-span-3">Available effects: {EFFECTS.filter((e) => e.kind === 'filter' || e.kind === 'pixel').map((e) => e.label).join(', ')}. Open the editor to stack and keyframe them.</p>
          </>
        )}
        <RenderFormatField value={container} onChange={setContainer} />
      </Panel>
      <JobArea
        state={job.state}
        onCancel={job.cancel}
        label="Rendering"
        action="Render video"
        disabledReason={disabled}
        onRun={() => job.run(() => mediaEngine.render(comp.input({ container, fileName: `${baseName(file.name)}-${mode}`, videoBitrate: 'high' })))}
        done={(r) => <ConvertResultCard result={r} onReset={job.reset} resetLabel="Change settings" />}
      />
    </div>
  );
}
