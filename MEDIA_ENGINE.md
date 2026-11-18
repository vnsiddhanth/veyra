# Media Engine

The media engine is the foundation. Everything the UI does to media goes through `src/media-engine`.

## Public contract (main thread)

```ts
import { mediaEngine } from '@/media-engine';

const job = mediaEngine.probe(file);          // Job<MediaInfo>
job.onProgress((p) => …);                     // 0..1, real progress only
const info = await job.result;                // rejects with MediaError on failure
job.cancel();                                 // rejects result with MediaError('cancelled')
```

Every operation returns a `Job<T>` (`src/media-engine/core/job.ts`). Operations:

| Operation | Status | Runs in | Implementation |
|---|---|---|---|
| `classifyFile(file)` | Implemented | main (cheap) | Extension + MIME + magic bytes (first 64 bytes) |
| `probe(file)` | Implemented | worker | Mediabunny `Input` → `MediaInfo` |
| `probeImage(file)` | Implemented | main | `createImageBitmap` (raster) / `<img>` (SVG, script-inert) |
| `thumbnails(file, {count,width})` | Implemented | worker | Mediabunny `CanvasSink` → `OffscreenCanvas.convertToBlob` (JPEG) |
| `waveform(file)` | Phase 2 | worker | `AudioSampleSink` → peak pyramid (min/max per 256 samples) |
| `convert(file, opts)` | Phase 2 | worker | Mediabunny `Conversion` (trim, resize, crop, rotate, fps, codec, bitrate) |
| `renderTimeline(project)` | Phase 7 | export worker | Compositor + encoders + muxer |
| FFmpeg fallback | Phase 2–3 | dedicated worker | `@ffmpeg/ffmpeg`, lazy |

## MediaInfo

`src/media-engine/core/types.ts`. Probing reports: container (format name + MIME), duration (from metadata, then computed
from packets as a fallback), size, overall bitrate, and per track:

- **video**: codec, codec string, coded and display size, rotation, pixel aspect, frame rate (best guess +
  min/max + constant flag from `computeFrameRateMetrics`), bitrate, HDR flag, alpha possibility,
  `decodable` (WebCodecs check in this browser)
- **audio**: codec, codec string, channels, sample rate, bitrate, `decodable`
- tags: title/artist/comment/date

`decodable === false` is surfaced in the UI (the file can be inspected but needs the FFmpeg fallback to edit).

## Worker architecture

- `workers/protocol.ts`: discriminated-union request/response types. Shared by both sides, so it is type-checked.
- `workers/pool.ts`: lazily spawns up to `min(navigator.hardwareConcurrency - 1, 4)` module workers. It has a FIFO
  queue with two priorities, tracks jobs per worker, cancels by message, and replaces a worker after an `error` event.
- `workers/media.worker.ts`: runs the handlers. Each job gets an `AbortController`. Handlers check
  `signal.aborted` between async steps and dispose the Mediabunny `Input` in `finally`.
- `File` objects are posted by structured clone. This copies a *reference* to the on-disk blob, not the bytes.
  Mediabunny's `BlobSource` reads byte ranges lazily, so a 10 GB file is never loaded into memory.

## Resource rules

1. Every `VideoFrame`, `AudioData`, `VideoSample` and `AudioSample` is closed in a `finally`.
2. Decoder queues are bounded. Producers await `decodeQueueSize < N` (backpressure).
3. `Input`s are disposed after each job. Long-lived inputs (timeline playback) are owned by a session object
   with explicit `dispose()`.
4. Thumbnails are generated at ≤ 160 px width with a 2-canvas pool, then encoded to JPEG at quality 0.7.

## Capability detection

`capabilities/detect.ts` reports, synchronously, on API presence (WebCodecs classes, WebGL2, WebGPU,
`crossOriginIsolated`/SAB, OPFS, File System Access pickers, AudioWorklet, `storage.persist`).
`capabilities/codecs.ts` runs an asynchronous probe through Mediabunny `getEncodableVideoCodecs` /
`getDecodableVideoCodecs` / audio equivalents at 1920×1080. The result is cached for the session.
`/compatibility` renders the full matrix.

## Known limitations (honest)

- AVI/FLV/WMV/3GP containers are not demuxed by Mediabunny. They are detected and reported. Editing them needs the
  FFmpeg fallback (Phase 2–3).
- HEVC decode depends on OS/GPU support. ProRes decode is generally unavailable in browsers.
- Duration from metadata can be missing for some WebM recordings. In that case it is computed from packets, which costs one index pass.
