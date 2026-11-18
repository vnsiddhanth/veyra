import type { MediaKind } from '../core/types';

/**
 * Cheap file classification from extension, MIME type and magic bytes.
 * Never trusts a single signal: browsers often report empty or generic MIME types
 * (e.g. MKV, FLAC on Windows), and extensions can lie.
 */
export interface Classification {
  kind: MediaKind | 'unknown';
  /** Container guess for display and routing (e.g. "MP4", "Matroska", "AVI"). */
  container: string | null;
  /** True if our primary (Mediabunny) pipeline can demux this container. */
  primaryPipeline: boolean;
  reason?: string;
}

const EXTENSIONS: Record<string, { kind: MediaKind; container: string; primary: boolean }> = {
  mp4: { kind: 'video', container: 'MP4', primary: true },
  m4v: { kind: 'video', container: 'MP4', primary: true },
  mov: { kind: 'video', container: 'QuickTime', primary: true },
  webm: { kind: 'video', container: 'WebM', primary: true },
  mkv: { kind: 'video', container: 'Matroska', primary: true },
  ts: { kind: 'video', container: 'MPEG-TS', primary: true },
  mts: { kind: 'video', container: 'MPEG-TS', primary: true },
  m2ts: { kind: 'video', container: 'MPEG-TS', primary: true },
  avi: { kind: 'video', container: 'AVI', primary: false },
  flv: { kind: 'video', container: 'FLV', primary: false },
  wmv: { kind: 'video', container: 'ASF/WMV', primary: false },
  '3gp': { kind: 'video', container: '3GP', primary: true },
  ogv: { kind: 'video', container: 'Ogg', primary: true },
  mp3: { kind: 'audio', container: 'MP3', primary: true },
  wav: { kind: 'audio', container: 'WAVE', primary: true },
  m4a: { kind: 'audio', container: 'MP4', primary: true },
  aac: { kind: 'audio', container: 'ADTS', primary: true },
  ogg: { kind: 'audio', container: 'Ogg', primary: true },
  oga: { kind: 'audio', container: 'Ogg', primary: true },
  opus: { kind: 'audio', container: 'Ogg', primary: true },
  flac: { kind: 'audio', container: 'FLAC', primary: true },
  weba: { kind: 'audio', container: 'WebM', primary: true },
  png: { kind: 'image', container: 'PNG', primary: false },
  jpg: { kind: 'image', container: 'JPEG', primary: false },
  jpeg: { kind: 'image', container: 'JPEG', primary: false },
  webp: { kind: 'image', container: 'WebP', primary: false },
  gif: { kind: 'image', container: 'GIF', primary: false },
  avif: { kind: 'image', container: 'AVIF', primary: false },
  bmp: { kind: 'image', container: 'BMP', primary: false },
  svg: { kind: 'image', container: 'SVG', primary: false },
  srt: { kind: 'subtitle', container: 'SubRip', primary: false },
  vtt: { kind: 'subtitle', container: 'WebVTT', primary: false },
};

export function extensionOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

/** Magic-byte sniffing on the first bytes of a file. */
export function sniff(bytes: Uint8Array): { kind: MediaKind; container: string; primary: boolean } | null {
  const ascii = (start: number, len: number) => String.fromCharCode(...bytes.subarray(start, start + len));
  const startsWith = (sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b);

  if (bytes.length >= 12 && ascii(4, 4) === 'ftyp') {
    const brand = ascii(8, 4);
    if (brand === 'qt  ') return { kind: 'video', container: 'QuickTime', primary: true };
    if (brand.startsWith('M4A') || brand.startsWith('M4B')) return { kind: 'audio', container: 'MP4', primary: true };
    if (brand === 'avif' || brand === 'avis') return { kind: 'image', container: 'AVIF', primary: false };
    if (brand === 'heic' || brand === 'heix' || brand === 'mif1') return { kind: 'image', container: 'HEIF', primary: false };
    return { kind: 'video', container: 'MP4', primary: true };
  }
  if (bytes.length >= 8 && (ascii(4, 4) === 'moov' || ascii(4, 4) === 'mdat' || ascii(4, 4) === 'wide'))
    return { kind: 'video', container: 'QuickTime', primary: true };
  if (startsWith([0x1a, 0x45, 0xdf, 0xa3])) {
    const head = ascii(0, Math.min(bytes.length, 64));
    return head.includes('webm')
      ? { kind: 'video', container: 'WebM', primary: true }
      : { kind: 'video', container: 'Matroska', primary: true };
  }
  if (ascii(0, 4) === 'RIFF') {
    const sub = ascii(8, 4);
    if (sub === 'WAVE') return { kind: 'audio', container: 'WAVE', primary: true };
    if (sub === 'AVI ') return { kind: 'video', container: 'AVI', primary: false };
    if (sub === 'WEBP') return { kind: 'image', container: 'WebP', primary: false };
  }
  if (ascii(0, 4) === 'OggS') return { kind: 'audio', container: 'Ogg', primary: true };
  if (ascii(0, 4) === 'fLaC') return { kind: 'audio', container: 'FLAC', primary: true };
  if (ascii(0, 3) === 'ID3' || (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0 && ((bytes[1] ?? 0) & 0x06) !== 0))
    return { kind: 'audio', container: 'MP3', primary: true };
  if (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xf6) === 0xf0) return { kind: 'audio', container: 'ADTS', primary: true };
  if (bytes[0] === 0x47 && bytes[188] === 0x47) return { kind: 'video', container: 'MPEG-TS', primary: true };
  if (ascii(0, 3) === 'FLV') return { kind: 'video', container: 'FLV', primary: false };
  if (startsWith([0x30, 0x26, 0xb2, 0x75])) return { kind: 'video', container: 'ASF/WMV', primary: false };
  if (startsWith([0x89, 0x50, 0x4e, 0x47])) return { kind: 'image', container: 'PNG', primary: false };
  if (startsWith([0xff, 0xd8, 0xff])) return { kind: 'image', container: 'JPEG', primary: false };
  if (ascii(0, 4) === 'GIF8') return { kind: 'image', container: 'GIF', primary: false };
  if (ascii(0, 2) === 'BM') return { kind: 'image', container: 'BMP', primary: false };
  return null;
}

export function classifyByName(name: string, mime: string): Classification {
  const ext = extensionOf(name);
  const byExt = EXTENSIONS[ext];
  if (byExt) return { kind: byExt.kind, container: byExt.container, primaryPipeline: byExt.primary };
  if (mime.startsWith('video/')) return { kind: 'video', container: null, primaryPipeline: true };
  if (mime.startsWith('audio/')) return { kind: 'audio', container: null, primaryPipeline: true };
  if (mime.startsWith('image/')) return { kind: 'image', container: null, primaryPipeline: false };
  return { kind: 'unknown', container: null, primaryPipeline: false, reason: 'Unrecognised file type.' };
}

/** Full classification: sniff the header and fall back to name/MIME. */
export async function classifyFile(file: Blob & { name: string }): Promise<Classification> {
  const header = new Uint8Array(await file.slice(0, 512).arrayBuffer());
  const sniffed = sniff(header);
  const byName = classifyByName(file.name, file.type);
  if (sniffed) {
    // An MP4/WebM container holding only audio is still reported as "video" by sniffing;
    // trust the extension/MIME to say audio (the probe will confirm from tracks).
    const kind = sniffed.kind === 'video' && byName.kind === 'audio' ? 'audio' : sniffed.kind;
    return { kind, container: sniffed.container, primaryPipeline: sniffed.primary };
  }
  if (byName.kind === 'image' && extensionOf(file.name) === 'svg') return byName;
  if (byName.kind === 'subtitle') return byName;
  if (header.length === 0) return { kind: 'unknown', container: null, primaryPipeline: false, reason: 'The file is empty.' };
  return byName;
}

export const ACCEPT_ATTRIBUTE = [
  'video/*',
  'audio/*',
  'image/*',
  ...Object.keys(EXTENSIONS).map((e) => `.${e}`),
].join(',');
