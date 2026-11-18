import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/primitives';
import { BRAND } from '@/config/brand';
import { mediaEngine, type BenchResult } from '@/media-engine';
import { ErrorBox, JobProgress } from '@/tools/shared/ToolParts';
import { useMediaJob } from '@/tools/shared/useMediaJob';
import { setPageMeta } from '@/utils/meta';

const PRESETS: [string, number, number][] = [
  ['720p', 1280, 720],
  ['1080p', 1920, 1080],
  ['4K', 3840, 2160],
];

/** Measures this device: encode, decode and two-layer export speed, plus memory where exposed. */
export default function BenchmarkPage() {
  const job = useMediaJob<BenchResult>();
  const [preset, setPreset] = useState('1080p');
  const [memory, setMemory] = useState<string | null>(null);
  useEffect(() => {
    return setPageMeta(`Device benchmark · ${BRAND.name}`, 'Measure how fast your device encodes, decodes and exports video in the browser.');
  }, []);
  const [, w, h] = PRESETS.find((p) => p[0] === preset)!;
  const r = job.state.status === 'done' ? job.state.result : null;

  const measureMemory = async () => {
    const perf = performance as Performance & { measureUserAgentSpecificMemory?: () => Promise<{ bytes: number }> };
    if (!perf.measureUserAgentSpecificMemory || !crossOriginIsolated) return setMemory('Not exposed by this browser.');
    try {
      const m = await perf.measureUserAgentSpecificMemory();
      setMemory(`${(m.bytes / 1024 / 1024).toFixed(0)} MB (this page and its workers)`);
    } catch {
      setMemory('Not exposed by this browser.');
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Device benchmark</h1>
      <p className="text-sm text-muted">
        Measures how fast this browser and device encode, decode and export video with {BRAND.name}. Everything runs locally on a generated test clip;
        nothing is uploaded. Results vary with hardware acceleration, power settings and other tabs.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm">
          Resolution{' '}
          <select value={preset} onChange={(e) => setPreset(e.target.value)} className="ml-1 h-8 rounded-md border border-line bg-surface-2 px-2" aria-label="Benchmark resolution">
            {PRESETS.map(([l]) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
        {job.state.status !== 'running' && (
          <Button variant="primary" onClick={() => (setMemory(null), job.run(() => mediaEngine.benchmark({ width: w, height: h, seconds: 3, fps: 30 })))}>
            Run benchmark
          </Button>
        )}
      </div>
      <JobProgress state={job.state} onCancel={job.cancel} label="Benchmarking" />
      {job.state.status === 'error' && <ErrorBox error={job.state.error} />}
      {r && (
        <div className="space-y-3">
          <table className="w-full text-sm" aria-label="Benchmark results">
            <tbody className="divide-y divide-line">
              {(
                [
                  ['Codec', r.codec],
                  ['Test clip', `${r.width}×${r.height}, ${r.frames} frames at 30 fps`],
                  ['Encode', `${r.encodeFps} fps`],
                  ['Decode', `${r.decodeFps} fps`],
                  ['Two-layer export (decode + composite + encode)', `${r.renderFps} fps (${r.renderSeconds} s)`],
                  ['Logical CPU cores', String(r.hardwareConcurrency)],
                ] as const
              ).map(([k, v]) => (
                <tr key={k}>
                  <td className="py-1.5 pr-4 text-muted">{k}</td>
                  <td className="py-1.5 font-mono tabular" data-metric={k}>
                    {v}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-sm text-muted">
            {r.renderFps >= 30
              ? 'This device exports faster than real time at this resolution.'
              : `Exports at this resolution take about ${(30 / Math.max(0.1, r.renderFps)).toFixed(1)}× the video length.`}
          </p>
          <div className="flex items-center gap-3 text-sm">
            <Button size="sm" onClick={() => void measureMemory()}>
              Measure memory
            </Button>
            {memory && <span className="text-muted">{memory}</span>}
            <Button size="sm" variant="ghost" onClick={() => void navigator.clipboard?.writeText(JSON.stringify({ ...r, userAgent: navigator.userAgent }, null, 2))}>
              Copy results as JSON
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
