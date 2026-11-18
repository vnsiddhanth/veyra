/**
 * Runtime capability detection. Synchronous checks only look for API presence;
 * codec support needs the async probe in ./codecs.ts.
 */
export interface ApiCapabilities {
  webCodecsVideo: boolean;
  webCodecsAudio: boolean;
  webgl2: boolean;
  webgpu: boolean;
  crossOriginIsolated: boolean;
  sharedArrayBuffer: boolean;
  opfs: boolean;
  fileSystemAccess: boolean;
  fileHandleDragDrop: boolean;
  audioWorklet: boolean;
  offscreenCanvas: boolean;
  persistentStorage: boolean;
  mediaRecorder: boolean;
  workers: boolean;
  hardwareConcurrency: number;
  deviceMemoryGb: number | null;
}

let cached: ApiCapabilities | null = null;

function hasWebGL2(): boolean {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    const ok = !!gl;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return ok;
  } catch {
    return false;
  }
}

export function detectApis(): ApiCapabilities {
  if (cached) return cached;
  const g = globalThis as typeof globalThis & Record<string, unknown>;
  const nav = navigator as Navigator & { deviceMemory?: number; gpu?: unknown };
  cached = {
    webCodecsVideo: 'VideoDecoder' in g && 'VideoEncoder' in g && 'VideoFrame' in g,
    webCodecsAudio: 'AudioDecoder' in g && 'AudioEncoder' in g,
    webgl2: hasWebGL2(),
    webgpu: !!nav.gpu,
    crossOriginIsolated: g.crossOriginIsolated === true,
    sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
    opfs: !!navigator.storage && 'getDirectory' in navigator.storage,
    fileSystemAccess: 'showOpenFilePicker' in g && 'showSaveFilePicker' in g,
    fileHandleDragDrop: typeof DataTransferItem !== 'undefined' && 'getAsFileSystemHandle' in DataTransferItem.prototype,
    audioWorklet: typeof AudioWorkletNode !== 'undefined',
    offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
    persistentStorage: !!navigator.storage && 'persist' in navigator.storage,
    mediaRecorder: typeof MediaRecorder !== 'undefined',
    workers: typeof Worker !== 'undefined',
    hardwareConcurrency: navigator.hardwareConcurrency || 1,
    deviceMemoryGb: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
  };
  return cached;
}

export interface CapabilityRow {
  key: keyof ApiCapabilities;
  label: string;
  usedFor: string;
  fallback: string;
}

export const CAPABILITY_ROWS: CapabilityRow[] = [
  { key: 'webCodecsVideo', label: 'WebCodecs (video)', usedFor: 'Hardware-accelerated decode and encode', fallback: 'FFmpeg.wasm (slower, planned)' },
  { key: 'webCodecsAudio', label: 'WebCodecs (audio)', usedFor: 'Audio decode and encode', fallback: 'Web Audio decode + WASM encoders (planned)' },
  { key: 'webgl2', label: 'WebGL2', usedFor: 'GPU compositing, effects, color', fallback: 'Canvas 2D with reduced effects' },
  { key: 'webgpu', label: 'WebGPU', usedFor: 'Faster effects (future)', fallback: 'WebGL2' },
  { key: 'crossOriginIsolated', label: 'Cross-origin isolation', usedFor: 'SharedArrayBuffer, multi-threaded WASM', fallback: 'Single-threaded WASM' },
  { key: 'opfs', label: 'Origin Private File System', usedFor: 'Proxies, caches, large scratch files', fallback: 'IndexedDB / memory' },
  { key: 'fileSystemAccess', label: 'File System Access', usedFor: 'Reconnect media after reload, save exports to disk', fallback: 'Relink by picking files; download link' },
  { key: 'audioWorklet', label: 'AudioWorklet', usedFor: 'Real-time audio mixing and metering', fallback: 'Web Audio nodes only' },
  { key: 'offscreenCanvas', label: 'OffscreenCanvas', usedFor: 'Rendering inside workers', fallback: 'Main-thread canvas' },
  { key: 'persistentStorage', label: 'Persistent storage', usedFor: 'Protect projects from eviction', fallback: 'Best-effort storage' },
  { key: 'mediaRecorder', label: 'MediaRecorder', usedFor: 'Voice-over recording', fallback: '—' },
];
