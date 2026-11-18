# Architecture

Veyra is a free, local-first video editor and set of video tools that run in the browser.
This document is the system design. Subsystem detail lives in
[MEDIA_ENGINE.md](MEDIA_ENGINE.md), [TIMELINE_ENGINE.md](TIMELINE_ENGINE.md) and
[EXPORT_PIPELINE.md](EXPORT_PIPELINE.md). Phases and status are in
[DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md) and [FEATURE_MATRIX.md](FEATURE_MATRIX.md).

## 1. Principles that shape the design

1. **Media never leaves the device.** No code path uploads media. The server serves only static files.
   There is no backend that processes media, and adding one needs a written justification plus explicit,
   per-use consent in the UI.
2. **The media engine comes first.** The UI is a client of an engine with a typed contract. React
   components never call WebCodecs or Mediabunny directly.
3. **Non-destructive.** Projects hold references to source media plus edit decisions. Sources are never changed.
4. **Heavy work stays off the main thread.** Decoding, encoding, muxing, waveform analysis and thumbnail
   generation run in workers. The main thread does UI, scheduling and GPU compositing for the preview.
5. **Capabilities are detected at runtime, never assumed.** Codec lists, APIs and limits are probed.
   The UI offers only what the current browser can actually do.
6. **Free for real.** There are no feature flags tied to accounts, payments or usage counters, and the code contains none.

## 2. System overview

```
┌──────────────────────────── Browser tab (main thread) ────────────────────────────┐
│  React UI ── pages/ (marketing, tools, editor)                                     │
│     │                                                                              │
│     ▼                                                                              │
│  State (Zustand)          project store (undoable doc) │ library store (runtime)   │
│     │                                                                              │
│     ├──► Timeline model (pure TS: ops on an immutable project doc, flick timebase) │
│     ├──► Preview compositor (WebGL2 → WebGPU later; renders the frame at playhead) │
│     ├──► Audio graph (Web Audio + AudioWorklet mixer)                              │
│     └──► MediaEngine facade ──► WorkerPool ──postMessage──┐                        │
│                                                          ▼                        │
│                                   media.worker.ts (N instances)                    │
│                                   Mediabunny demux/mux · WebCodecs decode/encode   │
│                                   OffscreenCanvas · FFmpeg.wasm (lazy, fallback)   │
│  Storage: IndexedDB (projects, asset records, file handles, thumbnails)            │
│           OPFS (opt-in source copies, proxies, render cache, export scratch)       │
└────────────────────────────────────────────────────────────────────────────────────┘
Static host: HTML/JS/CSS/WASM with COOP/COEP headers. It sees no media and no project data.
```

## 3. Layers and their contracts

| Layer | Location | Owns | Must not |
|---|---|---|---|
| UI | `src/pages`, `src/components`, `src/editor` | Layout, interaction, presentation | Touch codecs or storage directly |
| State | `src/state` | Current project doc, undo history, selection, runtime asset handles | Do media work |
| Project schema | `src/project` | Types, factories, validation, migration, serialization | Depend on the DOM |
| Timeline model | `src/timeline/model` | Pure edit operations (insert, move, trim, split, ripple, slip) | Do I/O |
| Media engine | `src/media-engine` | Import, probe, decode, encode, mux, thumbnails, waveforms, capability detection | Depend on React |
| Rendering | `src/media-engine/rendering` (Phase 5) | GPU compositor shared by preview **and** export | Hold UI state |
| Storage | `src/storage` | IndexedDB/OPFS adapters, quota, file handles | Know about React |
| Tools | `src/tools` | Standalone tool UIs plus their job definitions, built on the engine | Duplicate engine logic |

The **renderer is shared by preview and export.** Export renders the same composition graph at full
resolution, frame by frame, without real-time constraints. This is how "what you see is what you export" is guaranteed.

## 4. Media engine (summary — see MEDIA_ENGINE.md)

- **Facade** `MediaEngine` (main thread): `probe(file)`, `thumbnails(file, opts)`, and later `waveform`,
  `convert`, `renderTimeline`. Every call returns a `Job<T>` that carries a promise, progress events and `cancel()`.
- **WorkerPool**: a fixed pool sized to `min(hardwareConcurrency-1, 4)`. Jobs are queued FIFO with
  priorities (interactive > background). Cancelling a job posts `cancel` and the worker aborts its
  `AbortController`. A worker that crashes is replaced, and its job is rejected with a typed error.
- **Primary path**: Mediabunny (demux/mux for MP4/MOV/WebM/MKV/MP3/WAV/OGG/FLAC/ADTS/MPEG-TS) plus
  WebCodecs (hardware decode/encode).
- **Fallback path** (Phase 2–3): FFmpeg.wasm, loaded lazily only when (a) the container is not supported by
  Mediabunny (AVI, FLV, WMV…) or (b) the codec cannot be decoded by WebCodecs. The fallback transcodes to an
  intermediate (MP4/H.264 or WebM/VP9 + PCM/Opus), which is then edited normally. It is loaded from our
  own origin (no third-party CDN), and multi-threaded only when `crossOriginIsolated`.
- **Resource discipline**: every `VideoFrame`/`AudioData` is closed in a `finally`. Decoders use bounded
  queues (`decodeQueueSize` checks). Canvas pools are reused.

## 5. Timeline data model (summary — see TIMELINE_ENGINE.md)

- **Timebase: integer flicks** (705,600,000 per second). One flick divides every common video frame
  duration (23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60, 120 fps) and every common audio sample period
  (8 k–192 kHz) exactly. All timeline positions and durations are integers, so floating-point drift cannot occur.
  Conversion to seconds happens only at the media-engine boundary.
- Each project has a **frame rate as a rational number** (e.g. `30000/1001`). Edits snap to the frame grid
  through `quantizeToFrame`. Audio clips may be placed at sample precision.
- **Document shape**: `Project { settings, assets[], tracks[], clips{}, transitions{}, markers[] }`.
  Clips are stored in a map keyed by id, and tracks hold ordered clip ids. Every clip has `start` (timeline),
  `sourceIn`, `duration`, `speed`, `transform`, `effects[]`, `keyframes{}`, `audio`.
- **Edits are pure functions** `(doc, args) → doc`. Undo/redo keeps snapshots of the immutable document.
  Structural sharing keeps snapshots cheap. Autosave persists the latest snapshot.

## 6. Preview rendering strategy

- **Phase 1** (current): a source monitor plays the selected asset through a `<video>`/`<audio>` element
  with a Blob URL. This is a reliable baseline and uses no extra memory.
- **Phase 5**: a timeline compositor.
  - Each visible video clip has a **ClipDecoder** (Mediabunny `VideoSampleSink`, running in the worker that owns
    that source). It decodes ahead of the playhead into a small ring buffer (≤ 8 frames) and transfers `VideoFrame`s
    to the main thread. Seeking jumps to the nearest key frame before the target time and decodes forward to it.
  - The **compositor** uses WebGL2 (WebGPU later). It uploads frames with `texImage2D(VideoFrame)`, which is a
    zero-copy path where the browser supports it. It then applies per-clip shader chains (transform, crop, color, effects,
    chroma key, masks, blend) and composites the layers bottom-up into the preview canvas, then closes the frames.
  - **Clock**: audio is the master clock (`AudioContext.currentTime`). Video frames are picked for display at
    `requestAnimationFrame` time. If decoding falls behind, frames are dropped and the audio is never stalled.
  - **Adaptive resolution**: the preview renders at the monitor's pixel size (½ or ¼ while scrubbing).
    Proxies (Phase 6/8) replace 4K/HEVC sources while editing.
  - Scrubbing uses cached keyframe thumbnails first, then refines with a decoded frame.

## 7. Export pipeline (summary — see EXPORT_PIPELINE.md)

`Timeline → frame scheduler → compositor (OffscreenCanvas in an export worker) → VideoEncoder → Mediabunny Output`.
The audio side runs in parallel: `OfflineAudioContext` mixdown in chunks → `AudioEncoder` → the same Output.
The target is the File System Access stream where available (no full-file RAM buffer), otherwise OPFS, otherwise a memory buffer.
Before a "Done" state is shown, the output is **re-opened with Mediabunny and validated** (duration, tracks, codec,
resolution, first and last frame decodable). Cancelling aborts every stage and deletes partial output.

## 8. Local storage strategy

| Data | Store | Notes |
|---|---|---|
| Project documents | IndexedDB `projects` | JSON, versioned schema, autosaved with a 1 s debounce plus on `pagehide` |
| Asset records | Inside the project doc | Metadata only: name, size, lastModified, probe result, fingerprint |
| File handles | IndexedDB `handles` | `FileSystemFileHandle` (Chromium). Permission is re-requested on a user gesture after reload |
| Thumbnails | IndexedDB `thumbs` | Small JPEG blobs, keyed by asset fingerprint |
| Source copies (opt-in) | OPFS `/media/<fingerprint>` | Only when the user enables "Keep copies in browser storage", with a quota check first |
| Proxies, waveforms, render cache | OPFS (Phase 2+) | Evictable, and regenerated when missing |

- An asset **fingerprint** is `size + lastModified + SHA-256 of the first and last 64 KiB`. Relinking verifies it.
- After a reload, assets without a usable handle or OPFS copy are shown as **offline**, and the user relinks them.
  Nothing pretends to be present when it is not.
- `navigator.storage.persist()` is requested when the user creates the first project. `estimate()` is shown in settings.
- A project file export (`.veyraproj`, JSON) contains **references only** and says so in the UI.

## 9. Browser compatibility strategy

See [BROWSER_COMPATIBILITY.md](BROWSER_COMPATIBILITY.md). A capability matrix is detected at startup
(WebCodecs, WebGL2, WebGPU, SAB/cross-origin isolation, OPFS, File System Access, AudioWorklet, encodable and
decodable codecs at common resolutions) and shown at `/compatibility`. Features check this matrix. If a capability is missing,
the feature either uses a fallback or is disabled with a reason. The page never crashes.

## 10. Directory structure

```
src/
  app/              App root, router
  components/       ui/ (design system primitives), layout/
  pages/            Home, Tools directory, Tool page, Editor, Compatibility, Privacy, 404
  editor/           EditorShell, TopBar, media-library/, preview/, timeline/, inspector/
  media-engine/
    capabilities/   Feature + codec detection
    core/           Types, errors, Job abstraction
    import/         File classification, probing, image probing
    subtitles/      SRT/VTT parsing and serialization
    workers/        Protocol, pool, media.worker
    rendering/      (Phase 5) WebGL2/WebGPU compositor
    encode/ mux/ audio/  (Phase 2+)
  project/schema/   Types, factory, validation
  timeline/model/   Pure edit operations
  storage/          IndexedDB, file handles, quota
  state/            Zustand stores
  tools/            Registry + tool implementations
  utils/            Time (flicks), formatting, ids
```

## 11. Dependencies

| Package | Why | Size / licence notes |
|---|---|---|
| react, react-dom 19 | UI | MIT. Large but standard. Not on the critical media path |
| react-router-dom 7 | Routing, one URL per tool (SEO) | MIT |
| zustand 5 | Small store, works outside React (engine callbacks) | MIT, ~1 KB |
| mediabunny | Demux/mux for many containers, WebCodecs wrapper, conversion | MPL-2.0 (file-level copyleft. We use it unmodified, which is compatible with any licence for our code). Tree-shakeable, pure TS, actively maintained |
| tailwindcss 4 + @tailwindcss/vite | Styling with design tokens | MIT, build time only |
| vite 8, @vitejs/plugin-react | Build, workers, dev server with COOP/COEP | MIT, dev |
| typescript 7 | Strict typing | Apache-2.0, dev |
| vitest, jsdom, fake-indexeddb | Unit and integration tests | MIT, dev |
| *Planned:* @ffmpeg/ffmpeg + core | Fallback for exotic containers/codecs | LGPL-2.1 core build (no GPL codecs such as x264 in the default build). ~30 MB WASM, lazy-loaded, self-hosted |
| *Planned:* @playwright/test | Real-browser media tests | Apache-2.0, dev |
| *Planned (opt-in):* Whisper via transformers.js/ONNX | Local transcription | Apache-2.0. Models are 40–250 MB, downloaded only on explicit request |

No analytics, no ad SDKs, no fonts from third-party CDNs.

## 12. Major technical risks

| Risk | Impact | Mitigation |
|---|---|---|
| Codec support varies (H.264 encoding missing in some Firefox/Linux builds, HEVC decode only on certain hardware, AAC encode absent in Firefox) | Exports unavailable in some formats | Probe the encoders. Fall back to VP9/Opus WebM. Use FFmpeg.wasm for decode-only gaps. Show the truth in the UI |
| Memory pressure from 4K frames (≈ 33 MB each, RGBA) | Tab crashes | Bounded decode queues, frame closing, preview at reduced resolution, proxies |
| Accurate seeking with long GOPs | Slow scrubbing | Key-frame index, decode-forward with a cache, thumbnails first while scrubbing |
| A/V sync over long exports | Drift | Integer flick timebase. Audio rendered sample-exact, separate from the video frame grid |
| Variable-frame-rate sources | Timing jumps | Timestamp-based frame selection (never frame-index arithmetic). Probe reports VFR |
| Storage eviction / quota | Lost projects | `persist()`, small JSON docs, export project, offline/relink model |
| File handle permission after reload (Chromium only) | Relink friction | One-click "Reconnect media" gesture. Opt-in OPFS copies |
| Safari WebCodecs/OPFS gaps | Reduced feature set | Capability matrix plus documented degraded mode |
| FFmpeg.wasm size and speed | Slow fallback | Lazy load, used only when needed, progress shown, multi-threaded when isolated |
| COEP breaking third-party embeds | — | We embed none. All assets are same-origin |
| Solo-developer scope | Delays | Strict phases, feature matrix, acceptance tests per phase |

## 13. Security model (summary — see SECURITY_AND_PRIVACY.md)

- Strict CSP: `default-src 'self'`, `script-src 'self' 'wasm-unsafe-eval'`, `worker-src 'self' blob:`, `img-src 'self' blob: data:`,
  `media-src 'self' blob:`, `connect-src 'self'`.
- Imported SVGs are only rendered through `<img>` or `createImageBitmap` (scripts never execute). They are never inlined into the DOM.
- Subtitle text is rendered as text nodes or canvas text, never as HTML.
- Project files are validated against the schema. Unknown fields are dropped and there is no `eval`.
- Parsing of untrusted media happens inside workers. A crash there kills only the worker.


## Rendering (Phases 3–5)

```
Project ──resolveFrame(t)──▶ layers ──MediaPool (ClipFrameStream per clip, stills)──▶ images
                                   └──Compositor (Canvas 2D + PixelFx WebGL2)──▶ OffscreenCanvas
                         audibleClips ──AudioMixer (per-clip readers, WSOLA, EQ, comp, ducking)──▶ PCM
Export:  media worker  → CanvasSource + AudioSampleSource → Mediabunny Output → OPFS → validateOutput
Preview: preview worker → transferred canvas; PCM blocks → main-thread AudioContext (the clock)
```
The same code paths produce preview and export frames.
