/** Translation-only stabilisation: analyse camera shake, then render with a smoothing correction. */
import { useState } from 'react';
import { mediaEngine, type ConvertResult, type MotionAnalysis } from '@/media-engine';
import { coverZoom, stabilisationCorrection } from '@/media-engine/decode/motion-math';
import type { Keyframe } from '@/project/schema/types';
import { secondsToFlicks } from '@/utils/time';
import { Composition } from '../shared/compose';
import { CheckField, Panel, RangeField } from '../shared/controls';
import { baseName, ConvertResultCard, ErrorBox, JobArea, JobProgress, SourceGate, SourceHeader, VIDEO_ACCEPT } from '../shared/ToolParts';
import { useMediaJob } from '../shared/useMediaJob';
import { useSource } from '../shared/useSource';
import { RenderFormatField, type RenderContainer } from './common';

export function StabilizeTool() {
  const { source, open, clear } = useSource(true);
  const analysis = useMediaJob<MotionAnalysis>();
  const render = useMediaJob<ConvertResult>((r) => void mediaEngine.releaseOutput(r));
  const [smooth, setSmooth] = useState(1);
  const [fixRotation, setFixRotation] = useState(true);
  const [container, setContainer] = useState<RenderContainer>('mp4');
  const info = source.status === 'ready' ? source.info : null;
  if (source.status !== 'ready' || !info) return <SourceGate source={source} open={open} clear={clear} accept={VIDEO_ACCEPT} />;
  const a = analysis.state.status === 'done' ? analysis.state.result : null;

  let zoom = 1;
  let shake = 0;
  let corr: ReturnType<typeof stabilisationCorrection> | null = null;
  let maxDeg = 0;
  if (a) {
    corr = stabilisationCorrection(a, smooth * a.fps);
    let need = 1;
    for (let i = 0; i < corr.cx.length; i++) {
      need = Math.max(need, coverZoom(a.width, a.height, corr.cx[i]!, corr.cy[i]!, fixRotation ? corr.cr[i]! : 0));
      maxDeg = Math.max(maxDeg, Math.abs((corr.cr[i]! * 180) / Math.PI));
    }
    zoom = Math.min(1.4, need + 0.01);
    shake = Math.max(...Array.from(corr.cx, (v) => Math.abs(v) / a.width), ...Array.from(corr.cy, (v) => Math.abs(v) / a.height)) * 100;
  }

  const run = () => {
    if (!a || !corr) return;
    const comp = Composition.fromVideo(info);
    const asset = comp.asset(source.file, info, 'video', source.file.name);
    const track = comp.track('video');
    const k = info.width / a.width;
    const kx: Keyframe[] = [];
    const ky: Keyframe[] = [];
    const kr: Keyframe[] = [];
    for (let i = 0; i < a.timestamps.length; i++) {
      const t = secondsToFlicks(a.timestamps[i]!);
      if (fixRotation) kr.push({ t, value: (corr.cr[i]! * 180) / Math.PI, easing: 'linear' });
      // The picture is scaled by `zoom` around its centre, so offsets scale too.
      kx.push({ t, value: corr.cx[i]! * k * zoom, easing: 'linear' });
      ky.push({ t, value: corr.cy[i]! * k * zoom, easing: 'linear' });
    }
    comp.clip(track, {
      assetId: asset.id,
      start: 0,
      duration: comp.q(info.duration, 'floor'),
      transform: { x: 0, y: 0, scaleX: zoom, scaleY: zoom, rotation: 0, flipH: false, flipV: false, crop: { left: 0, top: 0, right: 0, bottom: 0 } },
      keyframes: fixRotation ? { x: kx, y: ky, rotation: kr } : { x: kx, y: ky },
    });
    render.run(() => mediaEngine.render(comp.input({ container, fileName: `${baseName(source.file.name)}-stabilized`, videoBitrate: 'high' })));
  };

  return (
    <div className="space-y-4">
      <SourceHeader file={source.file} info={info} onChange={() => (analysis.reset(), render.reset(), clear())} disabled={analysis.state.status === 'running' || render.state.status === 'running'} />
      <video src={source.url} controls preload="metadata" className="max-h-64 w-full rounded-lg bg-black" aria-label="Source preview" />
      <p className="text-sm text-muted">
        Corrects side-to-side, up-down and rolling (tilt) camera shake. Rolling-shutter wobble and zoom breathing are not corrected. The picture is
        zoomed slightly so the moving edges stay hidden.
      </p>
      {!a ? (
        <>
          <JobProgress state={analysis.state} onCancel={analysis.cancel} label="Analysing motion" />
          {analysis.state.status === 'error' && <ErrorBox error={analysis.state.error} />}
          {analysis.state.status !== 'running' && (
            <button type="button" className="h-10 rounded-md bg-accent px-5 text-sm font-medium text-accent-fg" onClick={() => analysis.run(() => mediaEngine.analyzeMotion(source.file))}>
              Analyse shake
            </button>
          )}
        </>
      ) : (
        <>
          <Panel>
            <RangeField label="Smoothing" value={smooth} min={0.2} max={3} step={0.1} onChange={setSmooth} format={(v) => `${v.toFixed(1)} s`} />
            <CheckField label="Also correct rotation (tilt)" checked={fixRotation} onChange={setFixRotation} />
            <p className="text-sm text-muted md:col-span-3">
              Measured shake up to {shake.toFixed(1)}% of the frame and {maxDeg.toFixed(1)}° of tilt · zoom needed {Math.round((zoom - 1) * 100)}%
              {zoom >= 1.4 && ' (capped; some edges may show)'}.
            </p>
            <RenderFormatField value={container} onChange={setContainer} />
          </Panel>
          <JobArea state={render.state} onCancel={render.cancel} label="Rendering" action="Stabilize video" onRun={run} done={(r) => <ConvertResultCard result={r} onReset={render.reset} resetLabel="Change settings" />} />
        </>
      )}
    </div>
  );
}
