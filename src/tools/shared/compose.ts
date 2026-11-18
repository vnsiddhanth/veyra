/**
 * Build small timeline projects for tools that combine media (merge, speed, overlays, slideshow…).
 * The project is rendered by the same engine as the editor's export, so tool output and editor
 * output behave identically.
 */
import type { MediaInfo } from '@/media-engine';
import { createClip, createProject, createTrack, settingsFromMedia } from '@/project/schema/factory';
import type { Asset, Clip, Project, Track, TrackKind } from '@/project/schema/types';
import type { RenderInput, RenderSettings } from '@/render/render-project';
import { createId } from '@/utils/id';
import { fpsToRational, quantizeToFrame, secondsToFlicks, type Rational } from '@/utils/time';

export class Composition {
  project: Project;
  readonly files: Record<string, Blob> = {};

  constructor(settings: { width: number; height: number; frameRate: Rational; background?: string }) {
    const p = createProject('Tool composition', { ...settingsFromMedia(settings.width, settings.height, settings.frameRate), background: settings.background ?? '#000000' });
    this.project = { ...p, tracks: [] };
  }

  static fromVideo(info: MediaInfo, overrides: { width?: number; height?: number; fps?: number } = {}): Composition {
    const fps = overrides.fps ?? info.video[0]?.frameRate?.bestGuess ?? 30;
    return new Composition({ width: overrides.width ?? (info.width || 1280), height: overrides.height ?? (info.height || 720), frameRate: fpsToRational(fps) });
  }

  asset(file: Blob, info: MediaInfo | null, kind: Asset['kind'], name = 'media', subtitles: Asset['subtitles'] = null): Asset {
    const a: Asset = {
      id: createId('ast'),
      kind,
      name,
      fileName: name,
      size: file.size,
      lastModified: 0,
      fingerprint: createId('fp'),
      mimeType: file.type,
      info,
      subtitles,
      folderId: null,
      addedAt: Date.now(),
    };
    this.project = { ...this.project, assets: [...this.project.assets, a] };
    this.files[a.id] = file;
    return a;
  }

  /** Add a track at the top (rendered above existing ones) or bottom. */
  track(kind: TrackKind, position: 'top' | 'bottom' = 'top'): Track {
    const t = createTrack(kind, `${kind[0]!.toUpperCase()}${this.project.tracks.length + 1}`);
    this.project = { ...this.project, tracks: position === 'top' ? [t, ...this.project.tracks] : [...this.project.tracks, t] };
    return t;
  }

  /** Seconds → frame-aligned flicks. */
  q(seconds: number, mode: 'floor' | 'round' | 'ceil' = 'round'): number {
    return quantizeToFrame(secondsToFlicks(seconds), this.project.settings.frameRate, mode);
  }

  clip(track: Track, init: { assetId: string | null; start: number; duration: number; sourceIn?: number; name?: string } & Partial<Omit<Clip, 'id' | 'trackId' | 'start' | 'duration' | 'sourceIn' | 'assetId'>>): Clip {
    const { assetId, start, duration, sourceIn, name, ...rest } = init;
    const c: Clip = { ...createClip({ trackId: track.id, assetId, start, duration, sourceIn: sourceIn ?? 0, name: name ?? 'clip' }), ...rest };
    const tracks = this.project.tracks.map((t) => (t.id === track.id ? { ...t, clipIds: [...t.clipIds, c.id].sort((a, b) => (a === c.id ? c.start : this.project.clips[a]!.start) - (b === c.id ? c.start : this.project.clips[b]!.start)) } : t));
    this.project = { ...this.project, tracks, clips: { ...this.project.clips, [c.id]: c } };
    return c;
  }

  transition(from: Clip, to: Clip, type: string, durationSeconds: number) {
    const id = createId('trn');
    this.project = {
      ...this.project,
      transitions: { ...this.project.transitions, [id]: { id, type, fromClipId: from.id, toClipId: to.id, duration: this.q(durationSeconds), params: {} } },
    };
  }

  input(settings: RenderSettings): RenderInput {
    return { project: this.project, files: this.files, settings };
  }
}
