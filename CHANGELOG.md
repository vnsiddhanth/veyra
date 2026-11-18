# Changelog

## 0.8.0 — 2026-11-18 · Phase 8: Optimization & reliability

### Added
- **Stabilize video** tool, so every tool in the directory is now available.
  - **Method:** translation-only motion analysis in the worker (coarse-to-fine luma block matching), moving-average path smoothing, and keyframed correction with automatic zoom, rendered through the shared engine.
  - **Tests:** the e2e test checks that the analyser recovers injected jitter on more than 85% of frames, to ±1 px.
- **Preview proxies:** 540p H.264, 1 s key frames.
  - Created per video from the media card (P button) and stored in OPFS `/proxies`, keyed by fingerprint, so they persist and are shared between projects.
  - The program monitor uses them (Proxies toggle). Export always uses the originals.
- **Storage manager** on the Privacy page: site usage and quota, persistence status, and counts, sizes and Clear buttons for temporary outputs and proxies.
- **Device benchmark page** (`/benchmark`): measured encode, decode and two-layer export fps on a generated clip, memory via `measureUserAgentSpecificMemory` where exposed, and copy as JSON.
- **Preview crash recovery:** if the preview worker dies, the monitor rebuilds itself with a fresh canvas and worker and says so.
- Explicit WebGL context release when renders finish (`PixelFx.dispose`, `Compositor.dispose`).
- Playwright projects for Firefox and WebKit, with `npm run test:e2e:engines`.

### Changed
- The timeline no longer re-renders every frame during playback: the playhead line, timecode and auto-scroll subscribe on their own. Off-screen clips are culled.
- `npm run test:e2e` runs the supported Chromium targets (Chrome and Edge).

## 0.7.0 — 2026-11-18 · Phase 7: Export pipeline

### Added
- **Export dialog** in the editor (Export button or Ctrl+E).
  - **Formats:** MP4, WebM, MOV and MKV, plus audio-only M4A, WAV, FLAC and Ogg.
  - **Codecs:** video and audio codec lists filtered by this browser's encoder probe.
  - **Size and quality:** resolution presets that keep the project aspect, quality presets (Small, Balanced, High, Maximum) or a custom bitrate, and a size estimate.
  - **Range:** whole timeline or in/out.
- Offline media blocks export with a list of the files to reconnect; there is no silent gap-filling.
- Export choices are remembered with the project (no undo step).
- Chromium **Save to a folder**: streams the validated OPFS result to a user-chosen file with `showSaveFilePicker`, with no in-memory copy.
- **Remove your own overlay**: a guide page for the lossless workflow (hide or delete the overlay clip, re-export). We do not offer removing watermarks baked into other people's pixels.
- e2e `export.spec.ts` acceptance test:
  - **Frame checks:** frames before and after a crossfade match their source frames.
  - **Blend check:** the frame at the cut equals the 50/50 blend of both sources.
  - **Audio:** the export is audible.
  - **Format:** container, codecs and duration are checked in Node.

### Changed
- `ExportPreferences.container` accepts every export format.

## 0.6.0 — 2026-11-18 · Phase 6: Pro editing

### Added
- **Clip inspector:**
  - **Timing:** name, timing readouts, speed and reverse.
  - **Transform:** position, scale, rotation, flip, crop, blend mode.
  - **Text:** content, font, size, weight, alignment, colour, box, outline, shadow, spacing.
  - **Effects stack:** add from a grouped catalog, enable, reorder, remove, per-parameter controls, .cube LUT loader (≤ 33³).
  - **Audio:** volume, pan, fades, keep pitch, and an audio effects stack (3-band EQ, compressor, ducking with a side-chain track).
  - **Detach audio.**
- **Keyframes** on opacity, X, Y, scale, rotation and volume: add or remove at the playhead, jump to the previous or next keyframe. Writing to an animated property sets a keyframe.
- **Curve editor:** an SVG graph of the animated value. Double-click adds a point, drag moves it in time and value, and each keyframe's outgoing easing is selectable (linear, ease-in, ease-out, ease-in-out, hold).
- Slider and point drags edit live and collapse into **one undo step** (`live-edit.ts`).
- **Track mixer:** per-track volume fader, mute and solo. The schema gains `Track.volume` and `Track.solo`; older projects default to 1 and false.
- **Subtitle editor** tool: load SRT/VTT, edit cue text and timing, shift all cues, add cues at the video time, live preview, overlap warnings, SRT/VTT export (re-parsed before download).
- **Add subtitles** tool: soft WebVTT track muxed into MP4/MKV/WebM with packet copy (no re-encode), checked for the subtitle codec tag.
- Subtitle files go onto text tracks in the editor, with clip length = last cue end.
- Escape also clears the library selection.
- e2e `pro-editing.spec.ts`: keyframes (model and preview pixels), undo granularity, effects stack, mixer, soft subtitles, subtitle editor.

### Not implemented (stated honestly)
- Speed ramps (keyframed speed). Constant speed and reverse are supported.
- Bezier handles in the curve editor (the schema supports `bezier` easing; the UI offers presets).

## 0.5.0 — 2026-11-18 · Phase 5: Preview & composition

### Added
- **Program monitor.**
  - A dedicated preview worker renders the timeline into a transferred OffscreenCanvas, using the same compositor, frame streams and mixer as export.
  - Playback is clocked by an AudioContext. The worker streams mixed PCM blocks ahead of the clock, and late frames are skipped rather than queued.
  - Preview quality: Full, 1/2 or 1/4.
  - Edits made during playback are heard immediately (audio is re-mixed from the playhead).
  - Warnings for offline media and for effects that cannot run.
- Monitor tabs: Program and Source. Choosing media in the library switches to Source.
- Transport bar: start/end, previous/next edit, frame step, play/pause, timecode, live fps/render-time/skip statistics. Shortcuts: K stops, L plays.
- Frame streams survive value-equal project updates, so edits do not restart every decoder.
- e2e `preview.spec.ts`: preview pixels match independently decoded source frames at several playhead positions and after a trim. A 1080p60 picture-in-picture project plays at ≥ 24 fps (measured 59 fps in headless Chrome on the dev machine).

## 0.4.0 — 2026-11-18 · Phase 4: Timeline engine

### Added
- `src/timeline/model/edit.ts`: group moves across tracks with clamping, roll, ripple delete of many clips, split at the playhead, speed, clipboard, detach audio, text clips, transitions, keyframes, markers, in/out and snapping. 15 new unit tests.
- Interactive timeline. Every gesture is one undo step.
  - **Editing:** move clips by dragging (across tracks too), trim from either edge, roll (Ctrl+edge) and slip (Alt+drag).
  - **Navigation and selection:** snapping with a guide line, marquee selection, ruler scrubbing, playhead.
  - **Markers and range:** markers you can drag, in/out range shading, transition badges.
  - **Placing media:** drag and drop from the media library.
  - **Context menu:** split, copy, cut, paste, duplicate, add crossfade, detach audio, delete, ripple delete.
- Keyboard shortcuts for the timeline (see TIMELINE_ENGINE.md).
- Inspector panels for transitions (type, length) and markers (label, colour).
- e2e `timeline.spec.ts`: drag across tracks + single-step undo, trim, split, ripple delete, library drop, markers, marquee, copy/paste — with real pointer input, asserted against the project model.

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
