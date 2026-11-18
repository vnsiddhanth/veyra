# Changelog

## 0.3.0 — 2026-11-18 · Phase 3: Standalone tools

### Added
- **Render engine** (`src/render`), shared by tools now and by preview/export later:
  - Pure timeline evaluation: keyframes with easing, source-time mapping for speed and reverse, transitions centred on cuts, audible clips, gain envelopes.
  - Canvas 2D compositor: transforms, crop, opacity, blend modes, filter effects, 10 transitions, text with outline/shadow/box, text animations, shape masks.
  - WebGL2 pixel pass: temperature/tint, levels, 3D LUT (.cube), chroma key, vignette, grain. Effects that cannot run are reported, not dropped silently.
  - Sequential per-clip frame streams (decoded once from the nearest key frame).
  - Worker-side audio mixer: resampling, speed, reverse, fades, pan, 3-band EQ, compressor, ducking, soft limiter.
  - WSOLA time-stretch for pitch-preserving speed changes.
  - `renderProject` export job, writing to OPFS and validated like every other output.
- New engine jobs: `render`, `gif` (from video), `gifImages`, `frames` (streaming stored ZIP with CRC verification). MP3 output through `@mediabunny/mp3-encoder` (LAME, WASM) when there is no native encoder.
- 36 newly available tools:
  - **Compress & convert:** compress, compress to target size (automatic re-encode if over the limit), convert / MP4 / WebM / MOV, change frame rate, change resolution, repair/remux.
  - **Video edits:** resize with platform presets, aspect ratio (bars, crop or blurred background), interactive crop, rotate & flip, mute.
  - **Audio:** video to audio and audio converter (MP3/M4A/Opus/WAV/FLAC/AAC), extract, replace and add audio (loop, fades, ducking), remove silence.
  - **Cut, join & retime:** split (equal parts, every N s, custom times), merge, add transitions, change speed (pitch preserved), reverse.
  - **Images & GIFs:** video to GIF, GIF maker (video or images), extract frames to ZIP.
  - **Overlays & looks:** add text (animated), add watermark (logo or text), video filters, adjust colours (live preview through the real compositor), slideshow maker (Ken Burns, music), images to video.
  - **Subtitles:** burn in subtitles.
- Tool pages are code-split per engine.
- e2e: 18 new Phase 3 tests per browser (outputs re-parsed in Node; speed, reverse and merge verified frame-by-frame).

### Changed
- Decision on the FFmpeg.wasm fallback: **not shipped**. The published cores bundle GPL encoders, and an LGPL-only core needs a custom Emscripten build that is outside this repository's toolchain. AVI/FLV/WMV stay detected and honestly reported as unsupported.
- Form labels in tools are associated by id (better screen-reader names).
- The dev server pre-bundles media dependencies so it never reloads mid-session.

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
