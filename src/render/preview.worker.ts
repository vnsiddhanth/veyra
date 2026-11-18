/**
 * Program-monitor worker. Owns an OffscreenCanvas transferred from the page and renders timeline
 * frames through the same Compositor/MediaPool/AudioMixer used for export, so preview and export
 * cannot drift apart. The page drives timing (Web Audio clock); this worker only renders what it is
 * asked for and streams audio blocks ahead of playback.
 */
import type { Project } from '@/project/schema/types';
import { AudioMixer } from './audio-mix';
import { Compositor, type LayerImage } from './compositor';
import { resolveFrame, transitionsByClip } from './evaluate';
import { MediaPool } from './sources';
import { framesToFlicks } from '@/utils/time';

export type PreviewIn =
  | { kind: 'init'; canvas: OffscreenCanvas }
  | { kind: 'project'; project: Project }
  | { kind: 'files'; files: Record<string, Blob> }
  | { kind: 'quality'; scale: number }
  | { kind: 'frame'; frame: number; seq: number }
  | { kind: 'audio-start'; seconds: number; sampleRate: number; gen: number }
  | { kind: 'audio-need'; gen: number; blocks: number }
  | { kind: 'audio-stop' }
  /** Test hook: average RGB of a 4×4 patch at fractional position (x, y) of the last frame. */
  | { kind: 'probe'; x: number; y: number; id: number };

export type PreviewOut =
  | { kind: 'rendered'; frame: number; seq: number; ms: number }
  | { kind: 'audio'; gen: number; t0: number; left: Float32Array; right: Float32Array; sampleRate: number }
  | { kind: 'warnings'; warnings: string[] }
  | { kind: 'error'; message: string }
  | { kind: 'probe'; id: number; rgb: number[]; error?: string };

declare const self: {
  postMessage(message: PreviewOut, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<PreviewIn>) => void) | null;
};

let canvas: OffscreenCanvas | null = null;
let compositor: Compositor | null = null;
let project: Project | null = null;
let files = new Map<string, Blob>();
let scale = 0.5;
let pool: MediaPool | null = null;
let rendering = false;
let pendingFrame: { frame: number; seq: number } | null = null;
let mixer: AudioMixer | null = null;
let mixerGen = -1;
let audioTime = 0;
let audioRate = 48000;
let audioBusy: Promise<void> = Promise.resolve();
let lastWarnings = '';

const AUDIO_BLOCK = 0.25; // seconds per audio message

function getPool(): MediaPool {
  pool ??= new MediaPool(files, scale);
  return pool;
}

function resize() {
  if (!canvas || !project) return;
  const w = Math.max(2, Math.round((project.settings.width * scale) / 2) * 2);
  const h = Math.max(2, Math.round((project.settings.height * scale) / 2) * 2);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}

function reportWarnings() {
  const all = [...(pool?.warnings ?? []), ...(mixer?.warnings ?? []), ...[...(compositor?.skipped ?? [])].map((t) => `Effect “${t}” needs WebGL2, unavailable here.`)];
  const key = all.join('|');
  if (key !== lastWarnings) {
    lastWarnings = key;
    self.postMessage({ kind: 'warnings', warnings: all });
  }
}

async function renderFrame(frame: number, seq: number) {
  if (!canvas || !project) return;
  const t0 = performance.now();
  resize();
  compositor ??= new Compositor(canvas);
  const p = project;
  const t = framesToFlicks(frame, p.settings.frameRate);
  const layers = resolveFrame(p, t, transitionsByClip(p));
  const images = new Map<string, LayerImage>();
  const mp = getPool();
  await Promise.all(
    layers.map(async (l) => {
      if (!l.clip.assetId || l.asset?.kind === 'subtitle') return;
      try {
        const img = await mp.imageFor(p, l.clip, l.asset, frame);
        if (img) images.set(l.clip.id, img);
      } catch (e) {
        mp.warnings.add(`${l.asset?.name ?? 'Media'}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }),
  );
  compositor.render(p, layers, images, frame);
  self.postMessage({ kind: 'rendered', frame, seq, ms: performance.now() - t0 });
  reportWarnings();
}

async function pump() {
  if (rendering) return;
  rendering = true;
  try {
    while (pendingFrame) {
      const { frame, seq } = pendingFrame;
      pendingFrame = null;
      await renderFrame(frame, seq);
    }
  } catch (e) {
    self.postMessage({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
  } finally {
    rendering = false;
  }
}

function stopAudio() {
  mixer?.close();
  mixer = null;
}

self.onmessage = (event: MessageEvent<PreviewIn>) => {
  const m = event.data;
  switch (m.kind) {
    case 'init':
      canvas = m.canvas;
      compositor = new Compositor(canvas);
      break;
    case 'project':
      project = m.project;
      // Keep only streams of clips that still exist.
      pool?.retain(new Set(Object.keys(project.clips)));
      break;
    case 'files':
      files = new Map(Object.entries(m.files));
      pool?.setFiles(files);
      break;
    case 'quality':
      scale = m.scale;
      pool?.setScale(scale);
      break;
    case 'frame':
      // Latest request wins: frames requested while busy are dropped, never queued up.
      pendingFrame = { frame: m.frame, seq: m.seq };
      void pump();
      break;
    case 'audio-start':
      stopAudio();
      if (!project) break;
      mixerGen = m.gen;
      audioTime = m.seconds;
      audioRate = m.sampleRate;
      mixer = new AudioMixer(project, getPool(), audioRate, m.seconds);
      break;
    case 'audio-need': {
      const gen = m.gen;
      audioBusy = audioBusy.then(async () => {
        for (let i = 0; i < m.blocks; i++) {
          if (!mixer || gen !== mixerGen) return;
          const n = Math.round(AUDIO_BLOCK * audioRate);
          const [left, right] = await mixer.next(n);
          if (gen !== mixerGen) return;
          self.postMessage({ kind: 'audio', gen, t0: audioTime, left, right, sampleRate: audioRate }, [left.buffer, right.buffer]);
          audioTime += n / audioRate;
        }
        reportWarnings();
      }).catch((e) => self.postMessage({ kind: 'error', message: e instanceof Error ? e.message : String(e) }));
      break;
    }
    case 'audio-stop':
      mixerGen = -1;
      stopAudio();
      break;
    case 'probe': {
      // Always answer, so a caller never waits forever; report why if the read fails.
      try {
        if (!canvas) throw new Error('canvas not initialised');
        const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | null;
        if (!ctx) throw new Error('2D context unavailable');
        const x = Math.min(canvas.width - 4, Math.max(0, Math.round(m.x * canvas.width)));
        const y = Math.min(canvas.height - 4, Math.max(0, Math.round(m.y * canvas.height)));
        const d = ctx.getImageData(x, y, 4, 4).data;
        const sum = [0, 0, 0];
        for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) sum[k]! += d[i + k]!;
        self.postMessage({ kind: 'probe', id: m.id, rgb: sum.map((v) => Math.round(v / 16)) });
      } catch (e) {
        self.postMessage({ kind: 'probe', id: m.id, rgb: [], error: e instanceof Error ? `${e.name}: ${e.message}` : String(e) });
      }
      break;
    }
  }
};
