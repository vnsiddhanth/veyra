import { useCallback, useEffect, useRef, useState } from 'react';
import { mediaEngine, MediaError, type MediaInfo } from '@/media-engine';
import { SelectField } from '../shared/controls';

export type RenderContainer = 'mp4' | 'webm';

export function RenderFormatField({ value, onChange }: { value: RenderContainer; onChange(v: RenderContainer): void }) {
  return (
    <SelectField
      label="Output format"
      value={value}
      onChange={onChange}
      options={[
        ['mp4', 'MP4 (H.264 / AAC where available)'],
        ['webm', 'WebM (VP9 / Opus)'],
      ]}
    />
  );
}

export interface ProbedFile {
  id: string;
  file: File;
  status: 'probing' | 'ready' | 'error';
  info?: MediaInfo;
  error?: string;
  url?: string;
}

let seq = 0;

/** A list of user files, each probed in a worker; failures stay in the list with their reason. */
export function useProbedFiles(require: 'video' | 'audio' | 'image' | 'any' = 'any') {
  const [items, setItems] = useState<ProbedFile[]>([]);
  const urls = useRef(new Set<string>());

  const add = useCallback(
    (files: File[]) => {
      for (const file of files) {
        const id = `f${++seq}`;
        setItems((xs) => [...xs, { id, file, status: 'probing' }]);
        mediaEngine.probe(file).result.then(
          ({ info }) => {
            let error: string | undefined;
            if (require === 'video' && (info.video.length === 0 || !info.video[0]!.decodable)) error = info.video.length ? 'Video codec not decodable here' : 'No video track';
            if (require === 'audio' && (info.audio.length === 0 || !info.audio[0]!.decodable)) error = info.audio.length ? 'Audio codec not decodable here' : 'No audio track';
            if (require === 'image' && info.kind !== 'image') error = 'Not an image';
            const url = error ? undefined : URL.createObjectURL(file);
            if (url) urls.current.add(url);
            setItems((xs) => xs.map((x) => (x.id === id ? { ...x, status: error ? 'error' : 'ready', info, error, url } : x)));
          },
          (e) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, status: 'error', error: MediaError.from(e).message } : x))),
        );
      }
    },
    [require],
  );
  const remove = (id: string) =>
    setItems((xs) => {
      const it = xs.find((x) => x.id === id);
      if (it?.url) {
        URL.revokeObjectURL(it.url);
        urls.current.delete(it.url);
      }
      return xs.filter((x) => x.id !== id);
    });
  const move = (id: string, dir: -1 | 1) =>
    setItems((xs) => {
      const i = xs.findIndex((x) => x.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= xs.length) return xs;
      const next = [...xs];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  const clear = () => {
    for (const u of urls.current) URL.revokeObjectURL(u);
    urls.current.clear();
    setItems([]);
  };
  useEffect(
    () => () => {
      for (const u of urls.current) URL.revokeObjectURL(u);
    },
    [],
  );
  return { items, add, remove, move, clear, ready: items.filter((x) => x.status === 'ready') };
}

/** Decode images to bitmaps for the live preview (closed when replaced). */
export function useBitmaps(files: ReadonlyMap<string, Blob>): Map<string, ImageBitmap> {
  const [maps, setMaps] = useState(new Map<string, ImageBitmap>());
  useEffect(() => {
    let alive = true;
    const out = new Map<string, ImageBitmap>();
    void Promise.all(
      [...files].map(async ([id, f]) => {
        try {
          out.set(id, await createImageBitmap(f));
        } catch {
          /* undecodable images are reported by the renderer */
        }
      }),
    ).then(() => {
      if (alive) setMaps(out);
      else out.forEach((b) => b.close());
    });
    return () => {
      alive = false;
    };
  }, [files]);
  return maps;
}
