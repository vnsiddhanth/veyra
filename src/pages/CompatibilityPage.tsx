import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/primitives';
import { AUDIO_CODEC_LABELS, VIDEO_CODEC_LABELS, probeCodecs, type CodecCapabilities } from '@/media-engine/capabilities/codecs';
import { CAPABILITY_ROWS, detectApis } from '@/media-engine/capabilities/detect';
import { storageEstimate } from '@/storage/media-store';
import { formatBytes } from '@/utils/format';

const VIDEO = ['avc', 'hevc', 'vp8', 'vp9', 'av1'];
const AUDIO = ['aac', 'opus', 'mp3', 'vorbis', 'flac', 'pcm-s16'];

function Yes({ ok, children }: { ok: boolean; children?: string }) {
  return <Badge tone={ok ? 'ok' : 'neutral'}>{children ?? (ok ? 'Yes' : 'No')}</Badge>;
}

export default function CompatibilityPage() {
  const apis = detectApis();
  const [codecs, setCodecs] = useState<CodecCapabilities | null>(null);
  const [codecError, setCodecError] = useState<string | null>(null);
  const [storage, setStorage] = useState<Awaited<ReturnType<typeof storageEstimate>>>(null);

  useEffect(() => {
    document.title = 'Browser compatibility — Veyra';
    probeCodecs().then(setCodecs, (e: Error) => setCodecError(e.message));
    void storageEstimate().then(setStorage);
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Your browser’s capabilities</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Detected live in this browser, on this device. Features that need a missing capability use a fallback or are switched off with an
        explanation. Nothing here is sent anywhere.
      </p>

      <section className="mt-8">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-faint">Platform APIs</h2>
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-faint">
              <tr className="border-b border-line">
                <th className="px-3 py-2 font-medium">Capability</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="hidden px-3 py-2 font-medium sm:table-cell">Used for</th>
                <th className="hidden px-3 py-2 font-medium md:table-cell">Fallback</th>
              </tr>
            </thead>
            <tbody>
              {CAPABILITY_ROWS.map((row) => (
                <tr key={row.key} className="border-b border-line last:border-0">
                  <td className="px-3 py-2">{row.label}</td>
                  <td className="px-3 py-2">
                    <Yes ok={Boolean(apis[row.key])} />
                  </td>
                  <td className="hidden px-3 py-2 text-muted sm:table-cell">{row.usedFor}</td>
                  <td className="hidden px-3 py-2 text-muted md:table-cell">{row.fallback}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">
          {apis.hardwareConcurrency} logical CPU cores
          {apis.deviceMemoryGb != null && ` · ~${apis.deviceMemoryGb} GB memory reported`}
          {storage && ` · storage used ${formatBytes(storage.usage)} of ${formatBytes(storage.quota)} available to this site${storage.persisted ? ' (persistent)' : ''}`}
        </p>
      </section>

      <section className="mt-8 grid gap-6 md:grid-cols-2">
        {(
          [
            ['Video codecs', VIDEO, VIDEO_CODEC_LABELS, 'decodeVideo', 'encodeVideo'],
            ['Audio codecs', AUDIO, AUDIO_CODEC_LABELS, 'decodeAudio', 'encodeAudio'],
          ] as const
        ).map(([title, list, labels, dec, enc]) => (
          <div key={title}>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-faint">{title}</h2>
            <div className="rounded-lg border border-line bg-surface">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-faint">
                  <tr className="border-b border-line">
                    <th className="px-3 py-2 font-medium">Codec</th>
                    <th className="px-3 py-2 font-medium">Decode</th>
                    <th className="px-3 py-2 font-medium">Encode{title === 'Video codecs' ? ' (1080p)' : ''}</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((c) => (
                    <tr key={c} className="border-b border-line last:border-0">
                      <td className="px-3 py-2">{labels[c] ?? c}</td>
                      <td className="px-3 py-2">{codecs ? <Yes ok={codecs[dec].includes(c)} /> : <span className="text-xs text-faint">{codecError ? '—' : 'Checking…'}</span>}</td>
                      <td className="px-3 py-2">{codecs ? <Yes ok={codecs[enc].includes(c)} /> : <span className="text-xs text-faint">{codecError ? '—' : 'Checking…'}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </section>
      {codecError && <p className="mt-3 text-sm text-danger">Codec detection failed: {codecError}</p>}
      <p className="mt-6 text-xs leading-relaxed text-muted">
        Codec support comes from WebCodecs and reflects your browser, operating system and graphics hardware. A codec marked “No” for
        decoding can still be inspected. Converting it will need the compatibility converter, which is planned for a later phase.
      </p>
    </div>
  );
}
