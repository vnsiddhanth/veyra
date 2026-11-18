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
| `extractFrame(file, opts)` | Implemented | worker | `CanvasSink.getCanvas` → PNG/JPEG/WebP. Rejects silent PNG fallback |
| `waveform(file, pps)` | Implemented | worker | `AudioSampleSink` streamed → 0–255 peak per bucket (default 50/s), transferred |
| `convert(file, opts)` | Implemented | worker | Mediabunny `Conversion`: trim, resize, crop, rotate, flip, fps, codec, bitrate, container. Writes to OPFS. Output re-validated |
| `releaseOutput(result)` | Implemented | main | Deletes the OPFS scratch file of a dismissed result |
| `render(input)` | Implemented | worker | `src/render`: compositor (Canvas 2D + WebGL2) → `CanvasSource`, mixer → `AudioSampleSource`, OPFS, validated |
| `gif(file, opts)` / `gifFromImages` | Implemented | worker | `CanvasSink` → gifenc (PnnQuant palette per frame), checked with `ImageDecoder` |
| `frames(file, opts)` | Implemented | worker | `CanvasSink` → images → streaming stored ZIP (OPFS), CRC-checked |
| FFmpeg fallback | Not shipped (decision in DEVELOPMENT_ROADMAP.md) | — | — |

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

## Conversion details (`encode/convert.ts`)

- **Copy policy** (`ConvertOptions.copy`):
  - `accurate` (default) uses `copy: { mode: 'preferred', boundaryTolerance: 0 }`. Encoded media is reused only when the cut is exact; otherwise the track is re-encoded.
  - `fast` uses `boundaryPolicy: 'expand'`. It never re-encodes for a trim.
  - `never` forces a full transcode.
  - With MP4/MOV, Mediabunny keeps fast trims frame-exact by using an edit list over the preceding key frame. This is verified pixel-for-pixel in `e2e/trim.spec.ts`.
- **Output target.** A writable OPFS stream (`outputs/out_<job>__<name>.<ext>`) is used where the browser supports it. Mediabunny's `{type:'write', data, position}` chunks are the same shape `FileSystemWritableFileStream.write` accepts. The fallback is `BufferTarget` (memory). Partial files are deleted on cancel or failure. Results are deleted when dismissed. Anything older than 24 h is swept when the worker starts.
- **Validation (`validateOutput`).** The output is re-probed. Then the track presence, duration (±1 frame + 50 ms codec padding), requested size and codecs are checked. Finally the first and last video frames and the first audio sample must decode. Any failure means no output is returned. A much-too-short output is reported as damaged source input.
- **Dropped tracks.** If the conversion cannot keep a video or audio track the user did not discard (no encoder, uncopyable codec), the job fails with the reason. It never silently drops audio.

## Known limitations (honest)

- AVI/FLV/WMV containers are not demuxed by Mediabunny. They are detected and reported. Editing them needs the
  FFmpeg fallback, which is not shipped (see the decision in DEVELOPMENT_ROADMAP.md).
- MP3 encoding is not provided by WebCodecs in Chromium. The worker registers `@mediabunny/mp3-encoder` (LAME in WASM) when no native encoder exists.
- HEVC decode depends on OS/GPU support. ProRes decode is generally unavailable in browsers.
- Duration from metadata can be missing for some WebM recordings. In that case it is computed from packets, which costs one index pass.
