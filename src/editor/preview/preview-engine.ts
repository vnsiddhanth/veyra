/**
 * Main-thread side of the program monitor. Owns the playback clock (an AudioContext, so picture
 * follows sound), schedules the PCM blocks the worker mixes, and asks the worker for the frame that
 * matches the clock. Frames the worker cannot render in time are skipped, never queued.
 */
import type { Project } from '@/project/schema/types';
import type { PreviewIn, PreviewOut } from '@/render/preview.worker';
import { flicksToFrames, framesToFlicks, rateToNumber, type Flicks } from '@/utils/time';
import type { ScopeData } from '@/render/scopes';

export interface PreviewStats {
  /** Frames presented per second during playback. */
  fps: number;
  /** Average worker render time (ms). */
  renderMs: number;
  dropped: number;
}

export class PreviewEngine {
  private readonly worker: Worker;
  private project: Project | null = null;
  private ctx: AudioContext | null = null;
  private seq = 0;
  private lastShownSeq = 0;
  private busy = false;
  private wantFrame: number | null = null;
  private playing = false;
  private startCtx = 0;
  private startSeconds = 0;
  private gen = 0;
  private audioQueued = 0; // seconds of audio scheduled ahead of the clock
  private nodes: AudioBufferSourceNode[] = [];
  private raf = 0;
  private renderTimes: number[] = [];
  private presented: number[] = [];
  private dropped = 0;
  private lastStats = 0;
  private endSeconds = 0;
  private probes = new Map<number, (rgb: number[]) => void>();
  private probeId = 0;
  /** Last read-back failure (tests report it). */
  lastProbeError: string | null = null;
  onTime: (t: Flicks) => void = () => undefined;
  onEnded: () => void = () => undefined;
  onWarnings: (w: string[]) => void = () => undefined;
  onStats: (s: PreviewStats) => void = () => undefined;
  onCrash: (message: string) => void = () => undefined;
  onScopes: (data: ScopeData) => void = () => undefined;

  constructor(canvas: HTMLCanvasElement) {
    this.worker = new Worker(new URL('../../render/preview.worker.ts', import.meta.url), { type: 'module', name: 'preview' });
    const off = canvas.transferControlToOffscreen();
    this.post({ kind: 'init', canvas: off }, [off]);
    this.worker.onmessage = (e: MessageEvent<PreviewOut>) => this.onMessage(e.data);
    // A crashed worker (e.g. GPU/decoder failure, out of memory) cannot be revived with the same
    // transferred canvas; the monitor rebuilds itself with a fresh canvas and worker.
    this.worker.onerror = (e) => {
      e.preventDefault();
      this.stop();
      this.onCrash(e.message || 'The preview stopped unexpectedly.');
    };
  }

  private post(m: PreviewIn, transfer: Transferable[] = []) {
    this.worker.postMessage(m, transfer);
  }

  setProject(p: Project, endSeconds: number) {
    const changed = this.project !== p;
    this.project = p;
    this.endSeconds = endSeconds;
    if (!changed) return;
    this.post({ kind: 'project', project: p });
    if (this.playing) {
      // Re-mix audio from the current position so edits are heard immediately.
      this.startAudio(this.currentSeconds());
    }
  }

  setFiles(files: Record<string, Blob>) {
    this.post({ kind: 'files', files });
  }

  /** Turn video scopes on or off; while on, the worker sends scope data with rendered frames. */
  setScopes(on: boolean) {
    this.post({ kind: 'scopes', on });
  }

  setQuality(scale: number) {
    this.post({ kind: 'quality', scale });
  }

  /** Show the frame at `t` (paused). */
  seek(t: Flicks) {
    if (!this.project) return;
    this.requestFrame(flicksToFrames(t, this.project.settings.frameRate));
  }

  private requestFrame(frame: number) {
    if (this.busy) {
      if (this.wantFrame != null && this.playing) this.dropped++;
      this.wantFrame = frame;
      return;
    }
    this.busy = true;
    this.post({ kind: 'frame', frame, seq: ++this.seq });
  }

  private onMessage(m: PreviewOut) {
    switch (m.kind) {
      case 'rendered': {
        this.busy = false;
        this.lastShownSeq = m.seq;
        this.renderTimes.push(m.ms);
        if (this.renderTimes.length > 30) this.renderTimes.shift();
        if (this.playing) this.presented.push(performance.now());
        if (this.wantFrame != null) {
          const f = this.wantFrame;
          this.wantFrame = null;
          this.requestFrame(f);
        }
        break;
      }
      case 'audio':
        this.scheduleAudio(m);
        break;
      case 'warnings':
        this.onWarnings(m.warnings);
        break;
      case 'scopes':
        this.onScopes(m.data);
        break;
      case 'probe':
        if (m.error) {
          console.warn('[veyra] preview probe failed:', m.error);
          this.lastProbeError = m.error;
        }
        this.probes.get(m.id)?.(m.error ? [-1, -1, -1] : m.rgb);
        this.probes.delete(m.id);
        break;
      case 'error':
        this.busy = false;
        this.onWarnings([m.message]);
        break;
    }
  }

  /** Wall-clock anchor, used when the audio clock is not running (no output device, blocked audio). */
  private startWall = 0;
  private clock: 'audio' | 'wall' = 'audio';
  private clockCheck: { at: number; ctxTime: number } | null = null;

  private currentSeconds(): number {
    if (!this.playing || !this.ctx) return this.startSeconds;
    if (this.clock === 'wall') return this.startSeconds + Math.max(0, (performance.now() - this.startWall) / 1000);
    return this.startSeconds + (this.ctx.currentTime - this.startCtx);
  }

  /**
   * Picture follows the audio clock. If that clock does not advance (no audio device, audio blocked),
   * fall back to the wall clock so playback still runs — silently, and say so.
   */
  private checkClock() {
    if (this.clock === 'wall' || !this.ctx) return;
    const now = performance.now();
    if (!this.clockCheck) {
      this.clockCheck = { at: now, ctxTime: this.ctx.currentTime };
      return;
    }
    if (now - this.clockCheck.at < 500) return;
    if (this.ctx.state !== 'running' || this.ctx.currentTime - this.clockCheck.ctxTime < 0.05) {
      const s = this.currentSeconds();
      this.clock = 'wall';
      this.startSeconds = s;
      this.startWall = now;
      this.onWarnings(['No audio output is available, so playback runs without sound.']);
    } else {
      this.clockCheck = { at: now, ctxTime: this.ctx.currentTime };
    }
  }

  play(from: Flicks) {
    if (!this.project) return;
    this.ctx ??= new AudioContext({ latencyHint: 'interactive' });
    void this.ctx.resume();
    this.playing = true;
    this.presented = [];
    this.dropped = 0;
    this.startSeconds = from / 705_600_000;
    if (this.startSeconds >= this.endSeconds - 1e-3) this.startSeconds = 0;
    this.clock = 'audio';
    this.clockCheck = null;
    this.startWall = performance.now() + 120;
    // A short lead so the first audio block arrives before it is due.
    this.startCtx = this.ctx.currentTime + 0.12;
    this.startAudio(this.startSeconds);
    const tick = () => {
      if (!this.playing || !this.project) return;
      this.checkClock();
      const s = this.currentSeconds();
      if (s >= this.endSeconds) {
        this.stop();
        this.onTime(Math.round(this.endSeconds * 705_600_000));
        this.onEnded();
        return;
      }
      const fps = rateToNumber(this.project.settings.frameRate);
      const frame = Math.max(0, Math.floor(s * fps + 1e-6));
      this.requestFrame(frame);
      this.onTime(framesToFlicks(frame, this.project.settings.frameRate));
      this.topUpAudio();
      const now = performance.now();
      this.presented = this.presented.filter((x) => now - x < 1000);
      // Stats feed React state: 4 updates per second is plenty and keeps playback free of re-renders.
      if (now - this.lastStats >= 250) {
        this.lastStats = now;
        this.onStats({ fps: this.presented.length, renderMs: this.renderTimes.reduce((a, b) => a + b, 0) / Math.max(1, this.renderTimes.length), dropped: this.dropped });
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private startAudio(seconds: number) {
    if (!this.ctx) return;
    for (const n of this.nodes) {
      try {
        n.stop();
      } catch {
        /* already stopped */
      }
    }
    this.nodes = [];
    this.gen++;
    // Re-anchor the clock so audio for `seconds` plays now (+ lead).
    this.startSeconds = seconds;
    this.startCtx = this.ctx.currentTime + 0.12;
    this.startWall = performance.now() + 120;
    this.audioQueued = 0;
    this.post({ kind: 'audio-start', seconds, sampleRate: this.ctx.sampleRate, gen: this.gen });
    this.post({ kind: 'audio-need', gen: this.gen, blocks: 4 });
    this.audioQueued = 1;
  }

  private topUpAudio() {
    if (!this.ctx) return;
    const ahead = this.startSeconds + this.audioQueued - this.currentSeconds();
    if (ahead < 0.75) {
      this.post({ kind: 'audio-need', gen: this.gen, blocks: 2 });
      this.audioQueued += 0.5;
    }
  }

  private scheduleAudio(m: Extract<PreviewOut, { kind: 'audio' }>) {
    if (!this.ctx || m.gen !== this.gen || !this.playing) return;
    const buf = this.ctx.createBuffer(2, m.left.length, m.sampleRate);
    buf.copyToChannel(m.left as Float32Array<ArrayBuffer>, 0);
    buf.copyToChannel(m.right as Float32Array<ArrayBuffer>, 1);
    const node = this.ctx.createBufferSource();
    node.buffer = buf;
    node.connect(this.ctx.destination);
    const when = this.startCtx + (m.t0 - this.startSeconds);
    const late = this.ctx.currentTime - when;
    if (late > 0) {
      // Behind schedule: play the rest of the block now instead of dropping it entirely.
      if (late < buf.duration) node.start(this.ctx.currentTime, late);
      else return;
    } else node.start(when);
    this.nodes.push(node);
    node.onended = () => (this.nodes = this.nodes.filter((n) => n !== node));
  }

  stop() {
    this.playing = false;
    cancelAnimationFrame(this.raf);
    this.post({ kind: 'audio-stop' });
    this.gen++;
    for (const n of this.nodes) {
      try {
        n.stop();
      } catch {
        /* ignore */
      }
    }
    this.nodes = [];
  }

  /** Test hook: average colour at a fractional position of the frame on screen. */
  probe(x: number, y: number): Promise<number[]> {
    return new Promise((resolve) => {
      const id = ++this.probeId;
      this.probes.set(id, resolve);
      this.post({ kind: 'probe', x, y, id });
    });
  }

  /** Resolves once the last requested frame has been drawn. */
  async settled(timeoutMs = 10_000): Promise<void> {
    const end = performance.now() + timeoutMs;
    while ((this.busy || this.wantFrame != null) && performance.now() < end) await new Promise((r) => setTimeout(r, 10));
  }

  get isPlaying() {
    return this.playing;
  }

  get shownSeq() {
    return this.lastShownSeq;
  }

  dispose() {
    this.stop();
    this.worker.terminate();
    void this.ctx?.close();
  }
}
