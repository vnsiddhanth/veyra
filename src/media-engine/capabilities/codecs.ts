/**
 * Async codec probe. Mediabunny is imported dynamically so pages that never touch
 * media don't download it.
 */
export interface CodecCapabilities {
  decodeVideo: string[];
  encodeVideo: string[];
  decodeAudio: string[];
  encodeAudio: string[];
  /** Resolution the encoders were tested at. */
  testedAt: { width: number; height: number };
}

let pending: Promise<CodecCapabilities> | null = null;

export function probeCodecs(): Promise<CodecCapabilities> {
  if (pending) return pending;
  pending = (async () => {
    const mb = await import('mediabunny');
    const width = 1920;
    const height = 1080;
    const safe = async <T,>(fn: () => Promise<T>, fallback: T) => {
      try {
        return await fn();
      } catch {
        return fallback;
      }
    };
    const [decodeVideo, encodeVideo, decodeAudio, encodeAudio] = await Promise.all([
      safe(() => mb.getDecodableVideoCodecs(), []),
      safe(() => mb.getEncodableVideoCodecs(undefined, { width, height }), []),
      safe(() => mb.getDecodableAudioCodecs(), []),
      safe(() => mb.getEncodableAudioCodecs(), []),
    ]);
    return {
      decodeVideo: [...decodeVideo],
      encodeVideo: [...encodeVideo],
      decodeAudio: [...decodeAudio],
      encodeAudio: [...encodeAudio],
      testedAt: { width, height },
    };
  })();
  return pending;
}

export const VIDEO_CODEC_LABELS: Record<string, string> = {
  avc: 'H.264 / AVC',
  hevc: 'H.265 / HEVC',
  vp8: 'VP8',
  vp9: 'VP9',
  av1: 'AV1',
  prores: 'Apple ProRes',
};

export const AUDIO_CODEC_LABELS: Record<string, string> = {
  aac: 'AAC',
  opus: 'Opus',
  mp3: 'MP3',
  vorbis: 'Vorbis',
  flac: 'FLAC',
  ac3: 'AC-3',
  eac3: 'E-AC-3',
  'pcm-s16': 'PCM 16-bit',
  'pcm-s24': 'PCM 24-bit',
  'pcm-f32': 'PCM 32-bit float',
  ulaw: 'μ-law',
  alaw: 'A-law',
};

export function codecLabel(codec: string | null | undefined): string {
  if (!codec) return 'Unknown';
  return VIDEO_CODEC_LABELS[codec] ?? AUDIO_CODEC_LABELS[codec] ?? codec;
}
