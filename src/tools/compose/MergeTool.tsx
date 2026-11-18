/** Merge videos (optionally with transitions), rendered through the timeline renderer. */
import { useState } from 'react';
import { FileDrop } from '@/components/ui/FileDrop';
import { Button } from '@/components/ui/primitives';
import { mediaEngine, type ConvertResult } from '@/media-engine';
import { formatDuration } from '@/utils/format';
import type { ToolDef } from '../registry';
import { Composition } from '../shared/compose';
import { Panel, RangeField, SelectField } from '../shared/controls';
import { ConvertResultCard, JobArea, VIDEO_ACCEPT } from '../shared/ToolParts';
import { useMediaJob } from '../shared/useMediaJob';
import { RenderFormatField, useProbedFiles, type ProbedFile, type RenderContainer } from './common';

export const TRANSITIONS: [string, string][] = [
  ['none', 'None (hard cut)'],
  ['crossfade', 'Crossfade'],
  ['dip-black', 'Dip to black'],
  ['dip-white', 'Dip to white'],
  ['wipe-left', 'Wipe left'],
  ['wipe-right', 'Wipe right'],
  ['wipe-up', 'Wipe up'],
  ['slide-left', 'Slide left'],
  ['slide-right', 'Slide right'],
  ['zoom', 'Zoom in'],
  ['circle', 'Circle reveal'],
];

export function FileList({ list, label }: { list: ReturnType<typeof useProbedFiles>; label: string }) {
  return (
    <ol className="space-y-1.5" aria-label={label}>
      {list.items.map((it: ProbedFile, i) => (
        <li key={it.id} className="flex items-center gap-2 rounded-md border border-line bg-surface px-3 py-2 text-sm">
          <span className="w-5 text-faint">{i + 1}.</span>
          <span className="min-w-0 flex-1 truncate">{it.file.name}</span>
          <span className={`text-xs ${it.status === 'error' ? 'text-danger' : 'text-muted'}`}>
            {it.status === 'probing' ? 'Reading…' : it.status === 'error' ? it.error : `${it.info!.width ? `${it.info!.width}×${it.info!.height} · ` : ''}${formatDuration(it.info!.duration, 1)}`}
          </span>
          <Button size="sm" variant="ghost" onClick={() => list.move(it.id, -1)} disabled={i === 0} aria-label={`Move ${it.file.name} up`}>
            ↑
          </Button>
          <Button size="sm" variant="ghost" onClick={() => list.move(it.id, 1)} disabled={i === list.items.length - 1} aria-label={`Move ${it.file.name} down`}>
            ↓
          </Button>
          <Button size="sm" variant="ghost" onClick={() => list.remove(it.id)} aria-label={`Remove ${it.file.name}`}>
            ×
          </Button>
        </li>
      ))}
    </ol>
  );
}

export function AddFiles({ onFiles, accept, label, count }: { onFiles(f: File[]): void; accept: string; label: string; count: number }) {
  return (
    <FileDrop onFiles={(entries) => onFiles(entries.map((e) => e.file))} multiple accept={accept}>
      {({ dragging, open }) => (
        <div className={`flex items-center gap-3 rounded-lg border border-dashed p-4 text-sm ${dragging ? 'border-accent bg-accent-soft' : 'border-line-strong bg-surface'}`}>
          <span className="text-muted">{count ? `${count} file(s). Drop more to add them.` : label}</span>
          <Button size="sm" variant={count ? 'secondary' : 'primary'} className="ml-auto" onClick={open}>
            Add files
          </Button>
        </div>
      )}
    </FileDrop>
  );
}

export function MergeTool({ tool }: { tool: ToolDef }) {
  const list = useProbedFiles('video');
  const job = useMediaJob<ConvertResult>((r) => void mediaEngine.releaseOutput(r));
  const [transition, setTransition] = useState(tool.slug === 'add-transitions' ? 'crossfade' : 'none');
  const [tDur, setTDur] = useState(0.8);
  const [sizeFrom, setSizeFrom] = useState<'first' | 'largest' | '1080' | '720'>('first');
  const [container, setContainer] = useState<RenderContainer>('mp4');
  const ready = list.ready;
  const minClip = Math.min(...ready.map((x) => x.info!.duration));
  const tMax = Math.max(0.1, Math.min(3, minClip / 2 - 0.05));

  const run = () => {
    const first = ready[0]!.info!;
    let w = first.width;
    let h = first.height;
    if (sizeFrom === 'largest') {
      const big = ready.reduce((a, b) => (b.info!.width * b.info!.height > a.info!.width * a.info!.height ? b : a));
      w = big.info!.width;
      h = big.info!.height;
    } else if (sizeFrom === '1080' || sizeFrom === '720') {
      const p = Number(sizeFrom);
      w = Math.round(((first.width / first.height) * p) / 2) * 2;
      h = p;
    }
    const comp = Composition.fromVideo(first, { width: w, height: h });
    const track = comp.track('video');
    const d = transition === 'none' ? 0 : Math.min(tDur, tMax);
    let t = 0;
    let prev: ReturnType<typeof comp.clip> | null = null;
    ready.forEach((it, i) => {
      const asset = comp.asset(it.file, it.info!, 'video', it.file.name);
      const full = comp.q(it.info!.duration, 'floor');
      // Each transition eats half its length from both neighbours, so both sides show real frames.
      const head = i > 0 && d ? comp.q(d / 2) : 0;
      const tail = i < ready.length - 1 && d ? comp.q(d / 2) : 0;
      const dur = full - head - tail;
      const fade = d ? comp.q(Math.min(0.25, d / 2)) : 0;
      const clip = comp.clip(track, { assetId: asset.id, start: t, duration: dur, sourceIn: head, name: it.file.name, audio: { gain: 1, pan: 0, fadeIn: i > 0 ? fade : 0, fadeOut: i < ready.length - 1 ? fade : 0 } });
      if (prev && d) comp.transition(prev, clip, transition, d);
      prev = clip;
      t += dur;
    });
    job.run(() => mediaEngine.render(comp.input({ container, fileName: 'merged', videoBitrate: 'high' })));
  };

  return (
    <div className="space-y-4">
      <AddFiles onFiles={list.add} accept={VIDEO_ACCEPT} label="Drop two or more videos here. They are joined in list order." count={list.items.length} />
      <FileList list={list} label="Videos to merge" />
      <Panel>
        <SelectField label="Transition between clips" value={transition} onChange={setTransition} options={TRANSITIONS} />
        {transition !== 'none' && <RangeField label="Transition length" value={Math.min(tDur, tMax)} min={0.1} max={tMax} step={0.05} onChange={setTDur} format={(v) => `${v.toFixed(2)} s`} />}
        <SelectField
          label="Output size"
          value={sizeFrom}
          onChange={setSizeFrom}
          options={[
            ['first', 'Same as the first video'],
            ['largest', 'Largest input'],
            ['1080', '1080p'],
            ['720', '720p'],
          ]}
          hint="Videos with another shape are fitted with black bars."
        />
        <RenderFormatField value={container} onChange={setContainer} />
      </Panel>
      <JobArea
        state={job.state}
        onCancel={job.cancel}
        label="Merging"
        action={tool.slug === 'add-transitions' ? 'Join with transitions' : 'Merge videos'}
        disabledReason={ready.length < 2 ? 'Add at least two videos.' : list.items.some((x) => x.status === 'probing') ? 'Reading files…' : null}
        onRun={run}
        done={(r) => <ConvertResultCard result={r} onReset={job.reset} resetLabel="Change settings" />}
      />
    </div>
  );
}
