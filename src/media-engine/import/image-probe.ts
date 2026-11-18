import { MediaError } from '../core/errors';
import type { MediaInfo } from '../core/types';
import { extensionOf } from './classify';

/**
 * Probe a still image on the main thread. Cheap: decode only to get dimensions.
 * SVG goes through an <img> element from a Blob URL. In that context scripts in the SVG
 * never execute, and the SVG is never inserted into the DOM.
 */
export async function probeImage(file: File, container: string | null): Promise<MediaInfo> {
  const isSvg = extensionOf(file.name) === 'svg' || file.type === 'image/svg+xml';
  let width = 0;
  let height = 0;
  if (isSvg) {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
      await img.decode();
      width = img.naturalWidth || 1920;
      height = img.naturalHeight || 1080;
    } catch (e) {
      throw new MediaError('corrupt', 'This SVG could not be rendered.', String(e));
    } finally {
      URL.revokeObjectURL(url);
    }
  } else {
    try {
      const bitmap = await createImageBitmap(file);
      width = bitmap.width;
      height = bitmap.height;
      bitmap.close();
    } catch (e) {
      throw new MediaError('corrupt', 'This image could not be decoded by your browser.', String(e));
    }
  }
  return {
    kind: 'image',
    container: container ?? (isSvg ? 'SVG' : file.type.replace('image/', '').toUpperCase() || 'Image'),
    mimeType: file.type || (isSvg ? 'image/svg+xml' : 'application/octet-stream'),
    size: file.size,
    duration: 0,
    durationSource: 'none',
    bitrate: null,
    video: [],
    audio: [],
    width,
    height,
    tags: {},
    warnings: [],
  };
}

/** Small JPEG thumbnail for an image asset. */
export async function imageThumbnail(file: File, width: number): Promise<Blob | null> {
  try {
    let source: CanvasImageSource;
    let sw: number;
    let sh: number;
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      source = img;
      sw = img.naturalWidth || width;
      sh = img.naturalHeight || width;
    } finally {
      URL.revokeObjectURL(url);
    }
    const height = Math.max(1, Math.round((width * sh) / sw));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(source, 0, 0, width, height);
    return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.75));
  } catch {
    return null;
  }
}
