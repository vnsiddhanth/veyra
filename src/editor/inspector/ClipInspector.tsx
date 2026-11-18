/**
 * Clip inspector: timing, transform, keyframes (with a curve editor), text, effects and audio.
 * Every control edits the project through pure operations; drags commit one undo step.
 */
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { SectionTitle } from '@/components/ui/primitives';
import { identityTransform } from '@/project/schema/factory';
import type { BlendMode, Clip, EffectInstance, Easing, Project, TextContent } from '@/project/schema/types';
import { defaultParams, EFFECT_BY_TYPE, EFFECTS, type EffectSpec, type ParamSpec } from '@/render/effects';
import { ANIMATABLE, evalKeyframes, staticValue, type AnimatableProp } from '@/render/evaluate';
import { bytesToBase64, parseCubeLut } from '@/render/pixel-fx';
import { removeKeyframe, setClipSpeed, setKeyframe, updateClip } from '@/timeline/model/edit';
import { createId, cn } from '@/utils/id';
import { flicksToSeconds, formatTimecode, secondsToFlicks, type Flicks } from '@/utils/time';
import { useEditorUi } from '../editor-ui-store';
import { useThrottledPlayhead } from '../use-playhead';
import { detachSelectedAudio, tryEdit } from '../timeline/commands';
import { beginGesture, endGesture, gestureProps, liveEdit } from './live-edit';

const input = 'h-7 w-full rounded-sm border border-line bg-surface-2 px-1.5 text-xs';

const PROP_META: Record<AnimatableProp, { label: string; min: number; max: number; step: number; unit?: string; fmt?: (v: number) => string }> = {
  opacity: { label: 'Opacity', min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` },
  x: { label: 'Position X', min: -4000, max: 4000, step: 1, unit: 'px' },
  y: { label: 'Position Y', min: -4000, max: 4000, step: 1, unit: 'px' },
  scale: { label: 'Scale', min: 0.05, max: 5, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` },
  rotation: { label: 'Rotation', min: -360, max: 360, step: 0.5, unit: '°' },
  volume: { label: 'Volume', min: 0, max: 4, step: 0.01, fmt: (v) => (v <= 0 ? '−∞ dB' : `${(20 * Math.log10(v)).toFixed(1)} dB`) },
  speed: { label: 'Speed ramp', min: 0.1, max: 8, step: 0.05, fmt: (v) => `${v.toFixed(2)}×` },
};

/** Write a property: keyframe at the playhead if the property is animated, else the static value. */
function writeProp(p: Project, clipId: string, prop: AnimatableProp, value: number, local: Flicks): Project {
  const c = p.clips[clipId]!;
  if (c.keyframes[prop]?.length) return setKeyframe(p, clipId, prop, local, value);
  switch (prop) {
    case 'opacity':
      return updateClip(p, clipId, { opacity: value });
    case 'x':
      return updateClip(p, clipId, { transform: { ...c.transform, x: value } });
    case 'y':
      return updateClip(p, clipId, { transform: { ...c.transform, y: value } });
    case 'scale': {
      const ratio = c.transform.scaleY / (c.transform.scaleX || 1);
      return updateClip(p, clipId, { transform: { ...c.transform, scaleX: value, scaleY: value * ratio } });
    }
    case 'rotation':
      return updateClip(p, clipId, { transform: { ...c.transform, rotation: value } });
    case 'volume':
      return updateClip(p, clipId, { audio: { ...c.audio, gain: value } });
    case 'speed':
      return setClipSpeed(p, clipId, value);
  }
}

function Row({ label, children, aside }: { label: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="grid grid-cols-[84px_1fr_auto] items-center gap-2 py-0.5 text-xs">
      <span className="truncate text-muted">{label}</span>
      <div className="min-w-0">{children}</div>
      <div className="flex items-center">{aside}</div>
    </div>
  );
}

export function ClipInspector({ project, clip }: { project: Project; clip: Clip }) {
  const playhead = useThrottledPlayhead();
  const [curveProp, setCurveProp] = useState<AnimatableProp | null>(null);
  const asset = clip.assetId ? project.assets.find((a) => a.id === clip.assetId) : undefined;
  const local = Math.max(0, Math.min(clip.duration, playhead - clip.start));
  const inClip = playhead >= clip.start && playhead <= clip.start + clip.duration;
  const isVisual = project.tracks.find((t) => t.id === clip.trackId)?.kind !== 'audio' && asset?.kind !== 'audio';
  const hasAudio = !!asset?.info?.audio.length;
  const isText = !!clip.text;
  const fr = project.settings.frameRate;

  const propRow = (prop: AnimatableProp) => {
    const meta = PROP_META[prop];
    const kfs = clip.keyframes[prop] ?? [];
    const value = evalKeyframes(kfs, local, staticValue(clip, prop));
    const onKey = kfs.some((k) => k.t === local);
    const prev = [...kfs].reverse().find((k) => k.t < local);
    const next = kfs.find((k) => k.t > local);
    return (
      <Row
        key={prop}
        label={meta.label}
        aside={
          <>
            <button type="button" className="px-0.5 text-faint hover:text-fg disabled:opacity-30" disabled={!prev} aria-label={`Previous ${meta.label} keyframe`} onClick={() => prev && useEditorUi.getState().setPlayhead(clip.start + prev.t)}>
              ‹
            </button>
            <button
              type="button"
              aria-pressed={onKey}
              aria-label={onKey ? `Remove ${meta.label} keyframe` : `Add ${meta.label} keyframe at playhead`}
              title={inClip ? 'Keyframe at playhead' : 'Move the playhead into the clip to add keyframes'}
              disabled={!inClip}
              className={cn('px-1 text-sm leading-none disabled:opacity-30', onKey ? 'text-accent' : kfs.length ? 'text-fg' : 'text-faint hover:text-fg')}
              onClick={() => tryEdit((p) => (onKey ? removeKeyframe(p, clip.id, prop, local) : setKeyframe(p, clip.id, prop, local, value)))}
            >
              ◆
            </button>
            <button type="button" className="px-0.5 text-faint hover:text-fg disabled:opacity-30" disabled={!next} aria-label={`Next ${meta.label} keyframe`} onClick={() => next && useEditorUi.getState().setPlayhead(clip.start + next.t)}>
              ›
            </button>
            <button type="button" className={cn('ml-0.5 px-0.5 text-2xs', curveProp === prop ? 'text-accent' : 'text-faint hover:text-fg')} aria-label={`Show ${meta.label} curve`} onClick={() => setCurveProp(curveProp === prop ? null : prop)}>
              ⌇
            </button>
          </>
        }
      >
        <div className="flex items-center gap-1.5">
          <input type="range" min={meta.min} max={meta.max} step={meta.step} value={value} aria-label={meta.label} className="min-w-0 flex-1 accent-[var(--c-accent)]" {...gestureProps((v) => liveEdit((p) => writeProp(p, clip.id, prop, v, local)))} />
          <span className="w-14 shrink-0 text-right font-mono text-2xs tabular">{meta.fmt ? meta.fmt(value) : `${Math.round(value * 10) / 10}${meta.unit ?? ''}`}</span>
        </div>
      </Row>
    );
  };

  return (
    <div>
      <SectionTitle>Clip</SectionTitle>
      <div className="px-3">
        <Row label="Name">
          <input key={clip.id} defaultValue={clip.name} className={input} aria-label="Clip name" onBlur={(e) => e.target.value !== clip.name && tryEdit((p) => updateClip(p, clip.id, { name: e.target.value.slice(0, 200) }))} />
        </Row>
        <Row label="Start">
          <span className="font-mono tabular">{formatTimecode(clip.start, fr)}</span>
        </Row>
        <Row label="Duration">
          <span className="font-mono tabular">{formatTimecode(clip.duration, fr)}</span>
        </Row>
        {clip.assetId && asset?.kind !== 'image' && asset?.kind !== 'subtitle' && (
          <>
            <Row label="Source in">
              <span className="font-mono tabular">{formatTimecode(clip.sourceIn, fr)}</span>
            </Row>
            {propRow('speed')}
            <p className="pb-1 text-2xs text-faint">Add ◆ keyframes to ramp the speed over time; the clip keeps its length and plays more or less of the source.</p>
            <Row label="Reverse">
              <input type="checkbox" checked={clip.reversed} aria-label="Play backwards" onChange={(e) => tryEdit((p) => updateClip(p, clip.id, { reversed: e.target.checked }))} className="accent-[var(--c-accent)]" />
            </Row>
          </>
        )}
        {asset?.kind === 'video' && hasAudio && !clip.effects.some((e) => e.type === 'mute-audio') && (
          <button type="button" className="mt-1 text-xs text-accent hover:underline" onClick={detachSelectedAudio}>
            Detach audio to its own track
          </button>
        )}
      </div>

      {isVisual && (
        <>
          <SectionTitle aside={<ResetButton onClick={() => tryEdit((p) => updateClip(p, clip.id, { transform: identityTransform(), opacity: 1, keyframes: Object.fromEntries(Object.entries(clip.keyframes).filter(([k]) => k === 'volume')) }))} />}>Transform</SectionTitle>
          <div className="px-3">
            {(['opacity', 'x', 'y', 'scale', 'rotation'] as const).map(propRow)}
            <Row label="Flip">
              <div className="flex gap-3">
                {(['flipH', 'flipV'] as const).map((k) => (
                  <label key={k} className="flex items-center gap-1">
                    <input type="checkbox" checked={clip.transform[k]} onChange={(e) => tryEdit((p) => updateClip(p, clip.id, { transform: { ...clip.transform, [k]: e.target.checked } }))} className="accent-[var(--c-accent)]" />
                    {k === 'flipH' ? 'Horizontal' : 'Vertical'}
                  </label>
                ))}
              </div>
            </Row>
            {!isText &&
              (['left', 'top', 'right', 'bottom'] as const).map((side) => (
                <Row key={side} label={`Crop ${side}`}>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="range"
                      min={0}
                      max={0.9}
                      step={0.005}
                      value={clip.transform.crop[side]}
                      aria-label={`Crop ${side}`}
                      className="min-w-0 flex-1 accent-[var(--c-accent)]"
                      {...gestureProps((v) => liveEdit((p) => updateClip(p, clip.id, { transform: { ...p.clips[clip.id]!.transform, crop: { ...p.clips[clip.id]!.transform.crop, [side]: v } } })))}
                    />
                    <span className="w-14 text-right font-mono text-2xs tabular">{Math.round(clip.transform.crop[side] * 100)}%</span>
                  </div>
                </Row>
              ))}
            <Row label="Blend">
              <select value={clip.blendMode} aria-label="Blend mode" className={input} onChange={(e) => tryEdit((p) => updateClip(p, clip.id, { blendMode: e.target.value as BlendMode }))}>
                {['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'add'].map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </Row>
          </div>
        </>
      )}

      {curveProp && <CurveEditor clip={clip} prop={curveProp} playhead={playhead} />}

      {isText && <TextSection clip={clip} />}

      {isVisual && <EffectsSection project={project} clip={clip} kinds={isText ? ['filter', 'pixel', 'mask', 'text'] : ['filter', 'pixel', 'mask']} title="Effects" />}

      {(hasAudio || asset?.kind === 'audio') && !clip.effects.some((e) => e.type === 'mute-audio' && e.enabled) && (
        <>
          <SectionTitle>Audio</SectionTitle>
          <div className="px-3">
            {propRow('volume')}
            <Row label="Pan">
              <div className="flex items-center gap-1.5">
                <input type="range" min={-1} max={1} step={0.01} value={clip.audio.pan} aria-label="Pan" className="min-w-0 flex-1 accent-[var(--c-accent)]" {...gestureProps((v) => liveEdit((p) => updateClip(p, clip.id, { audio: { ...p.clips[clip.id]!.audio, pan: v } })))} />
                <span className="w-14 text-right font-mono text-2xs tabular">{clip.audio.pan === 0 ? 'C' : `${clip.audio.pan < 0 ? 'L' : 'R'}${Math.round(Math.abs(clip.audio.pan) * 100)}`}</span>
              </div>
            </Row>
            {(['fadeIn', 'fadeOut'] as const).map((k) => (
              <Row key={k} label={k === 'fadeIn' ? 'Fade in' : 'Fade out'}>
                <div className="flex items-center gap-1.5">
                  <input
                    type="range"
                    min={0}
                    max={Math.min(10, flicksToSeconds(clip.duration))}
                    step={0.05}
                    value={flicksToSeconds(clip.audio[k])}
                    aria-label={k === 'fadeIn' ? 'Fade in' : 'Fade out'}
                    className="min-w-0 flex-1 accent-[var(--c-accent)]"
                    {...gestureProps((v) => liveEdit((p) => updateClip(p, clip.id, { audio: { ...p.clips[clip.id]!.audio, [k]: secondsToFlicks(v) } })))}
                  />
                  <span className="w-14 text-right font-mono text-2xs tabular">{flicksToSeconds(clip.audio[k]).toFixed(2)} s</span>
                </div>
              </Row>
            ))}
            {clip.speed !== 1 && !clip.reversed && (
              <Row label="Keep pitch">
                <input
                  type="checkbox"
                  checked={clip.effects.some((e) => e.type === 'preserve-pitch' && e.enabled)}
                  aria-label="Keep pitch when speed changes"
                  className="accent-[var(--c-accent)]"
                  onChange={(e) =>
                    tryEdit((p) =>
                      updateClip(p, clip.id, {
                        effects: e.target.checked ? [...clip.effects, { id: createId('fx'), type: 'preserve-pitch', enabled: true, params: {} }] : clip.effects.filter((x) => x.type !== 'preserve-pitch'),
                      }),
                    )
                  }
                />
              </Row>
            )}
          </div>
          <EffectsSection project={project} clip={clip} kinds={['audio']} title="Audio effects" exclude={['mute-audio', 'preserve-pitch']} />
        </>
      )}
    </div>
  );
}

function ResetButton({ onClick }: { onClick(): void }) {
  return (
    <button type="button" className="text-2xs font-normal normal-case tracking-normal text-faint hover:text-fg" onClick={onClick}>
      Reset
    </button>
  );
}

// ── text ──────────────────────────────────────────────────────────────────

function TextSection({ clip }: { clip: Clip }) {
  const t = clip.text!;
  const set = (patch: Partial<TextContent>) => tryEdit((p) => updateClip(p, clip.id, { text: { ...p.clips[clip.id]!.text!, ...patch }, ...(patch.text != null ? { name: patch.text.slice(0, 40) || 'Text' } : {}) }));
  const live = (patch: Partial<TextContent>) => liveEdit((p) => updateClip(p, clip.id, { text: { ...p.clips[clip.id]!.text!, ...patch } }));
  return (
    <>
      <SectionTitle>Text</SectionTitle>
      <div className="space-y-1 px-3">
        <textarea key={clip.id} defaultValue={t.text} rows={3} aria-label="Text content" className="w-full rounded-sm border border-line bg-surface-2 p-1.5 text-xs" onBlur={(e) => e.target.value !== t.text && set({ text: e.target.value.slice(0, 2000) })} />
        <Row label="Font">
          <select value={t.fontFamily} aria-label="Font" className={input} onChange={(e) => set({ fontFamily: e.target.value })}>
            {[
              ['Inter, system-ui, sans-serif', 'Sans serif'],
              ['Georgia, "Times New Roman", serif', 'Serif'],
              ['"Courier New", monospace', 'Monospace'],
              ['Impact, "Arial Black", sans-serif', 'Impact'],
              ['"Comic Sans MS", "Comic Neue", cursive', 'Casual'],
            ].map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Row>
        <Row label="Size">
          <input type="range" min={8} max={400} step={1} value={t.fontSize} aria-label="Font size" className="w-full accent-[var(--c-accent)]" {...gestureProps((v) => live({ fontSize: v }))} />
        </Row>
        <Row label="Weight">
          <select value={t.fontWeight} aria-label="Font weight" className={input} onChange={(e) => set({ fontWeight: Number(e.target.value) })}>
            {[300, 400, 500, 600, 700, 800, 900].map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </Row>
        <Row label="Align">
          <select value={t.align} aria-label="Text alignment" className={input} onChange={(e) => set({ align: e.target.value as TextContent['align'] })}>
            {['left', 'center', 'right'].map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </Row>
        <Row label="Colour">
          <input type="color" value={t.color.slice(0, 7)} aria-label="Text colour" onChange={(e) => set({ color: e.target.value })} className="h-7 w-12 rounded-sm border border-line" />
        </Row>
        <Row label="Box">
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={!!t.background} aria-label="Background box" onChange={(e) => set({ background: e.target.checked ? 'rgba(0,0,0,0.6)' : null })} className="accent-[var(--c-accent)]" />
            {t.background && <input type="color" value={t.background.startsWith('#') ? t.background.slice(0, 7) : '#000000'} aria-label="Box colour" onChange={(e) => set({ background: e.target.value })} className="h-6 w-10 rounded-sm border border-line" />}
          </div>
        </Row>
        <Row label="Outline">
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={!!t.outline} aria-label="Outline" onChange={(e) => set({ outline: e.target.checked ? { color: '#000000', width: Math.max(1, Math.round(t.fontSize / 20)) } : null })} className="accent-[var(--c-accent)]" />
            {t.outline && (
              <>
                <input type="color" value={t.outline.color.slice(0, 7)} aria-label="Outline colour" onChange={(e) => set({ outline: { ...t.outline!, color: e.target.value } })} className="h-6 w-10 rounded-sm border border-line" />
                <input type="range" min={0} max={30} step={0.5} value={t.outline.width} aria-label="Outline width" className="w-20 accent-[var(--c-accent)]" {...gestureProps((v) => live({ outline: { ...t.outline!, width: v } }))} />
              </>
            )}
          </div>
        </Row>
        <Row label="Shadow">
          <input type="checkbox" checked={!!t.shadow} aria-label="Shadow" onChange={(e) => set({ shadow: e.target.checked ? { color: 'rgba(0,0,0,0.6)', blur: t.fontSize / 6, x: 0, y: t.fontSize / 24 } : null })} className="accent-[var(--c-accent)]" />
        </Row>
        <Row label="Spacing">
          <input type="range" min={-10} max={60} step={0.5} value={t.letterSpacing} aria-label="Letter spacing" className="w-full accent-[var(--c-accent)]" {...gestureProps((v) => live({ letterSpacing: v }))} />
        </Row>
        <Row label="Line height">
          <input type="range" min={0.8} max={3} step={0.05} value={t.lineHeight} aria-label="Line height" className="w-full accent-[var(--c-accent)]" {...gestureProps((v) => live({ lineHeight: v }))} />
        </Row>
      </div>
    </>
  );
}

// ── effects ───────────────────────────────────────────────────────────────

function EffectsSection({ project, clip, kinds, title, exclude = [] }: { project: Project; clip: Clip; kinds: EffectSpec['kind'][]; title: string; exclude?: string[] }) {
  const available = EFFECTS.filter((e) => kinds.includes(e.kind) && !exclude.includes(e.type));
  const list = clip.effects.filter((e) => {
    const spec = EFFECT_BY_TYPE.get(e.type);
    return spec && kinds.includes(spec.kind) && !exclude.includes(e.type);
  });
  const setEffects = (fn: (fx: EffectInstance[]) => EffectInstance[]) => tryEdit((p) => updateClip(p, clip.id, { effects: fn(p.clips[clip.id]!.effects) }));
  const move = (id: string, dir: -1 | 1) =>
    setEffects((fx) => {
      const i = fx.findIndex((e) => e.id === id);
      const j = i + dir;
      if (j < 0 || j >= fx.length) return fx;
      const next = [...fx];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  const groups = [...new Set(available.map((e) => e.group))];
  return (
    <>
      <SectionTitle>{title}</SectionTitle>
      <div className="space-y-2 px-3">
        {list.map((e) => {
          const spec = EFFECT_BY_TYPE.get(e.type)!;
          return (
            <div key={e.id} className="rounded-sm border border-line bg-surface-2/60 p-2" aria-label={`${spec.label} effect`} role="group">
              <div className="mb-1 flex items-center gap-1.5 text-xs">
                <input type="checkbox" checked={e.enabled} aria-label={`Enable ${spec.label}`} className="accent-[var(--c-accent)]" onChange={(ev) => setEffects((fx) => fx.map((x) => (x.id === e.id ? { ...x, enabled: ev.target.checked } : x)))} />
                <span className="flex-1 font-medium">{spec.label}</span>
                <button type="button" className="px-1 text-faint hover:text-fg" aria-label={`Move ${spec.label} up`} onClick={() => move(e.id, -1)}>
                  ↑
                </button>
                <button type="button" className="px-1 text-faint hover:text-fg" aria-label={`Move ${spec.label} down`} onClick={() => move(e.id, 1)}>
                  ↓
                </button>
                <button type="button" className="px-1 text-faint hover:text-danger" aria-label={`Remove ${spec.label}`} onClick={() => setEffects((fx) => fx.filter((x) => x.id !== e.id))}>
                  ×
                </button>
              </div>
              {e.type === 'lut' && <LutLoader clip={clip} effect={e} />}
              {spec.params.map((ps) => (
                <ParamControl key={ps.key} spec={ps} effect={e} clip={clip} project={project} />
              ))}
            </div>
          );
        })}
        <select
          value=""
          aria-label={`Add ${title.toLowerCase()}`}
          className={input}
          onChange={(ev) => {
            const spec = EFFECT_BY_TYPE.get(ev.target.value);
            if (spec) setEffects((fx) => [...fx, { id: createId('fx'), type: spec.type, enabled: true, params: defaultParams(spec) }]);
          }}
        >
          <option value="">+ Add {title === 'Effects' ? 'effect' : title.toLowerCase().replace(/s$/, '')}…</option>
          {groups.map((g) => (
            <optgroup key={g} label={g}>
              {available
                .filter((e) => e.group === g)
                .map((e) => (
                  <option key={e.type} value={e.type}>
                    {e.label}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </div>
    </>
  );
}

function ParamControl({ spec, effect, clip, project }: { spec: ParamSpec; effect: EffectInstance; clip: Clip; project: Project }) {
  const value = effect.params[spec.key] ?? spec.default;
  const set = (v: number | string | boolean, live = false) => {
    const fn = (p: Project) => updateClip(p, clip.id, { effects: p.clips[clip.id]!.effects.map((x) => (x.id === effect.id ? { ...x, params: { ...x.params, [spec.key]: v } } : x)) });
    if (live) liveEdit(fn);
    else tryEdit(fn);
  };
  if (spec.type === 'number')
    return (
      <Row label={spec.label}>
        <div className="flex items-center gap-1.5">
          <input type="range" min={spec.min} max={spec.max} step={spec.step} value={Number(value)} aria-label={spec.label} className="min-w-0 flex-1 accent-[var(--c-accent)]" {...gestureProps((v) => set(v, true))} />
          <span className="w-12 text-right font-mono text-2xs tabular">
            {Number(value).toFixed(spec.step && spec.step >= 1 ? 0 : 2)}
            {spec.unit ?? ''}
          </span>
        </div>
      </Row>
    );
  if (spec.type === 'color')
    return (
      <Row label={spec.label}>
        <input type="color" value={String(value).slice(0, 7)} aria-label={spec.label} onChange={(e) => set(e.target.value)} className="h-6 w-12 rounded-sm border border-line" />
      </Row>
    );
  if (spec.type === 'boolean')
    return (
      <Row label={spec.label}>
        <input type="checkbox" checked={value === true} aria-label={spec.label} onChange={(e) => set(e.target.checked)} className="accent-[var(--c-accent)]" />
      </Row>
    );
  // select
  const options =
    spec.key === 'sidechainTrackId'
      ? project.tracks.filter((t) => t.id !== clip.trackId && t.kind !== 'text').map((t) => ({ value: t.id, label: t.name }))
      : (spec.options ?? []);
  return (
    <Row label={spec.label}>
      <select value={String(value)} aria-label={spec.label} className={input} onChange={(e) => set(e.target.value)}>
        {spec.key === 'sidechainTrackId' && <option value="">Choose a track…</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Row>
  );
}

function LutLoader({ clip, effect }: { clip: Clip; effect: EffectInstance }) {
  const ref = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="mb-1 text-xs">
      <button type="button" className="text-accent hover:underline" onClick={() => ref.current?.click()}>
        {effect.params.name ? `LUT: ${String(effect.params.name)} — replace…` : 'Load a .cube LUT…'}
      </button>
      <input
        ref={ref}
        type="file"
        accept=".cube"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          try {
            if (f.size > 8 * 1024 * 1024) throw new Error('LUT file too large (max 8 MB).');
            const lut = parseCubeLut(await f.text());
            if (lut.size > 33) throw new Error(`LUT size ${lut.size} is above the supported 33³; export a 33-point LUT.`);
            setErr(null);
            tryEdit((p) =>
              updateClip(p, clip.id, {
                effects: p.clips[clip.id]!.effects.map((x) => (x.id === effect.id ? { ...x, params: { ...x.params, size: lut.size, data: bytesToBase64(lut.data), name: lut.title || f.name } } : x)),
              }),
            );
          } catch (ex) {
            setErr(ex instanceof Error ? ex.message : String(ex));
          }
        }}
      />
      {err && <p className="text-danger">{err}</p>}
    </div>
  );
}

// ── curve editor ──────────────────────────────────────────────────────────

const EASINGS: Easing[] = ['linear', 'ease-in', 'ease-out', 'ease-in-out', 'hold', 'bezier'];

function CurveEditor({ clip, prop, playhead }: { clip: Clip; prop: AnimatableProp; playhead: Flicks }) {
  const kfs = clip.keyframes[prop] ?? [];
  const meta = PROP_META[prop];
  const svgRef = useRef<SVGSVGElement>(null);
  const [selT, setSelT] = useState<Flicks | null>(null);
  const W = 260;
  const H = 96;
  const base = staticValue(clip, prop);
  const { lo, hi } = useMemo(() => {
    const vals = [...kfs.map((k) => k.value), base];
    let a = Math.min(...vals);
    let b = Math.max(...vals);
    if (b - a < (meta.max - meta.min) * 0.05) {
      const mid = (a + b) / 2;
      const half = (meta.max - meta.min) * 0.05;
      a = Math.max(meta.min, mid - half);
      b = Math.min(meta.max, mid + half);
    }
    const pad = (b - a) * 0.1;
    return { lo: a - pad, hi: b + pad };
  }, [kfs, base, meta]);
  const x = (t: Flicks) => (t / Math.max(1, clip.duration)) * W;
  const y = (v: number) => H - ((v - lo) / (hi - lo || 1)) * H;
  const path = useMemo(() => {
    const pts: string[] = [];
    for (let i = 0; i <= 120; i++) {
      const t = (clip.duration * i) / 120;
      pts.push(`${i ? 'L' : 'M'}${x(t).toFixed(1)} ${y(evalKeyframes(kfs, t, base)).toFixed(1)}`);
    }
    return pts.join('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kfs, clip.duration, lo, hi, base]);
  const sel = kfs.find((k) => k.t === selT);
  const nextKf = sel ? kfs.find((k) => k.t > sel.t) : undefined;

  const dragPoint = (e: React.PointerEvent, k: (typeof kfs)[number]) => {
    e.stopPropagation();
    setSelT(k.t);
    const rect = svgRef.current!.getBoundingClientRect();
    beginGesture();
    let currentT = k.t;
    const move = (ev: PointerEvent) => {
      const t = Math.max(0, Math.min(clip.duration, ((ev.clientX - rect.left) / rect.width) * clip.duration));
      const v = Math.max(meta.min, Math.min(meta.max, lo + (1 - (ev.clientY - rect.top) / rect.height) * (hi - lo)));
      liveEdit((p) => {
        let q = removeKeyframe(p, clip.id, prop, currentT);
        q = setKeyframe(q, clip.id, prop, t, v, k.easing, k.bezier);
        currentT = q.clips[clip.id]!.keyframes[prop]!.find((kk) => Math.abs(kk.value - v) < 1e-9)?.t ?? currentT;
        return q;
      });
      setSelT(currentT);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      endGesture();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <>
      <SectionTitle>{meta.label} curve</SectionTitle>
      <div className="px-3">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="h-24 w-full touch-none rounded-sm border border-line bg-surface-2"
          role="img"
          aria-label={`${meta.label} keyframe curve. Double-click to add a keyframe.`}
          onDoubleClick={(e) => {
            const rect = svgRef.current!.getBoundingClientRect();
            const t = ((e.clientX - rect.left) / rect.width) * clip.duration;
            const v = lo + (1 - (e.clientY - rect.top) / rect.height) * (hi - lo);
            tryEdit((p) => setKeyframe(p, clip.id, prop, t, Math.max(meta.min, Math.min(meta.max, v))));
          }}
        >
          <path d={path} fill="none" stroke="var(--c-accent)" strokeWidth={1.5} />
          {playhead >= clip.start && playhead <= clip.start + clip.duration && <line x1={x(playhead - clip.start)} x2={x(playhead - clip.start)} y1={0} y2={H} stroke="var(--c-danger)" strokeWidth={1} />}
          {sel && sel.easing === 'bezier' && nextKf && (
            <BezierHandles
              a={sel}
              b={nextKf}
              x={x}
              y={y}
              svg={svgRef}
              onChange={(bz, live) => {
                const fn = (p: Project) => setKeyframe(p, clip.id, prop, sel.t, sel.value, 'bezier', bz);
                if (live) liveEdit(fn);
                else tryEdit(fn);
              }}
              lo={lo}
              hi={hi}
              duration={clip.duration}
            />
          )}
          {kfs.map((k) => (
            <rect
              key={k.t}
              x={x(k.t) - 4}
              y={y(k.value) - 4}
              width={8}
              height={8}
              transform={`rotate(45 ${x(k.t)} ${y(k.value)})`}
              className="cursor-move"
              fill={k.t === selT ? 'var(--c-accent)' : 'var(--c-fg)'}
              onPointerDown={(e) => dragPoint(e, k)}
            />
          ))}
        </svg>
        <p className="mt-1 text-2xs text-faint">Double-click to add a keyframe; drag points to change time and value. Choose “bezier” easing to shape a segment with handles.</p>
        {sel && (
          <div className="mt-1 flex items-center gap-2 text-xs">
            <span className="text-muted">Easing out of {flicksToSeconds(sel.t).toFixed(2)} s</span>
            <select value={sel.easing} aria-label="Keyframe easing" className="h-6 rounded-sm border border-line bg-surface-2 px-1" onChange={(e) => tryEdit((p) => setKeyframe(p, clip.id, prop, sel.t, sel.value, e.target.value as Easing, sel.bezier))}>
              {EASINGS.map((ez) => (
                <option key={ez}>{ez}</option>
              ))}
            </select>
            <button type="button" className="text-danger hover:underline" onClick={() => (tryEdit((p) => removeKeyframe(p, clip.id, prop, sel.t)), setSelT(null))}>
              Delete
            </button>
          </div>
        )}
      </div>
    </>
  );
}

export { ANIMATABLE };

/** Two draggable control points shaping the segment a→b (CSS cubic-bezier semantics). */
function BezierHandles({
  a,
  b,
  x,
  y,
  svg,
  onChange,
  lo,
  hi,
  duration,
}: {
  a: { t: Flicks; value: number; bezier?: [number, number, number, number] };
  b: { t: Flicks; value: number };
  x: (t: Flicks) => number;
  y: (v: number) => number;
  svg: React.RefObject<SVGSVGElement | null>;
  onChange(bz: [number, number, number, number], live: boolean): void;
  lo: number;
  hi: number;
  duration: Flicks;
}) {
  const bz = a.bezier ?? [0.42, 0, 0.58, 1];
  const dv = b.value - a.value || 1e-9;
  const pt = (i: 0 | 1) => {
    const fx = bz[i * 2]!;
    const fy = bz[i * 2 + 1]!;
    return { cx: x(a.t + fx * (b.t - a.t)), cy: y(a.value + fy * (b.value - a.value)) };
  };
  const p1 = pt(0);
  const p2 = pt(1);
  const drag = (i: 0 | 1) => (e: React.PointerEvent) => {
    e.stopPropagation();
    const rect = svg.current!.getBoundingClientRect();
    beginGesture();
    const move = (ev: PointerEvent) => {
      const t = ((ev.clientX - rect.left) / rect.width) * duration;
      const v = lo + (1 - (ev.clientY - rect.top) / rect.height) * (hi - lo);
      const fx = (t - a.t) / Math.max(1, b.t - a.t);
      const fy = Math.max(-2, Math.min(3, (v - a.value) / dv));
      const next: [number, number, number, number] = [...bz];
      next[i * 2] = Math.min(1, Math.max(0, fx));
      next[i * 2 + 1] = fy;
      onChange(next, true);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      endGesture();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <g aria-label="Bezier handles">
      <line x1={x(a.t)} y1={y(a.value)} x2={p1.cx} y2={p1.cy} stroke="var(--c-muted)" strokeWidth={1} />
      <line x1={x(b.t)} y1={y(b.value)} x2={p2.cx} y2={p2.cy} stroke="var(--c-muted)" strokeWidth={1} />
      <circle cx={p1.cx} cy={p1.cy} r={4} fill="var(--c-warn)" className="cursor-move" onPointerDown={drag(0)} data-handle="1" />
      <circle cx={p2.cx} cy={p2.cy} r={4} fill="var(--c-warn)" className="cursor-move" onPointerDown={drag(1)} data-handle="2" />
    </g>
  );
}
