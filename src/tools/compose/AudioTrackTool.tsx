/** Replace a video's audio, or mix extra audio into it (with optional looping and auto-ducking). */
import { useState } from 'react';
import { mediaEngine, type ConvertResult } from '@/media-engine';
import { formatDuration } from '@/utils/format';
import type { ToolDef } from '../registry';
import { Composition } from '../shared/compose';
import { CheckField, NumberField, Panel, RangeField } from '../shared/controls';
import { AUDIO_ACCEPT, baseName, ConvertResultCard, JobArea, SourceDrop, SourceGate, SourceHeader, VIDEO_ACCEPT } from '../shared/ToolParts';
import { useMediaJob } from '../shared/useMediaJob';
import { useSource } from '../shared/useSource';
import { RenderFormatField, type RenderContainer } from './common';

export function AudioTrackTool({ tool }: { tool: ToolDef }) {
  const replace = tool.slug === 'replace-audio';
  const video = useSource(true);
  const audio = useSource('audio');
  const job = useMediaJob<ConvertResult>((r) => void mediaEngine.releaseOutput(r));
  const [offset, setOffset] = useState(0);
  const [loop, setLoop] = useState(true);
  const [fadeOut, setFadeOut] = useState(1);
  const [origVol, setOrigVol] = useState(1);
  const [newVol, setNewVol] = useState(replace ? 1 : 0.35);
  const [duck, setDuck] = useState(false);
  const [container, setContainer] = useState<RenderContainer>('mp4');

  if (video.source.status !== 'ready') return <SourceGate source={video.source} open={video.open} clear={video.clear} accept={VIDEO_ACCEPT} label="Drop the video here" />;
  const vInfo = video.source.info;
  const vFile = video.source.file;

  const run = () => {
    if (audio.source.status !== 'ready') return;
    const aInfo = audio.source.info;
    const comp = Composition.fromVideo(vInfo);
    const vAsset = comp.asset(vFile, vInfo, 'video', vFile.name);
    const aAsset = comp.asset(audio.source.file, aInfo, aInfo.video.length ? 'video' : 'audio', audio.source.file.name);
    const vTrack = comp.track('video');
    const aTrack = comp.track('audio', 'bottom');
    const total = comp.q(vInfo.duration, 'floor');
    comp.clip(vTrack, { assetId: vAsset.id, start: 0, duration: total, audio: { gain: replace ? 0 : origVol, pan: 0, fadeIn: 0, fadeOut: 0 } });
    // Lay the audio from `offset`, looping to the end of the video if asked.
    const aLen = comp.q(aInfo.duration, 'floor');
    let t = comp.q(offset);
    const fade = comp.q(fadeOut);
    while (t < total) {
      const dur = Math.min(aLen, total - t);
      const last = t + dur >= total || !loop;
      comp.clip(aTrack, {
        assetId: aAsset.id,
        start: t,
        duration: dur,
        audio: { gain: newVol, pan: 0, fadeIn: 0, fadeOut: last ? Math.min(fade, dur) : 0 },
        effects: !replace && duck ? [{ id: 'dk', type: 'ducking', enabled: true, params: { amount: -12, sidechainTrackId: vTrack.id } }] : [],
      });
      t += dur;
      if (!loop) break;
    }
    job.run(() => mediaEngine.render(comp.input({ container, fileName: `${baseName(vFile.name)}-${replace ? 'new-audio' : 'mixed'}`, videoBitrate: 'high' })));
  };

  return (
    <div className="space-y-4">
      <SourceHeader file={vFile} info={vInfo} onChange={() => (job.reset(), video.clear())} disabled={job.state.status === 'running'} />
      {audio.source.status === 'ready' ? (
        <div className="space-y-2 rounded-lg border border-line bg-surface p-3">
          <SourceHeader file={audio.source.file} info={audio.source.info} onChange={audio.clear} />
          <audio src={audio.source.url} controls className="w-full" aria-label="New audio preview" />
        </div>
      ) : audio.source.status === 'empty' ? (
        <SourceDrop onFile={audio.open} accept={AUDIO_ACCEPT} label={replace ? 'Drop the new soundtrack here' : 'Drop the music or narration to add'} />
      ) : (
        <SourceGate source={audio.source} open={audio.open} clear={audio.clear} accept={AUDIO_ACCEPT} />
      )}
      <Panel>
        <NumberField label="Start the audio at" unit="s" value={offset} min={0} max={Math.max(0, Math.floor((vInfo.duration - 0.1) * 10) / 10)} step={0.1} onChange={setOffset} hint="The new audio must start before the video ends." />
        <CheckField label="Loop to fill the video" checked={loop} onChange={setLoop} />
        <NumberField label="Fade out at the end" unit="s" value={fadeOut} min={0} max={10} step={0.1} onChange={setFadeOut} />
        {!replace && vInfo.audio.length > 0 && <RangeField label="Original audio volume" value={origVol} min={0} max={2} step={0.05} onChange={setOrigVol} format={(v) => `${Math.round(v * 100)}%`} />}
        <RangeField label={replace ? 'New audio volume' : 'Added audio volume'} value={newVol} min={0.05} max={2} step={0.05} onChange={setNewVol} format={(v) => `${Math.round(v * 100)}%`} />
        {!replace && vInfo.audio.length > 0 && <CheckField label="Lower the added audio while the video has sound (ducking)" checked={duck} onChange={setDuck} />}
        <RenderFormatField value={container} onChange={setContainer} />
        <p className="text-sm text-muted md:col-span-3">The output is as long as the video ({formatDuration(vInfo.duration, 1)}).</p>
      </Panel>
      <JobArea
        state={job.state}
        onCancel={job.cancel}
        label="Rendering"
        action={replace ? 'Replace audio' : 'Add audio'}
        disabledReason={audio.source.status !== 'ready' ? 'Add an audio file.' : null}
        onRun={run}
        done={(r) => <ConvertResultCard result={r} onReset={job.reset} resetLabel="Change settings" />}
      />
    </div>
  );
}
