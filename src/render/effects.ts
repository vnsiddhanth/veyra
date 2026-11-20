/**
 * Effect catalog. Every effect listed here is implemented by the compositor; the inspector builds
 * its controls from these specs. 'filter' effects map to Canvas 2D filters (GPU-accelerated in all
 * engines that support `ctx.filter`); 'pixel' effects run in the WebGL2 pass (`pixel-fx.ts`).
 */
import type { EffectInstance } from '@/project/schema/types';

export interface ParamSpec {
  key: string;
  label: string;
  type: 'number' | 'color' | 'select' | 'boolean';
  min?: number;
  max?: number;
  step?: number;
  default: number | string | boolean;
  options?: { value: string; label: string }[];
  unit?: string;
}

export interface EffectSpec {
  type: string;
  label: string;
  group: 'Color' | 'Stylize' | 'Blur' | 'Keying' | 'Mask' | 'Audio' | 'Text';
  kind: 'filter' | 'pixel' | 'mask' | 'audio' | 'text';
  params: ParamSpec[];
}

const n = (key: string, label: string, min: number, max: number, def: number, step = 0.01, unit?: string): ParamSpec => ({
  key,
  label,
  type: 'number',
  min,
  max,
  step,
  default: def,
  unit,
});

export const EFFECTS: EffectSpec[] = [
  { type: 'brightness', label: 'Brightness', group: 'Color', kind: 'filter', params: [n('amount', 'Amount', -1, 1, 0)] },
  { type: 'contrast', label: 'Contrast', group: 'Color', kind: 'filter', params: [n('amount', 'Amount', -1, 1, 0)] },
  { type: 'saturation', label: 'Saturation', group: 'Color', kind: 'filter', params: [n('amount', 'Amount', -1, 1, 0)] },
  { type: 'hue', label: 'Hue rotate', group: 'Color', kind: 'filter', params: [n('degrees', 'Degrees', -180, 180, 0, 1, '°')] },
  { type: 'grayscale', label: 'Black & white', group: 'Stylize', kind: 'filter', params: [n('amount', 'Amount', 0, 1, 1)] },
  { type: 'sepia', label: 'Sepia', group: 'Stylize', kind: 'filter', params: [n('amount', 'Amount', 0, 1, 1)] },
  { type: 'invert', label: 'Invert', group: 'Stylize', kind: 'filter', params: [n('amount', 'Amount', 0, 1, 1)] },
  { type: 'vintage', label: 'Vintage look', group: 'Stylize', kind: 'filter', params: [n('amount', 'Amount', 0, 1, 1)] },
  { type: 'blur', label: 'Gaussian blur', group: 'Blur', kind: 'filter', params: [n('radius', 'Radius', 0, 60, 6, 0.5, 'px')] },
  {
    type: 'color-balance',
    label: 'Temperature & tint',
    group: 'Color',
    kind: 'pixel',
    params: [n('temperature', 'Temperature', -1, 1, 0), n('tint', 'Tint', -1, 1, 0)],
  },
  {
    type: 'curves',
    label: 'Levels / curves',
    group: 'Color',
    kind: 'pixel',
    params: [n('shadows', 'Shadows', -0.5, 0.5, 0), n('midtones', 'Midtones (gamma)', 0.3, 3, 1), n('highlights', 'Highlights', -0.5, 0.5, 0)],
  },
  {
    type: 'lut',
    label: 'LUT (.cube)',
    group: 'Color',
    kind: 'pixel',
    // The LUT itself lives in params `size`, `data` (base64 RGB8) and `name`, set by the .cube loader.
    params: [n('mix', 'Mix', 0, 1, 1)],
  },
  { type: 'vignette', label: 'Vignette', group: 'Stylize', kind: 'pixel', params: [n('amount', 'Amount', 0, 1, 0.5), n('softness', 'Softness', 0.05, 1, 0.5)] },
  { type: 'grain', label: 'Film grain', group: 'Stylize', kind: 'pixel', params: [n('amount', 'Amount', 0, 1, 0.25)] },
  {
    type: 'chroma-key',
    label: 'Chroma key',
    group: 'Keying',
    kind: 'pixel',
    params: [
      { key: 'color', label: 'Key color', type: 'color', default: '#00ff00' },
      n('similarity', 'Similarity', 0.01, 1, 0.3),
      n('smoothness', 'Smoothness', 0, 0.5, 0.08),
      n('spill', 'Spill reduction', 0, 1, 0.5),
    ],
  },
  {
    type: 'mask',
    label: 'Shape mask',
    group: 'Mask',
    kind: 'mask',
    params: [
      {
        key: 'shape',
        label: 'Shape',
        type: 'select',
        default: 'ellipse',
        options: [
          { value: 'ellipse', label: 'Ellipse' },
          { value: 'rect', label: 'Rectangle' },
        ],
      },
      n('cx', 'Center X', 0, 1, 0.5),
      n('cy', 'Center Y', 0, 1, 0.5),
      n('w', 'Width', 0.01, 1.5, 0.6),
      n('h', 'Height', 0.01, 1.5, 0.6),
      n('feather', 'Feather', 0, 0.5, 0.05),
      { key: 'invert', label: 'Invert', type: 'boolean', default: false },
    ],
  },
  {
    type: 'text-animation',
    label: 'Text animation',
    group: 'Text',
    kind: 'text',
    params: [
      {
        key: 'in',
        label: 'In',
        type: 'select',
        default: 'fade',
        options: ['none', 'fade', 'slide-up', 'slide-left', 'pop', 'typewriter'].map((v) => ({ value: v, label: v })),
      },
      {
        key: 'out',
        label: 'Out',
        type: 'select',
        default: 'fade',
        options: ['none', 'fade', 'slide-down', 'slide-right', 'pop'].map((v) => ({ value: v, label: v })),
      },
      n('duration', 'Duration', 0.1, 3, 0.5, 0.05, 's'),
    ],
  },
  {
    type: 'credits-roll',
    label: 'Credits roll',
    group: 'Text',
    kind: 'text',
    params: [
      {
        key: 'direction',
        label: 'Direction',
        type: 'select',
        default: 'up',
        options: [
          { value: 'up', label: 'Roll up (end credits)' },
          { value: 'left', label: 'Crawl left (one line)' },
        ],
      },
    ],
  },
  { type: 'mute-audio', label: 'Mute audio', group: 'Audio', kind: 'audio', params: [] },
  { type: 'preserve-pitch', label: 'Keep pitch when speed changes', group: 'Audio', kind: 'audio', params: [] },
  {
    type: 'eq',
    label: '3-band EQ',
    group: 'Audio',
    kind: 'audio',
    params: [n('low', 'Low (200 Hz)', -24, 12, 0, 0.5, 'dB'), n('mid', 'Mid (1 kHz)', -24, 12, 0, 0.5, 'dB'), n('high', 'High (5 kHz)', -24, 12, 0, 0.5, 'dB')],
  },
  {
    type: 'compressor',
    label: 'Compressor',
    group: 'Audio',
    kind: 'audio',
    params: [n('threshold', 'Threshold', -60, 0, -18, 1, 'dB'), n('ratio', 'Ratio', 1, 20, 4, 0.5), n('makeup', 'Make-up gain', 0, 24, 0, 0.5, 'dB')],
  },
  {
    type: 'ducking',
    label: 'Auto-duck under voice',
    group: 'Audio',
    kind: 'audio',
    params: [n('amount', 'Reduction', -30, 0, -12, 1, 'dB'), { key: 'sidechainTrackId', label: 'Voice track', type: 'select', default: '' }],
  },
];

export const EFFECT_BY_TYPE = new Map(EFFECTS.map((e) => [e.type, e]));

export function defaultParams(spec: EffectSpec): EffectInstance['params'] {
  return Object.fromEntries(spec.params.map((p) => [p.key, p.default]));
}

const num = (e: EffectInstance, key: string, def: number): number => {
  const v = e.params[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : def;
};

/** Canvas `filter` string for the filter-kind effects of a clip. `k` scales pixel radii to the render size. */
export function cssFilter(effects: readonly EffectInstance[], k: number): string {
  const parts: string[] = [];
  for (const e of effects) {
    if (!e.enabled) continue;
    switch (e.type) {
      case 'brightness':
        parts.push(`brightness(${Math.max(0, 1 + num(e, 'amount', 0))})`);
        break;
      case 'contrast':
        parts.push(`contrast(${Math.max(0, 1 + num(e, 'amount', 0))})`);
        break;
      case 'saturation':
        parts.push(`saturate(${Math.max(0, 1 + num(e, 'amount', 0))})`);
        break;
      case 'hue':
        parts.push(`hue-rotate(${num(e, 'degrees', 0)}deg)`);
        break;
      case 'grayscale':
        parts.push(`grayscale(${num(e, 'amount', 1)})`);
        break;
      case 'sepia':
        parts.push(`sepia(${num(e, 'amount', 1)})`);
        break;
      case 'invert':
        parts.push(`invert(${num(e, 'amount', 1)})`);
        break;
      case 'vintage': {
        const a = num(e, 'amount', 1);
        parts.push(`sepia(${0.45 * a}) contrast(${1 + 0.1 * a}) saturate(${1 - 0.25 * a}) brightness(${1 + 0.04 * a})`);
        break;
      }
      case 'blur': {
        const r = num(e, 'radius', 0) * k;
        if (r > 0.01) parts.push(`blur(${r.toFixed(2)}px)`);
        break;
      }
    }
  }
  return parts.length ? parts.join(' ') : 'none';
}

export function hasPixelEffects(effects: readonly EffectInstance[]): boolean {
  return effects.some((e) => e.enabled && EFFECT_BY_TYPE.get(e.type)?.kind === 'pixel');
}

export function maskEffect(effects: readonly EffectInstance[]): EffectInstance | undefined {
  return effects.find((e) => e.enabled && e.type === 'mask');
}

export { num as effectNum };
