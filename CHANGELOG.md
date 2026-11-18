# Changelog

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
