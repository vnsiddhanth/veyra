/**
 * Device benchmark (runs in the media worker): encodes a synthetic clip, decodes it back, and renders
 * a two-layer composition through the export path. Numbers are measured, never estimated.
 */
import { BufferTarget, CanvasSource, Mp4OutputFormat, Output, VideoSampleSink, WebMOutputFormat, getFirstEncodableVideoCodec, type VideoCodec } from 'mediabunny';
import { createClip, createProject, createTrack } from '@/project/schema/factory';
import type { Asset, Project } from '@/project/schema/types';
import { renderProject } from '@/render/render-project';
import { secondsToFlicks } from '@/utils/time';
import { MediaError } from './core/errors';
import { openInput, probeMedia } from './import/probe';

export interface BenchOptions {
  width: number;
  height: number;
  seconds: number;
  fps: number;
}

export interface BenchResult {
  codec: string;
  width: number;
  height: number;
  frames: number;
  encodeFps: number;
  decodeFps: number;
  renderFps: number;
  renderSeconds: number;
  hardwareConcurrency: number;
}

export async function runBenchmark(o: BenchOptions, onProgress: (p: number) => void, signal: AbortSignal): Promise<BenchResult> {
  const frames = Math.round(o.seconds * o.fps);
  const mp4 = new Mp4OutputFormat({ fastStart: 'in-memory' });
  let codec = await getFirstEncodableVideoCodec(mp4.getSupportedVideoCodecs(), { width: o.width, height: o.height });
  let format: Mp4OutputFormat | WebMOutputFormat = mp4;
  if (!codec) {
    format = new WebMOutputFormat();
    codec = await getFirstEncodableVideoCodec(format.getSupportedVideoCodecs(), { width: o.width, height: o.height });
  }
  if (!codec) throw new MediaError('no-encoder', `No video encoder is available at ${o.width}×${o.height}.`);

  // 1. Encode a synthetic clip.
  const canvas = new OffscreenCanvas(o.width, o.height);
  const ctx = canvas.getContext('2d')!;
  const target = new BufferTarget();
  const out = new Output({ format, target });
  const src = new CanvasSource(canvas, { codec: codec as VideoCodec, bitrate: 8_000_000, keyFrameInterval: 2 });
  out.addVideoTrack(src, { frameRate: o.fps });
  await out.start();
  let t0 = performance.now();
  for (let i = 0; i < frames; i++) {
    if (signal.aborted) throw new MediaError('cancelled', 'Cancelled.');
    const g = ctx.createLinearGradient(0, 0, o.width, o.height);
    g.addColorStop(0, `hsl(${(i * 7) % 360} 60% 40%)`);
    g.addColorStop(1, `hsl(${(i * 7 + 120) % 360} 60% 20%)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, o.width, o.height);
    ctx.fillStyle = '#fff';
    ctx.font = `${Math.round(o.height / 6)}px sans-serif`;
    ctx.fillText(String(i), o.width * 0.1 + ((i * 13) % (o.width * 0.6)), o.height * 0.6);
    await src.add(i / o.fps, 1 / o.fps);
    onProgress((i / frames) * 0.3);
  }
  await out.finalize();
  const encodeFps = frames / ((performance.now() - t0) / 1000);
  const bytes = target.buffer!;

  // 2. Decode it back.
  const input = openInput(new Blob([bytes]));
  t0 = performance.now();
  let decoded = 0;
  try {
    const track = (await input.getPrimaryVideoTrack())!;
    const sink = new VideoSampleSink(track);
    for await (const s of sink.samples()) {
      s.close();
      decoded++;
      if (signal.aborted) throw new MediaError('cancelled', 'Cancelled.');
      onProgress(0.3 + (decoded / frames) * 0.2);
    }
  } finally {
    input.dispose();
  }
  const decodeFps = decoded / ((performance.now() - t0) / 1000);

  // 3. Render a two-layer composition (full frame + scaled picture-in-picture) through the export path.
  const file = new File([bytes], 'bench.mp4', { type: format.mimeType });
  const info = await probeMedia(file);
  let p: Project = createProject('bench', { width: o.width, height: o.height, frameRate: { num: o.fps, den: 1 } });
  const v1 = createTrack('video', 'V1');
  const v2 = createTrack('video', 'V2');
  const asset: Asset = { id: 'a', kind: 'video', name: 'bench', fileName: 'bench.mp4', size: bytes.byteLength, lastModified: 0, fingerprint: 'bench', mimeType: format.mimeType, info, subtitles: null, folderId: null, addedAt: 0 };
  const dur = secondsToFlicks(frames / o.fps);
  const c1 = createClip({ trackId: v1.id, assetId: 'a', start: 0, duration: dur, name: 'bg' });
  const c2 = { ...createClip({ trackId: v2.id, assetId: 'a', start: 0, duration: dur, name: 'pip' }), transform: { x: o.width / 4, y: o.height / 4, scaleX: 0.4, scaleY: 0.4, rotation: 0, flipH: false, flipV: false, crop: { left: 0, top: 0, right: 0, bottom: 0 } } };
  p = { ...p, assets: [asset], tracks: [{ ...v2, clipIds: [c2.id] }, { ...v1, clipIds: [c1.id] }], clips: { [c1.id]: c1, [c2.id]: c2 } };
  t0 = performance.now();
  const res = await renderProject(
    { project: p, files: { a: file }, settings: { container: format instanceof Mp4OutputFormat ? 'mp4' : 'webm', fileName: 'bench-render', videoBitrate: 'medium' } },
    `bench_${Date.now()}`,
    (x) => onProgress(0.5 + x * 0.5),
    signal,
  );
  const renderSeconds = (performance.now() - t0) / 1000;
  if (res.scratchName) {
    const root = await navigator.storage.getDirectory();
    await (await root.getDirectoryHandle('outputs')).removeEntry(res.scratchName).catch(() => undefined);
  }
  onProgress(1);
  return {
    codec,
    width: o.width,
    height: o.height,
    frames,
    encodeFps: Math.round(encodeFps * 10) / 10,
    decodeFps: Math.round(decodeFps * 10) / 10,
    renderFps: Math.round((frames / renderSeconds) * 10) / 10,
    renderSeconds: Math.round(renderSeconds * 100) / 100,
    hardwareConcurrency: navigator.hardwareConcurrency ?? 0,
  };
}
