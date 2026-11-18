/** Change speed and/or reverse a video, rendered through the timeline renderer. */
import { useState } from 'react';
import { mediaEngine, type ConvertResult } from '@/media-engine';
import { formatDuration } from '@/utils/format';
import type { ToolDef } from '../registry';
import { Composition } from '../shared/compose';
import { CheckField, ChoiceGroup, Panel, RangeField } from '../shared/controls';
import { baseName, ConvertResultCard, JobArea, SourceGate, SourceHeader, VIDEO_ACCEPT } from '../shared/ToolParts';
import { useMediaJob } from '../shared/useMediaJob';
import { useSource } from '../shared/useSource';
import { RenderFormatField, type RenderContainer } from './common';

const MAX_REVERSE_AUDIO_S = 600;

export function SpeedTool({ tool }: { tool: ToolDef }) {
  const reverse = tool.slug === 'reverse-video';
  const { source, open, clear } = useSource(true);
  const job = useMediaJob<ConvertResult>((r) => void mediaEngine.releaseOutput(r));
  const [speed, setSpeed] = useState(reverse ? 1 : 2);
  const [audio, setAudio] = useState<'pitch' | 'raw' | 'mute'>(reverse ? 'raw' : 'pitch');
  const [alsoReverse, setAlsoReverse] = useState(reverse);
  const [container, setContainer] = useState<RenderContainer>('mp4');
  const info = source.status === 'ready' ? source.info : null;
  if (source.status !== 'ready' || !info) return <SourceGate source={source} open={open} clear={clear} accept={VIDEO_ACCEPT} />;

  const outDur = info.duration / speed;
  const hasAudio = info.audio.length > 0;
  const reverseAudioTooLong = alsoReverse && hasAudio && audio !== 'mute' && info.duration > MAX_REVERSE_AUDIO_S;

  const run = () => {
    const comp = Composition.fromVideo(info);
    const asset = comp.asset(source.file, info, 'video', source.file.name);
    const track = comp.track('video');
    const span = comp.q(info.duration, 'floor');
    const duration = comp.q(info.duration / speed, 'floor');
    comp.clip(track, {
      assetId: asset.id,
      start: 0,
      duration,
      sourceIn: 0,
      speed: span / duration,
      reversed: alsoReverse,
      effects: audio === 'pitch' && !alsoReverse ? [{ id: 'pp', type: 'preserve-pitch', enabled: true, params: {} }] : [],
      audio: { gain: audio === 'mute' ? 0 : 1, pan: 0, fadeIn: 0, fadeOut: 0 },
    });
    job.run(() => mediaEngine.render(comp.input({ container, fileName: `${baseName(source.file.name)}-${alsoReverse ? 'reversed' : `${speed}x`}`, videoBitrate: 'high' })));
  };

  return (
    <div className="space-y-4">
      <SourceHeader file={source.file} info={info} onChange={() => (job.reset(), clear())} disabled={job.state.status === 'running'} />
      <video src={source.url} controls preload="metadata" className="max-h-64 w-full rounded-lg bg-black" aria-label="Source preview" />
      <Panel>
        {!reverse && (
          <RangeField label="Speed" value={speed} min={0.25} max={4} step={0.05} onChange={setSpeed} format={(v) => `${v.toFixed(2)}× → ${formatDuration(info.duration / v, 1)}`} />
        )}
        {reverse ? (
          <p className="text-sm text-muted">The whole video plays backwards. Long videos take longer: each frame is decoded from its preceding key frame.</p>
        ) : (
          <CheckField label="Also play backwards" checked={alsoReverse} onChange={setAlsoReverse} />
        )}
        {hasAudio && (
          <ChoiceGroup
            name="speed-audio"
            label="Audio"
            value={audio}
            onChange={setAudio}
            options={[
              ...(!alsoReverse ? ([['pitch', 'Keep pitch', 'Time-stretched (WSOLA)']] as const) : []),
              ['raw', alsoReverse ? 'Reverse audio too' : 'Change pitch', alsoReverse ? undefined : 'Like a tape speed change'],
              ['mute', 'Remove audio'],
            ]}
          />
        )}
        <RenderFormatField value={container} onChange={setContainer} />
        <p className="text-sm text-muted md:col-span-3">Output length {formatDuration(outDur, 2)}.</p>
        {reverseAudioTooLong && <p className="text-sm text-warn md:col-span-3">Reversed audio is limited to {MAX_REVERSE_AUDIO_S / 60} minutes. Choose “Remove audio” for longer videos.</p>}
      </Panel>
      <JobArea
        state={job.state}
        onCancel={job.cancel}
        label="Rendering"
        action={alsoReverse ? 'Reverse video' : 'Change speed'}
        disabledReason={reverseAudioTooLong ? 'Audio too long to reverse.' : !alsoReverse && Math.abs(speed - 1) < 1e-3 ? 'Pick a speed other than 1×.' : null}
        onRun={run}
        done={(r) => <ConvertResultCard result={r} onReset={job.reset} resetLabel="Change settings" />}
      />
    </div>
  );
}
