import type { MediaInfo } from '@/media-engine/core/types';
import { createProject } from '@/project/schema/factory';
import type { Asset, Project } from '@/project/schema/types';

export function videoInfo(duration: number, width = 1920, height = 1080, fps = 30): MediaInfo {
  return {
    kind: 'video',
    container: 'MP4',
    mimeType: 'video/mp4',
    size: 1_000_000,
    duration,
    durationSource: 'metadata',
    bitrate: 8_000_000,
    video: [
      {
        id: 1,
        codec: 'avc',
        codecString: 'avc1.640028',
        codedWidth: width,
        codedHeight: height,
        displayWidth: width,
        displayHeight: height,
        rotation: 0,
        pixelAspectRatio: { num: 1, den: 1 },
        frameRate: { bestGuess: fps, average: fps, min: fps, max: fps, isConstant: true },
        bitrate: 7_800_000,
        hdr: false,
        canBeTransparent: false,
        decodable: true,
        languageCode: 'und',
        name: null,
        duration,
      },
    ],
    audio: [],
    width,
    height,
    tags: {},
    warnings: [],
  };
}

export function makeAsset(id: string, kind: Asset['kind'], duration = 10): Asset {
  let info: MediaInfo | null;
  if (kind === 'image') info = { ...videoInfo(0), kind: 'image', video: [], duration: 0, durationSource: 'none' };
  else if (kind === 'subtitle') info = null;
  else info = { ...videoInfo(duration), kind };
  return {
    id,
    kind,
    name: id,
    fileName: `${id}.mp4`,
    size: 1000,
    lastModified: 0,
    fingerprint: `fp_${id}`,
    mimeType: 'video/mp4',
    info,
    subtitles: kind === 'subtitle' ? [{ start: 0, end: 1, text: 'hi' }] : null,
    folderId: null,
    addedAt: 0,
  };
}

/** A 30 fps project with a 10 s video asset, a 4 s audio asset and an image. */
export function makeProject(): Project {
  const p = createProject('Test');
  return { ...p, assets: [makeAsset('vid', 'video', 10), makeAsset('aud', 'audio', 4), makeAsset('img', 'image')] };
}

export const trackId = (p: Project, name: string): string => p.tracks.find((t) => t.name === name)!.id;
