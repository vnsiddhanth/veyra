/**
 * Dev-only fixture generator. Produces deterministic test media in-browser with Mediabunny:
 * every frame shows its frame number and timestamp, and the audio is a sine tone that changes
 * pitch each second. This makes trim boundaries and A/V sync checkable by eye and by code.
 */
import { useState } from 'react';
import { Button, Progress } from '@/components/ui/primitives';

interface FixtureSpec {
  name: string;
  width: number;
  height: number;
  fps: number;
  seconds: number;
  audio: boolean;
  container: 'mp4' | 'webm';
}

const SPECS: FixtureSpec[] = [
  { name: 'counter-720p30-5s.mp4', width: 1280, height: 720, fps: 30, seconds: 5, audio: true, container: 'mp4' },
  { name: 'counter-1080p60-3s.mp4', width: 1920, height: 1080, fps: 60, seconds: 3, audio: true, container: 'mp4' },
  { name: 'counter-vertical-1080x1920-25fps-4s.mp4', width: 1080, height: 1920, fps: 25, seconds: 4, audio: false, container: 'mp4' },
  { name: 'counter-480p24-6s.webm', width: 854, height: 480, fps: 24, seconds: 6, audio: true, container: 'webm' },
];

async function generate(spec: FixtureSpec, onProgress: (p: number) => void): Promise<Blob> {
  const mb = await import('mediabunny');
  const format = spec.container === 'mp4' ? new mb.Mp4OutputFormat({ fastStart: 'in-memory' }) : new mb.WebMOutputFormat();
  const output = new mb.Output({ format, target: new mb.BufferTarget() });
  const videoCodec = spec.container === 'mp4' ? 'avc' : 'vp9';
  const audioCodec = spec.container === 'mp4' ? 'aac' : 'opus';
  const canvas = new OffscreenCanvas(spec.width, spec.height);
  const ctx = canvas.getContext('2d')!;
  const video = new mb.CanvasSource(canvas, { codec: videoCodec, bitrate: mb.QUALITY_MEDIUM, keyFrameInterval: 1 });
  output.addVideoTrack(video, { frameRate: spec.fps });
  let audio: InstanceType<typeof mb.AudioBufferSource> | null = null;
  if (spec.audio && (await mb.canEncodeAudio(audioCodec))) {
    audio = new mb.AudioBufferSource({ codec: audioCodec, bitrate: 128_000 });
    output.addAudioTrack(audio);
  }
  await output.start();
  const total = spec.fps * spec.seconds;
  for (let i = 0; i < total; i++) {
    const t = i / spec.fps;
    const hue = (i * 360) / total;
    ctx.fillStyle = `hsl(${hue} 45% 22%)`;
    ctx.fillRect(0, 0, spec.width, spec.height);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${Math.round(spec.height / 5)}px monospace`;
    ctx.fillText(String(i), spec.width / 2, spec.height / 2 - spec.height / 12);
    ctx.font = `${Math.round(spec.height / 16)}px monospace`;
    ctx.fillText(`${t.toFixed(3)}s · ${spec.fps}fps`, spec.width / 2, spec.height / 2 + spec.height / 6);
    // Moving bar: makes dropped/duplicated frames visible.
    ctx.fillStyle = '#f5b942';
    ctx.fillRect(((i % spec.fps) / spec.fps) * spec.width, spec.height - 24, spec.width / spec.fps, 24);
    await video.add(t, 1 / spec.fps);
    if (i % 5 === 0) onProgress(i / total);
  }
  video.close();
  if (audio) {
    const rate = 48000;
    const ac = new OfflineAudioContext(2, rate * spec.seconds, rate);
    const buf = ac.createBuffer(2, rate * spec.seconds, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let s = 0; s < data.length; s++) {
        const sec = Math.floor(s / rate);
        const freq = 440 + sec * 110;
        // Short click at each second boundary for sync checks.
        const click = s % rate < 480 ? 0.6 : 0;
        data[s] = 0.2 * Math.sin((2 * Math.PI * freq * s) / rate) + click * (ch === 0 ? 1 : 1);
      }
    }
    await audio.add(buf);
    audio.close();
  }
  await output.finalize();
  onProgress(1);
  const buffer = (output.target as InstanceType<typeof mb.BufferTarget>).buffer!;
  return new Blob([buffer], { type: spec.container === 'mp4' ? 'video/mp4' : 'video/webm' });
}

export default function DevFixturesPage() {
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [links, setLinks] = useState<Record<string, string>>({});

  const run = async (spec: FixtureSpec) => {
    setErrors((e) => ({ ...e, [spec.name]: '' }));
    try {
      const blob = await generate(spec, (p) => setProgress((s) => ({ ...s, [spec.name]: p })));
      setLinks((l) => ({ ...l, [spec.name]: URL.createObjectURL(blob) }));
    } catch (e) {
      setErrors((s) => ({ ...s, [spec.name]: e instanceof Error ? e.message : String(e) }));
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-10">
      <h1 className="text-xl font-semibold">Test fixtures (dev only)</h1>
      <p className="text-sm text-muted">Generated locally with Mediabunny. Each frame shows its index. The audio clicks once per second.</p>
      {SPECS.map((s) => (
        <div key={s.name} className="flex items-center gap-3 rounded-md border border-line bg-surface p-3">
          <span className="flex-1 font-mono text-sm">{s.name}</span>
          {progress[s.name] != null && !links[s.name] && <Progress value={progress[s.name]!} className="w-32" />}
          {errors[s.name] && <span className="text-xs text-danger">{errors[s.name]}</span>}
          {links[s.name] ? (
            <a href={links[s.name]} download={s.name} className="text-sm text-accent underline" data-fixture={s.name}>
              Download
            </a>
          ) : (
            <Button size="sm" onClick={() => void run(s)} data-generate={s.name}>
              Generate
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
