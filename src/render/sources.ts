/**
 * Decoded media for rendering: one Mediabunny Input per asset, one sequential frame stream per
 * clip, and cached bitmaps for stills. Streams pull frames in presentation order, so a clip is
 * decoded once from its nearest key frame and then forward-only.
 */
import { CanvasSink, type InputVideoTrack, type Input, type WrappedCanvas } from 'mediabunny';
import { openInput } from '@/media-engine/import/probe';
import type { Asset, Clip, Project } from '@/project/schema/types';
import { clipEnd } from '@/timeline/model/ops';
import { frameDuration, framesToFlicks, flicksToFrames, type Flicks } from '@/utils/time';
import type { LayerImage } from './compositor';
import { clampSource, sourceTimeAt, transitionWindow, transitionsByClip } from './evaluate';

/** Frames a clip is visible for (its own range plus any transition overlap), as [first, end) frame indices. */
export function clipFrameRange(p: Project, clip: Clip): { first: number; end: number } {
  let start: Flicks = clip.start;
  let end: Flicks = clipEnd(clip);
  for (const tr of transitionsByClip(p).get(clip.id) ?? []) {
    const w = transitionWindow(p, tr);
    if (!w) continue;
    start = Math.min(start, w.start);
    end = Math.max(end, w.end);
  }
  const rate = p.settings.frameRate;
  return { first: Math.max(0, flicksToFrames(start, rate)), end: Math.ceil((end * rate.num) / (705_600_000 * rate.den) - 1e-9) };
}

/** Largest scale a clip reaches (static or keyframed), used to choose the decode size. */
function maxScale(clip: Clip): number {
  const kf = clip.keyframes.scale ?? [];
  return Math.max(clip.transform.scaleX, clip.transform.scaleY, ...kf.map((k) => k.value), 1);
}

/** Sequential decoded frames for one clip. `frameAt(f)` must be called with non-decreasing f for best speed. */
export class ClipFrameStream {
  private iter: AsyncGenerator<WrappedCanvas | null> | null = null;
  private cursor = -1; // frame index of the next result the iterator yields
  private last: { f: number; img: LayerImage | null } | null = null;
  private readonly sink: CanvasSink;

  constructor(
    private project: Project,
    private clip: Clip,
    private readonly asset: Asset,
    track: InputVideoTrack,
    renderScale: number,
  ) {
    const info = asset.info!;
    const fit = Math.min(project.settings.width / info.width, project.settings.height / info.height);
    const want = Math.ceil(info.width * fit * renderScale * maxScale(clip));
    const width = Math.max(2, Math.min(info.width, want));
    this.sink = new CanvasSink(track, { width, poolSize: 3, fit: 'fill', height: Math.max(2, Math.round((width * info.height) / info.width)) });
  }

  private timeOf(f: number): number {
    const t = framesToFlicks(f, this.project.settings.frameRate);
    // Source timestamps start at the media's own start time (non-zero for transport streams).
    return clampSource(sourceTimeAt(this.clip, t, frameDuration(this.project.settings.frameRate)), this.asset) + (this.asset.info?.startTime ?? 0);
  }

  private start(from: number) {
    void this.iter?.return(undefined);
    const range = clipFrameRange(this.project, this.clip);
    const self = this;
    function* times() {
      for (let f = from; f < range.end; f++) yield self.timeOf(f);
    }
    this.iter = this.sink.canvasesAtTimestamps(times());
    this.cursor = from;
  }

  async frameAt(f: number): Promise<LayerImage | null> {
    if (this.last && this.last.f === f) return this.last.img;
    // Restart for backwards seeks and long jumps; otherwise decode forward.
    if (!this.iter || f < this.cursor || f > this.cursor + 90) this.start(f);
    let out: WrappedCanvas | null = null;
    while (this.cursor <= f) {
      const r = await this.iter!.next();
      if (r.done) {
        out = null;
        this.iter = null;
        break;
      }
      out = r.value;
      this.cursor++;
    }
    const img = out ? { source: out.canvas as LayerImage['source'], width: out.canvas.width, height: out.canvas.height } : null;
    this.last = { f, img };
    return img;
  }

  /** Whether this stream was built for the same clip timing (edits create new clip objects). */
  matches(project: Project, clip: Clip): boolean {
    if (clip === this.clip && project.settings === this.project.settings && project.transitions === this.project.transitions) return true;
    // Value comparison: projects posted to a worker are fresh copies on every edit.
    const a = this.clip;
    const fr = (x: Project) => `${x.settings.frameRate.num}/${x.settings.frameRate.den}:${x.settings.width}x${x.settings.height}`;
    const trs = (x: Project, id: string) =>
      Object.values(x.transitions)
        .filter((t) => t.fromClipId === id || t.toClipId === id)
        .map((t) => `${t.fromClipId}>${t.toClipId}:${t.duration}`)
        .sort()
        .join();
    return (
      a.start === clip.start &&
      a.duration === clip.duration &&
      a.sourceIn === clip.sourceIn &&
      a.speed === clip.speed &&
      a.reversed === clip.reversed &&
      a.assetId === clip.assetId &&
      a.transform.scaleX === clip.transform.scaleX &&
      fr(this.project) === fr(project) &&
      trs(this.project, a.id) === trs(project, clip.id) &&
      JSON.stringify(a.keyframes.scale ?? null) === JSON.stringify(clip.keyframes.scale ?? null) &&
      JSON.stringify(a.keyframes.speed ?? null) === JSON.stringify(clip.keyframes.speed ?? null)
    );
  }

  /** Point at the latest project/clip objects (after a value-equal update). */
  rebind(project: Project, clip: Clip) {
    this.project = project;
    this.clip = clip;
  }

  close() {
    void this.iter?.return(undefined);
    this.iter = null;
  }
}

/** Inputs, frame streams and still images for one render session. */
export class MediaPool {
  private readonly inputs = new Map<string, Input>();
  private readonly videoTracks = new Map<string, Promise<InputVideoTrack | null>>();
  private readonly streams = new Map<string, ClipFrameStream>();
  private readonly stills = new Map<string, Promise<LayerImage | null>>();
  readonly warnings = new Set<string>();

  constructor(
    private files: ReadonlyMap<string, Blob>,
    private renderScale: number,
  ) {}

  /** Replace the file map (media reconnected/removed). Inputs for changed files are reopened. */
  setFiles(files: ReadonlyMap<string, Blob>) {
    for (const [id, input] of this.inputs) {
      if (files.get(id) !== this.files.get(id)) {
        input.dispose();
        this.inputs.delete(id);
        this.videoTracks.delete(id);
        this.stills.delete(id);
        for (const [cid, st] of this.streams) {
          st.close();
          this.streams.delete(cid);
        }
      }
    }
    this.files = files;
  }

  /** Change the decode scale (preview quality); drops streams so they re-open at the new size. */
  setScale(scale: number) {
    if (scale === this.renderScale) return;
    this.renderScale = scale;
    for (const s of this.streams.values()) s.close();
    this.streams.clear();
  }

  input(assetId: string): Input | null {
    const file = this.files.get(assetId);
    if (!file) return null;
    let input = this.inputs.get(assetId);
    if (!input) {
      input = openInput(file);
      this.inputs.set(assetId, input);
    }
    return input;
  }

  hasFile(assetId: string): boolean {
    return this.files.has(assetId);
  }

  file(assetId: string): Blob | undefined {
    return this.files.get(assetId);
  }

  private videoTrack(assetId: string): Promise<InputVideoTrack | null> {
    let p = this.videoTracks.get(assetId);
    if (!p) {
      const input = this.input(assetId);
      p = input ? input.getPrimaryVideoTrack() : Promise.resolve(null);
      this.videoTracks.set(assetId, p);
    }
    return p;
  }

  /** Decoded image for a visual layer at output frame `f`. */
  async imageFor(project: Project, clip: Clip, asset: Asset | undefined, f: number): Promise<LayerImage | null> {
    if (!asset || !clip.assetId) return null;
    if (!this.files.has(asset.id)) {
      this.warnings.add(`Media offline: ${asset.name}`);
      return null;
    }
    if (asset.kind === 'image') return this.still(asset);
    if (asset.kind !== 'video') return null;
    let s = this.streams.get(clip.id);
    if (s && !s.matches(project, clip)) {
      s.close();
      s = undefined;
    } else s?.rebind(project, clip);
    if (!s) {
      const track = await this.videoTrack(asset.id);
      if (!track) return null;
      s = new ClipFrameStream(project, clip, asset, track, this.renderScale);
      this.streams.set(clip.id, s);
    }
    return s.frameAt(f);
  }

  private still(asset: Asset): Promise<LayerImage | null> {
    let p = this.stills.get(asset.id);
    if (!p) {
      const file = this.files.get(asset.id)!;
      p = createImageBitmap(file).then(
        (bmp) => ({ source: bmp, width: bmp.width, height: bmp.height }),
        () => {
          this.warnings.add(`${asset.name} could not be decoded here${asset.mimeType.includes('svg') ? ' (SVG images are not supported in the renderer yet)' : ''}.`);
          return null;
        },
      );
      this.stills.set(asset.id, p);
    }
    return p;
  }

  /** Drop frame streams of clips that are no longer in the project (preview edits). */
  retain(clipIds: ReadonlySet<string>) {
    for (const [id, s] of this.streams) {
      if (!clipIds.has(id)) {
        s.close();
        this.streams.delete(id);
      }
    }
  }

  /** Forget the stream for a clip whose timing changed. */
  invalidateClip(clipId: string) {
    this.streams.get(clipId)?.close();
    this.streams.delete(clipId);
  }

  dispose() {
    for (const s of this.streams.values()) s.close();
    this.streams.clear();
    for (const p of this.stills.values()) void p.then((img) => (img?.source as ImageBitmap | undefined)?.close?.());
    this.stills.clear();
    for (const i of this.inputs.values()) i.dispose();
    this.inputs.clear();
    this.videoTracks.clear();
  }
}
