# Changelog

## 0.2.0 — 2026-11-18 · Phase 2: Media engine

### Added
- `mediaEngine.convert`: trim, transcode, remux, resize, crop, rotate/flip, frame rate, codec and bitrate across MP4, MOV, WebM, MKV,
  M4A, Ogg, WAV, AAC (ADTS) and FLAC. Has frame-accurate, fast (copy) and full-re-encode policies.
- Outputs stream into the Origin Private File System (memory fallback). Partial files are removed on cancel or failure, dismissed results are released, and abandoned files are swept after 24 h.
- Output validation: re-probe, track/duration/size/codec checks, and first/last-frame and audio decode. No unvalidated file is ever offered.
- `extractFrame` (PNG/JPEG/WebP, refuses silent format fallback) and `waveform` (streamed peak envelope).
- **Trim video** tool: frame-stepping player, filmstrip range bar with drag handles, I/O shortcuts, precision and format choice,
  progress with ETA, cancel, verified result with checks.
- **Thumbnail maker** tool: pick an exact frame and export a verified PNG/JPEG/WebP at chosen size.
- Timeline: filmstrips on video clips and waveforms on audio clips, cached in IndexedDB so they show while media is offline.
- Playwright e2e suite on installed Chrome and Edge, with committed deterministic fixtures and Node-side output inspection.
- Dev-only `window.__veyra` engine hook (removed from production builds).

### Fixed
- Result download URLs were revoked under React StrictMode re-mounting (download "canceled").
- Media cards: action buttons are now reachable without hover (shown when selected). Cards have their own accessible name.

## 0.1.0 — 2026-11-18 · Phase 1: Foundation

### Added
- Vite 8 + React 19 + strict TypeScript 7 + Tailwind 4 scaffold. COOP/COEP in dev, preview and `public/_headers`. Production CSP injected at build.
- Design system: semantic color tokens (dark editor, system-themed site), primitives, icon set, resizable panels.
- Routes: home, tool directory, 46 tool pages, editor (project manager and workspace), compatibility, privacy, dev fixtures.
- Media engine: typed `Job` API with progress and cancellation, lazy worker pool with priorities and crash recovery,
  magic-byte classification, Mediabunny probe (tracks, codecs, frame-rate metrics and VFR detection, duration fallback),
  image probe, worker-side thumbnails.
- Capability detection for platform APIs and a live codec probe at `/compatibility`.
- Project model v1 with strict validation of untrusted input. Flick (1/705,600,000 s) timebase with exact frame math and drop-frame timecode.
- Pure timeline operations: insert, move, trim start/end, split (keyframe-aware, speed-aware), remove, ripple delete, slip, and track operations.
- Snapshot undo/redo (200 steps). Debounced autosave to IndexedDB with serialized writes and an unsaved-changes warning.
- Media library: import by picker or drop, file handles (Chromium), fingerprints, posters cached in IndexedDB, search, sort,
  filter, rename, remove (undoable), offline detection, reconnect and relink.
- Working tools: video metadata viewer, frame-rate inspector, resolution inspector, duration calculator, audio metadata viewer.
- SRT/VTT import with sanitisation.
- Project file export/import (references only, stated in the UI and the file).
- 60 unit/integration tests.

### Verified manually (Chromium, built-in browser)
- Generated an H.264/AAC MP4 and a VP9/Opus WebM in-browser. Probed both with correct metadata.
- Imported MP4, WebM, PNG and SRT in one drop. A `.txt` file was rejected with a message. Posters were generated.
- Appended clips with frame-exact timecodes. Delete, undo and redo work.
- Hard reload restores the project, clips and posters. Media shows as offline with reconnect options.
- Project format matches the first video (854×480 @ 24 fps) even when an image finishes importing first.
- The production build runs under CSP. A MediaRecorder WebM with no duration metadata had its duration computed from packets, and its VFR was detected.
