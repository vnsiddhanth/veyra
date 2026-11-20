import { CanvasSink } from 'mediabunny';
import { MediaError } from '../core/errors';
import type { Thumbnail, ThumbnailOptions } from '../core/types';
import { mediaRange, openInput } from './probe';

/**
 * Evenly spaced thumbnails. Uses CanvasSink with a small canvas pool so memory stays
 * bounded regardless of source resolution. Each decoded frame is drawn at thumbnail size
 * and immediately encoded to JPEG; no full-size frames are retained.
 */
export async function generateThumbnails(
  file: Blob,
  options: ThumbnailOptions,
  onProgress: (p: number) => void,
  signal?: AbortSignal,
): Promise<Thumbnail[]> {
  const input = openInput(file);
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new MediaError('no-tracks', 'This file has no video track.');
    if (!(await track.canDecode())) {
      throw new MediaError('unsupported-codec', `This browser cannot decode ${track.codec ?? 'this'} video.`);
    }
    const range = await mediaRange(input);
    const t0 = range.start;
    const first = await track.getFirstTimestamp();
    const end = Math.min(range.end, options.end != null ? options.end + t0 : await track.computeDuration());
    const start = Math.max(first, options.start != null ? options.start + t0 : first);
    const count = Math.max(1, Math.floor(options.count));
    const span = Math.max(0, end - start);
    // Sample at the centre of each segment so the first thumb isn't a black lead-in frame.
    const timestamps = Array.from({ length: count }, (_, i) => start + (span * (i + 0.5)) / count);

    const aspect = track.displayHeight > 0 ? track.displayWidth / track.displayHeight : 16 / 9;
    const width = Math.max(16, Math.round(options.width));
    const height = Math.max(16, Math.round(width / aspect));
    const sink = new CanvasSink(track, { width, height, fit: 'contain', poolSize: 2 });

    const out: Thumbnail[] = [];
    let i = 0;
    for await (const wrapped of sink.canvasesAtTimestamps(timestamps)) {
      if (signal?.aborted) throw new MediaError('cancelled', 'Cancelled.');
      i++;
      if (!wrapped) continue;
      const canvas = wrapped.canvas;
      const blob =
        'convertToBlob' in canvas
          ? await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.72 })
          : await new Promise<Blob>((resolve, reject) =>
              (canvas as HTMLCanvasElement).toBlob(
                (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
                'image/jpeg',
                0.72,
              ),
            );
      out.push({ timestamp: wrapped.timestamp - t0, blob, width, height });
      onProgress(i / count);
    }
    return out;
  } finally {
    input.dispose();
  }
}
