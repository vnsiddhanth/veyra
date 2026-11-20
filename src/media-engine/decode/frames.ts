/**
 * Frame extraction and audio waveform analysis. Runs in the media worker.
 */
import { AudioSampleSink, CanvasSink } from 'mediabunny';
import { MediaError } from '../core/errors';
import type { FrameOptions, FrameResult, WaveformData } from '../core/types';
import { mediaStart, openInput } from '../import/probe';

const MIME = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' } as const;

/** Decode the frame displayed at `timestamp` and encode it as an image. */
export async function extractFrame(file: Blob, options: FrameOptions, signal: AbortSignal): Promise<FrameResult> {
  const input = openInput(file);
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new MediaError('no-tracks', 'This file has no video track.');
    if (!(await track.canDecode())) throw new MediaError('unsupported-codec', `This browser cannot decode ${track.codec ?? 'this'} video.`);
    const aspect = track.displayWidth / track.displayHeight;
    const width = options.width ? Math.max(2, Math.round(options.width)) : track.displayWidth;
    const height = options.width ? Math.max(2, Math.round(width / aspect)) : track.displayHeight;
    // poolSize 0: the canvas is ours, not reused by the sink.
    const sink = new CanvasSink(track, { width, height, fit: 'fill', poolSize: 0 });
    const t0 = await mediaStart(input);
    const first = await track.getFirstTimestamp();
    const wrapped = await sink.getCanvas(Math.max(first, options.timestamp + t0));
    if (signal.aborted) throw new MediaError('cancelled', 'Cancelled.');
    if (!wrapped) throw new MediaError('corrupt', 'No frame could be decoded at that time.');
    const canvas = wrapped.canvas as OffscreenCanvas;
    const quality = options.format === 'png' ? undefined : (options.quality ?? 0.92);
    const blob = await canvas.convertToBlob({ type: MIME[options.format], quality });
    if (blob.type !== MIME[options.format]) {
      // Browsers silently fall back to PNG for unsupported types (e.g. WebP in Safari).
      throw new MediaError('no-encoder', `This browser cannot encode ${options.format.toUpperCase()} images. Choose PNG or JPEG.`);
    }
    return { blob, width, height, frameTimestamp: wrapped.timestamp - t0 };
  } finally {
    input.dispose();
  }
}

/**
 * Peak envelope of the primary audio track: one 0–255 value per bucket (max |sample| over all
 * channels). Streams decoded audio in chunks; never holds the whole track in memory.
 */
export async function computeWaveform(file: Blob, peaksPerSecond: number, onProgress: (p: number) => void, signal: AbortSignal): Promise<WaveformData> {
  const input = openInput(file);
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) throw new MediaError('no-tracks', 'This file has no audio track.');
    if (!(await track.canDecode())) throw new MediaError('unsupported-codec', `This browser cannot decode ${track.codec ?? 'this'} audio.`);
    const t0 = await mediaStart(input);
    const duration = (await track.computeDuration()) - t0;
    const first = (await track.getFirstTimestamp()) - t0;
    const buckets = Math.max(1, Math.ceil((duration - Math.min(0, first)) * peaksPerSecond));
    const peaks = new Uint8Array(buckets);
    const sink = new AudioSampleSink(track);
    let scratch = new Float32Array(0);
    for await (const sample of sink.samples()) {
      try {
        if (signal.aborted) throw new MediaError('cancelled', 'Cancelled.');
        const frames = sample.numberOfFrames;
        if (scratch.length < frames) scratch = new Float32Array(frames);
        const framesPerBucket = sample.sampleRate / peaksPerSecond;
        const startFrame = Math.max(0, sample.timestamp - t0) * sample.sampleRate;
        for (let ch = 0; ch < sample.numberOfChannels; ch++) {
          sample.copyTo(scratch, { planeIndex: ch, format: 'f32-planar', frameCount: frames });
          for (let i = 0; i < frames; i++) {
            const b = Math.floor((startFrame + i) / framesPerBucket);
            if (b >= buckets) break;
            const v = Math.min(255, Math.round(Math.abs(scratch[i]!) * 255));
            if (v > peaks[b]!) peaks[b] = v;
          }
        }
        if (duration > 0) onProgress(Math.min(1, (sample.timestamp - t0 + sample.duration) / duration));
      } finally {
        sample.close();
      }
    }
    return { peaks, peaksPerSecond, duration };
  } finally {
    input.dispose();
  }
}
