import { useCallback, useEffect, useState } from 'react';
import { mediaEngine, MediaError, type MediaInfo } from '@/media-engine';

export type SourceState =
  | { status: 'empty' }
  | { status: 'probing'; file: File }
  | { status: 'ready'; file: File; url: string; info: MediaInfo }
  | { status: 'error'; file: File; error: MediaError };

/** Holds the tool's input file: probes it, owns its object URL, and cancels work on replacement. */
export function useSource(requireVideo: boolean | 'audio' = true) {
  const [state, setState] = useState<SourceState>({ status: 'empty' });

  const open = useCallback(
    (file: File) => {
      setState({ status: 'probing', file });
      mediaEngine.probe(file).result.then(
        ({ info }) => {
          if (requireVideo === 'audio') {
            if (info.audio.length === 0) setState({ status: 'error', file, error: new MediaError('no-tracks', 'This file has no audio track.') });
            else if (!info.audio[0]!.decodable)
              setState({ status: 'error', file, error: new MediaError('unsupported-codec', `Your browser cannot decode this file’s ${info.audio[0]!.codec ?? ''} audio.`) });
            else setState({ status: 'ready', file, url: URL.createObjectURL(file), info });
          } else if (requireVideo && info.video.length === 0) {
            setState({ status: 'error', file, error: new MediaError('no-tracks', 'This file has no video track. Choose a video file.') });
          } else if (requireVideo && !info.video[0]!.decodable) {
            setState({
              status: 'error',
              file,
              error: new MediaError('unsupported-codec', `Your browser cannot decode this file’s ${info.video[0]!.codec ?? ''} video. Try Chrome or Edge, or convert it first.`),
            });
          } else {
            setState({ status: 'ready', file, url: URL.createObjectURL(file), info });
          }
        },
        (e) => setState({ status: 'error', file, error: MediaError.from(e) }),
      );
    },
    [requireVideo],
  );

  const clear = useCallback(() => setState({ status: 'empty' }), []);

  useEffect(() => {
    if (state.status !== 'ready') return;
    const url = state.url;
    return () => URL.revokeObjectURL(url);
  }, [state]);

  return { source: state, open, clear };
}
