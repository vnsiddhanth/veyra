import { SectionTitle } from '@/components/ui/primitives';
import type { Project } from '@/project/schema/types';
import { setTrackFlags } from '@/timeline/model/ops';
import { cn } from '@/utils/id';
import { tryEdit } from '../timeline/commands';
import { gestureProps, liveEdit } from './live-edit';

const db = (v: number) => (v <= 0 ? '−∞' : `${(20 * Math.log10(v)).toFixed(1)}`);

/** Per-track faders with mute and solo. Text tracks carry no sound and are omitted. */
export function TrackMixer({ project }: { project: Project }) {
  const tracks = project.tracks.filter((t) => t.kind !== 'text');
  return (
    <>
      <SectionTitle>Mixer</SectionTitle>
      <ul className="space-y-1 px-3" aria-label="Track mixer">
        {tracks.map((t) => (
          <li key={t.id} className="grid grid-cols-[36px_1fr_44px_auto] items-center gap-1.5 text-xs">
            <span className="font-medium">{t.name}</span>
            <input
              type="range"
              min={0}
              max={2}
              step={0.01}
              value={t.volume}
              aria-label={`${t.name} volume`}
              className="min-w-0 accent-[var(--c-accent)]"
              {...gestureProps((v) => liveEdit((p) => setTrackFlags(p, t.id, { volume: v })))}
            />
            <span className="text-right font-mono text-2xs tabular">{db(t.volume)} dB</span>
            <span className="flex gap-0.5">
              <button type="button" aria-pressed={t.muted} aria-label={`Mute ${t.name}`} className={cn('w-5 rounded-sm text-2xs font-bold', t.muted ? 'bg-danger text-white' : 'bg-surface-3 text-muted')} onClick={() => tryEdit((p) => setTrackFlags(p, t.id, { muted: !t.muted }))}>
                M
              </button>
              <button type="button" aria-pressed={t.solo} aria-label={`Solo ${t.name}`} className={cn('w-5 rounded-sm text-2xs font-bold', t.solo ? 'bg-warn text-black' : 'bg-surface-3 text-muted')} onClick={() => tryEdit((p) => setTrackFlags(p, t.id, { solo: !t.solo }))}>
                S
              </button>
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
