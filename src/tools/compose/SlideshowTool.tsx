/** Photos → video with transitions, optional pan/zoom and music. */
import { useState } from 'react';
import { mediaEngine, type ConvertResult } from '@/media-engine';
import { formatDuration } from '@/utils/format';
import { fpsToRational } from '@/utils/time';
import type { ToolDef } from '../registry';
import { Composition } from '../shared/compose';
import { CheckField, ColorField, NumberField, Panel, RangeField, SelectField } from '../shared/controls';
import { AUDIO_ACCEPT, ConvertResultCard, IMAGE_ACCEPT, JobArea, SourceDrop, SourceGate, SourceHeader } from '../shared/ToolParts';
import { useMediaJob } from '../shared/useMediaJob';
import { useSource } from '../shared/useSource';
import { RenderFormatField, useProbedFiles, type RenderContainer } from './common';
import { AddFiles, TRANSITIONS } from './MergeTool';
import { OrderedFiles } from './OrderedFiles';

const SIZES: [string, string, number, number][] = [
  ['1080p', 'Landscape 1920×1080', 1920, 1080],
  ['720p', 'Landscape 1280×720', 1280, 720],
  ['vertical', 'Vertical 1080×1920', 1080, 1920],
  ['square', 'Square 1080×1080', 1080, 1080],
];

export function SlideshowTool({ tool }: { tool: ToolDef }) {
  const sequence = tool.slug === 'images-to-video';
  const list = useProbedFiles('image');
  const music = useSource('audio');
  const job = useMediaJob<ConvertResult>((r) => void mediaEngine.releaseOutput(r));
  const [size, setSize] = useState('1080p');
  const [perImage, setPerImage] = useState(sequence ? 0.1 : 3);
  const [fps, setFps] = useState(sequence ? 10 : 30);
  const [transition, setTransition] = useState(sequence ? 'none' : 'crossfade');
  const [tDur, setTDur] = useState(0.8);
  const [kenBurns, setKenBurns] = useState(!sequence);
  const [bg, setBg] = useState('#000000');
  const [container, setContainer] = useState<RenderContainer>('mp4');
  const ready = list.ready;

  const frameDur = sequence ? 1 / fps : perImage;
  const d = transition === 'none' ? 0 : Math.min(tDur, frameDur * 0.9);
  const total = ready.length * frameDur;

  const run = () => {
    const [, , w, h] = SIZES.find((s) => s[0] === size)!;
    const comp = new Composition({ width: w, height: h, frameRate: fpsToRational(sequence ? fps : 30), background: bg });
    const track = comp.track('video');
    const each = comp.q(frameDur, 'round');
    let prev: ReturnType<typeof comp.clip> | null = null;
    ready.forEach((it, i) => {
      const asset = comp.asset(it.file, it.info!, 'image', it.file.name);
      const zoomIn = i % 2 === 0;
      const clip = comp.clip(track, {
        assetId: asset.id,
        start: i * each,
        duration: each,
        name: it.file.name,
        keyframes: kenBurns
          ? {
              scale: [
                { t: 0, value: zoomIn ? 1 : 1.12, easing: 'linear' },
                { t: each, value: zoomIn ? 1.12 : 1, easing: 'linear' },
              ],
            }
          : {},
      });
      if (prev && d) comp.transition(prev, clip, transition, d);
      prev = clip;
    });
    if (music.source.status === 'ready') {
      const aInfo = music.source.info;
      const aAsset = comp.asset(music.source.file, aInfo, aInfo.video.length ? 'video' : 'audio', music.source.file.name);
      const aTrack = comp.track('audio', 'bottom');
      const end = each * ready.length;
      const aLen = comp.q(aInfo.duration, 'floor');
      for (let t = 0; t < end; t += aLen) {
        const dur = Math.min(aLen, end - t);
        comp.clip(aTrack, { assetId: aAsset.id, start: t, duration: dur, audio: { gain: 1, pan: 0, fadeIn: 0, fadeOut: t + dur >= end ? Math.min(comp.q(2), dur) : 0 } });
      }
    }
    job.run(() => mediaEngine.render(comp.input({ container, fileName: sequence ? 'image-sequence' : 'slideshow', videoBitrate: 'high' })));
  };

  return (
    <div className="space-y-4">
      <AddFiles onFiles={list.add} accept={IMAGE_ACCEPT} label={sequence ? 'Drop an image sequence (sorted by the order you add them)' : 'Drop photos here'} count={list.items.length} noun="images" />
      <OrderedFiles list={list} label="Images" unit="image" />
      <Panel>
        <SelectField label="Video size" value={size} onChange={setSize} options={SIZES.map(([id, l]) => [id, l] as const)} />
        {sequence ? (
          <NumberField label="Frame rate" unit="fps" value={fps} min={1} max={60} onChange={setFps} />
        ) : (
          <NumberField label="Time per photo" unit="s" value={perImage} min={0.5} max={60} step={0.5} onChange={setPerImage} />
        )}
        <SelectField label="Transition" value={transition} onChange={setTransition} options={TRANSITIONS} />
        {transition !== 'none' && <RangeField label="Transition length" value={d} min={0.1} max={Math.max(0.1, frameDur * 0.9)} step={0.05} onChange={setTDur} format={(v) => `${v.toFixed(2)} s`} />}
        {!sequence && <CheckField label="Slow pan & zoom (Ken Burns)" checked={kenBurns} onChange={setKenBurns} />}
        <ColorField label="Background" value={bg} onChange={setBg} />
        <RenderFormatField value={container} onChange={setContainer} />
        <p className="text-sm text-muted md:col-span-2">
          {ready.length} image(s) → {formatDuration(total, 1)}
        </p>
      </Panel>
      <div className="space-y-2">
        <p className="text-xs text-muted">Music (optional)</p>
        {music.source.status === 'ready' ? (
          <SourceHeader file={music.source.file} info={music.source.info} onChange={music.clear} />
        ) : music.source.status === 'empty' ? (
          <SourceDrop onFile={music.open} accept={AUDIO_ACCEPT} label="Drop a music file" hint="It loops if shorter than the slideshow and fades out at the end." />
        ) : (
          <SourceGate source={music.source} open={music.open} clear={music.clear} accept={AUDIO_ACCEPT} />
        )}
      </div>
      <JobArea
        state={job.state}
        onCancel={job.cancel}
        label="Rendering"
        action="Create video"
        disabledReason={ready.length === 0 ? 'Add images first.' : list.items.some((x) => x.status === 'probing') ? 'Reading files…' : null}
        onRun={run}
        done={(r) => <ConvertResultCard result={r} onReset={job.reset} resetLabel="Change settings" />}
      />
    </div>
  );
}
