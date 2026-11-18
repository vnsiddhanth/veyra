# Feature Implementation Matrix

Statuses: **Not started** · **In progress** · **Implemented** (code exists) · **Tested** (automated tests pass) ·
**Verified** (acceptance criteria checked against real media in a real browser).
"Verified" lists the browser it was verified in. Other engines are pending until Playwright runs exist (Phase 2).

Last updated: 2026-11-18 (end of Phase 9, release 1.0.0).

## Phase 1 — Foundation

| Feature | Status | Location | Dependencies | Tests | Known limitations | Acceptance criteria |
|---|---|---|---|---|---|---|
| App shell, routing, code splitting | Verified (Chromium) | `src/app/App.tsx` | react-router-dom | — | — | All routes render. Media code is not in the homepage bundle |
| Design system (tokens, primitives, icons, splitter) | Implemented | `src/styles`, `src/components/ui` | tailwindcss | — | No light theme for editor (intentional) | Consistent tokens. Keyboard-resizable panels |
| COOP/COEP + CSP | Verified (Chromium, dev + prod build) | `vite.config.ts`, `public/_headers` | — | — | CSP meta cannot set `frame-ancestors` (the header does) | `crossOriginIsolated === true`. Worker runs under prod CSP |
| Tool directory + search + categories | Verified (Chromium) | `src/tools/registry.ts`, `src/pages/ToolsPage.tsx` | — | `registry.test.ts` | — | Every tool has a page and an honest status |
| Capability detection (APIs) | Verified (Chromium) | `src/media-engine/capabilities/detect.ts` | — | — | — | Matrix renders without crashing |
| Codec capability probe | Verified (Chromium) | `src/media-engine/capabilities/codecs.ts` | mediabunny | — | Encoders tested at 1080p only | `/compatibility` shows live decode/encode |
| File classification (magic bytes) | Tested | `src/media-engine/import/classify.ts` | — | `classify.test.ts` | — | Correct kind/container for 15+ signatures. Extensions can't lie |
| Worker pool + Job (progress, cancel, crash recovery) | Implemented | `src/media-engine/workers/pool.ts`, `core/job.ts` | — | — | Crash recovery and cancel not yet covered by automated tests (Phase 2 Playwright) | Jobs run off-thread. Cancel rejects with `cancelled` |
| Media probe (container, tracks, codecs, fps/VFR, duration fallback) | Verified (Chromium) | `src/media-engine/import/probe.ts` | mediabunny | Manual: MP4 H.264/AAC, WebM VP9/Opus, MediaRecorder VP8 VFR | AVI/FLV/WMV are reported as unsupported until the FFmpeg fallback | Correct metadata for generated fixtures. VFR detected. Missing duration metadata computed from packets |
| Image probe (incl. SVG, script-inert) | Verified (Chromium, PNG) | `src/media-engine/import/image-probe.ts` | — | — | SVG verified by code review only | Dimensions + poster |
| Thumbnails (worker, bounded memory) | Verified (Chromium) | `src/media-engine/import/thumbnails.ts` | mediabunny | Manual | Filmstrips (many thumbs per clip) in Phase 2 | Poster generated for MP4 and WebM |
| Subtitle import (SRT/VTT, sanitised) | Tested + Verified (Chromium) | `src/media-engine/subtitles/parse.ts` | — | `parse.test.ts` | Styling tags reduced to b/i/u | Cues parsed. Script tags stripped. Shown as text |
| Project schema + factory | Tested | `src/project/schema` | — | `validate.test.ts`, `ops.test.ts` | — | Versioned, typed document |
| Project validation (untrusted input) | Tested | `src/project/schema/validate.ts` | — | `validate.test.ts` | — | Unknown fields dropped. Prototype pollution impossible. Invariants checked |
| Flick timebase + timecode | Tested | `src/utils/time.ts` | — | `time.test.ts` | — | Exact integer frame durations for all common rates. Drop-frame TC |
| Timeline model ops (insert/move/trim/split/ripple/slip/tracks) | Tested | `src/timeline/model/ops.ts` | — | `ops.test.ts` (20 cases) | Roll edit, groups and linked A/V not yet | Invariants hold after every op |
| Undo/redo | Tested + Verified (Chromium) | `src/state/history.ts`, `project-store.ts` | zustand | `history.test.ts` | — | Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y |
| IndexedDB persistence + autosave | Tested + Verified (Chromium) | `src/storage`, `src/state/project-store.ts` | — | `projects-repo.test.ts` | — | Project survives hard reload. Saves are serialized. Unload warning while unsaved |
| Recovery after refresh | Verified (Chromium) | `src/pages/EditorPage.tsx`, `media-actions.ts` | — | `projects-repo.test.ts` | Media is offline after reload unless a file handle was stored (Chromium picker/drop) | Project, clips, posters restored. Media shown offline honestly |
| File handles for reconnect | Implemented | `src/storage/media-store.ts` | File System Access | — | Chromium only. Not testable with synthetic drops | One-click reconnect after reload |
| Relink missing media | Implemented | `src/state/media-actions.ts` | — | — | Needs Playwright (native picker) to verify | Fingerprint match, or same kind + duration ±0.1 s with warning |
| Project list: create/open/rename/duplicate/delete | Verified (Chromium: create/open) | `src/editor/ProjectManager.tsx` | — | `projects-repo.test.ts` | — | Delete asks for confirmation |
| Project file export/import (references only) | Tested | `src/project/import-export.ts` | — | `validate.test.ts` | — | Fresh id on import. `containsMedia: false` stated |
| Editor workspace (library, source monitor, inspector, timeline panel) | Verified (Chromium) | `src/editor` | — | Manual | Program monitor is Phase 5. Timeline is display + append/delete only until Phase 4 | Import → inspect → preview → place on timeline |
| Media library: import, drag-drop, search, sort, filter, rename, remove | Verified (Chromium) | `src/editor/media-library` | — | Manual | Folders/collections UI not started (schema ready) | 4 media types imported. Invalid file rejected with a message |
| Inspector tools (metadata, fps, resolution, duration, audio) | Verified (Chromium) | `src/tools/inspect/InspectTool.tsx` | — | Manual | — | Real probe output with preview |
| Persistent storage request + quota display | Implemented | `src/storage/media-store.ts` | — | — | — | `persist()` on first project. Usage on /compatibility |
| Clear all local data | Implemented | `src/pages/PrivacyPage.tsx` | — | — | — | Confirmation required |

## Phase 2 — Media engine

Verified = passes the Playwright suite on Chrome **and** Edge (Windows 11). Firefox/Safari are not yet run.

| Feature | Status | Location | Dependencies | Tests | Known limitations | Acceptance criteria |
|---|---|---|---|---|---|---|
| Conversion job (trim, transcode, remux, resize, crop, rotate, fps, codec, bitrate; 9 containers) | Verified (trim, remux, rotate, WebM, M4A, WAV, MOV); other options Implemented | `src/media-engine/encode/convert.ts` | mediabunny, WebCodecs | `e2e/trim.spec.ts`, manual engine runs | No MP3 encode. AVI/FLV/WMV input needs the FFmpeg fallback (Phase 3) | Validated output, never a silent track drop |
| Frame-accurate and fast (copy) trim | Verified | `convert.ts` copy policies | — | `e2e/trim.spec.ts` (pixel-exact first/last frame, Node re-parse) | — | Output frame 0 = source frame at start, last = frame before end |
| OPFS output streaming + cleanup | Verified | `src/media-engine/encode/output-store.ts` | OPFS `createWritable` | `e2e/trim.spec.ts` (cancel leaves no file) | Safari path (sync access handles) untested; falls back to memory | No partial files after cancel or failure |
| Output validation | Verified | `validateOutput` in `convert.ts` | — | e2e + manual (truncated input rejected) | Decode check samples first/last frame only, not every frame | Unvalidated output is never offered |
| Cancellation | Verified | `pool.ts`, `convert.ts` | — | `e2e/trim.spec.ts` | — | Rejects with `cancelled` and cleans up |
| Frame extraction | Verified | `src/media-engine/decode/frames.ts` | mediabunny | `e2e/tools.spec.ts` | — | Exact frame at full or chosen size |
| Waveform peaks | Verified (manual) | `frames.ts`, `ClipContent.tsx` | mediabunny | Manual (click peaks at each second) | Canvas capped at 4096 px per clip (virtualisation in Phase 4) | Peaks match the audio envelope |
| Filmstrips | Verified (manual) | `media-actions.ts`, `ClipContent.tsx` | — | Manual | — | Tiles follow sourceIn and speed |
| Trim tool | Verified | `src/tools/trim/TrimTool.tsx` | — | `e2e/trim.spec.ts` | Saves via download (no streaming "Save as" yet) | **Phase 2 acceptance met** |
| Thumbnail maker | Verified | `src/tools/thumbnail/ThumbnailTool.tsx` | — | `e2e/tools.spec.ts` | WebP is unavailable where the browser cannot encode it (reported, not faked) | PNG has the exact frame and dimensions |
| Playwright suite | Verified | `e2e/`, `playwright.config.ts` | @playwright/test | 7 tests × 2 browsers | Firefox/WebKit need a browser download | Runs headless on installed browsers |

## Phase 3 — Standalone tools

Verified = the tool's e2e test passes on Chrome **and** Edge and the output is re-parsed in Node.

| Feature | Status | Location | Tests | Known limitations |
|---|---|---|---|---|
| Render engine (evaluate, compositor, pixel FX, frame streams, mixer, export job) | Verified via tools | `src/render` | `evaluate.test.ts`, merge/speed/reverse/text/filters e2e | Canvas 2D compositing; per-pixel effects need WebGL2 (reported if missing) |
| Compress / compress to size | Verified | `src/tools/convert` | e2e | Target size can be missed for extremely low targets (reported, never hidden) |
| Convert (MP4/WebM/MOV/MKV), change fps, resolution, resize, aspect (pad/crop/blur), crop, rotate/flip, mute, repair | Verified (convert, resize, aspect, crop, rotate, mute); others Implemented | `ConvertTool.tsx` | e2e | Frame-rate change drops/repeats frames (no interpolation) |
| Video to audio / audio converter / extract audio (incl. MP3) | Verified (MP3) | `ConvertTool.tsx` | e2e | — |
| Split | Verified | `src/tools/split` | e2e, `tools-logic.test.ts` | Fast mode snaps to key frames (stated in UI) |
| Merge / add transitions | Verified (crossfade, frame check) | `src/tools/compose/MergeTool.tsx` | e2e | Mixed sizes are letterboxed |
| Change speed / reverse | Verified (frame-exact) | `SpeedTool.tsx` | e2e | Reverse decodes each frame from its key frame (slow for long files). Reversed audio ≤ 10 min |
| Replace / add audio | Verified (replace) | `AudioTrackTool.tsx` | e2e | — |
| Remove silence | Implemented | `SilenceTool.tsx` | `tools-logic.test.ts` | Peak-based detection (no speech model) |
| Add text / watermark / burn subtitles / filters / adjust colours | Verified (text, filters) | `DecorTool.tsx` | e2e | Fonts limited to system families |
| Video to GIF / GIF maker | Verified (video) | `src/tools/gif` | e2e | ≤ 900 frames; no dithering |
| Extract frames (ZIP) | Verified | `src/tools/frames` | e2e, `zip.test.ts` | ≤ 5,000 images; no ZIP64 (4 GB) |
| Slideshow / images to video | Implemented | `SlideshowTool.tsx` | — | — |
| FFmpeg.wasm fallback | Not shipped (decision) | — | — | AVI/FLV/WMV unsupported |

## Phase 4 — Timeline engine

| Feature | Status | Location | Tests | Known limitations |
|---|---|---|---|---|
| Group move across tracks, clamped at neighbours | Verified | `edit.ts`, `TimelinePanel.tsx` | `edit.test.ts`, `timeline.spec.ts` | — |
| Trim, roll, slip | Verified (trim); roll/slip Tested | `ops.ts`, `edit.ts` | unit + e2e | No ripple-trim mode yet |
| Split, ripple delete, delete | Verified | `edit.ts`, `commands.ts` | unit + e2e | — |
| Snapping (edges, markers, in/out, playhead) | Tested | `snapTargets`, `snapDelta` | unit | — |
| Zoom (slider, Ctrl+wheel around the pointer, +/−) | Implemented | `TimelinePanel.tsx` | — | No virtualisation for very long timelines yet (Phase 8) |
| Playhead, ruler scrub, frame step, jump to edits | Implemented | `commands.ts` | — | — |
| Markers, in/out | Verified (markers) | `edit.ts` | unit + e2e | — |
| Multi-select (shift/ctrl click, marquee), select all | Verified (marquee) | `TimelinePanel.tsx` | e2e | — |
| Copy / cut / paste / duplicate | Verified | `edit.ts` | unit + e2e | Clipboard is in-app only |
| Library drag-and-drop to timeline | Verified | `MediaLibrary.tsx`, `TimelinePanel.tsx` | e2e | — |
| Detach audio, transitions, text clips | Tested | `edit.ts` | unit | — |
| Undo/redo for every gesture (one step per drag) | Verified | `project-store.ts` | e2e | — |

## Phase 5 — Preview & composition

| Feature | Status | Location | Tests | Known limitations |
|---|---|---|---|---|
| Program monitor (worker + OffscreenCanvas, shared compositor) | Verified | `src/render/preview.worker.ts`, `src/editor/preview` | `preview.spec.ts` (pixel match) | Needs `transferControlToOffscreen` (all current engines) |
| Audio-clocked playback, streamed mixdown | Verified (Chrome/Edge) | `preview-engine.ts` | `preview.spec.ts` | Pitch follows speed unless “Keep pitch” is on |
| Text and image overlays, transitions, filter and pixel effects in preview | Implemented (same code as export, verified via tools) | `src/render` | Phase 3 e2e | — |
| Preview quality (Full, 1/2, 1/4), frame dropping, stats | Verified | `ProgramMonitor.tsx` | `preview.spec.ts` | — |
| 1080p two-layer playback | Verified: 59 fps (headless Chrome, dev machine) | — | `preview.spec.ts` | Not yet measured on low-end hardware (Phase 8) |

## Phase 6 — Pro editing

| Feature | Status | Location | Tests | Known limitations |
|---|---|---|---|---|
| Clip inspector (timing, transform, crop, blend, text) | Verified (transform/keyframes) | `src/editor/inspector/ClipInspector.tsx` | `pro-editing.spec.ts` | — |
| Keyframes + curve editor with easing presets | Verified (opacity incl. preview pixels) | `ClipInspector.tsx`, `edit.ts` | unit + e2e | No bezier handles in UI |
| Effects stack (colour, stylise, blur, pixel FX, LUT, chroma key, masks, text animation) | Verified (stack ops); effects verified via Phase 3 tools | `EFFECTS`, `pixel-fx.ts` | e2e | Pixel effects need WebGL2; LUT ≤ 33³ |
| Audio: volume/pan/fades, keep pitch, EQ, compressor, ducking | Implemented | `audio-mix.ts` | Phase 3 e2e (speed with pitch) | Ducking is a level-triggered gate, not a sidechain compressor |
| Track mixer (volume, mute, solo) | Verified | `TrackMixer.tsx` | e2e | No metering yet |
| Subtitle editor tool | Verified | `src/tools/subtitles` | e2e | — |
| Soft subtitles (WebVTT mux, no re-encode) | Verified (MP4) | `subtitles-mux.ts` | e2e | Our probe doesn't list subtitle tracks; presence checked by codec tag |
| Speed ramps | Not started | — | — | Constant speed only |
| Proxies | Not started (Phase 8) | — | — | — |

## Phase 7 — Export pipeline

| Feature | Status | Location | Tests | Known limitations |
|---|---|---|---|---|
| Timeline render (video + audio mixdown) | Verified (frame-exact cuts, crossfade blend, audio) | `src/render/render-project.ts` | `export.spec.ts` | Export speed depends on WebCodecs hardware support |
| Export dialog (formats, capability-filtered codecs, size, quality, range) | Verified (MP4) | `src/editor/export/ExportDialog.tsx` | `export.spec.ts` | — |
| Output validation before download | Verified | `validateOutput` | all export tests | Decode check samples first/last frames |
| Streaming "Save to a folder" | Implemented (Chromium) | `ExportDialog.tsx` | Manual | Firefox/Safari: download only |
| Offline-media guard | Implemented | `ExportDialog.tsx` | — | — |
| Remove-your-own-overlay guide | Available | `ToolPage.tsx` | — | Only for overlays added in Veyra projects |

## Phase 8 — Optimization & reliability

| Feature | Status | Location | Tests | Known limitations |
|---|---|---|---|---|
| Stabilize video (translation) | Verified (recovers injected shake; valid output) | `decode/motion.ts`, `StabilizeTool.tsx` | `motion.test.ts`, `reliability.spec.ts` | No rotation or rolling-shutter correction; integer-pixel analysis |
| Preview proxies (OPFS, persisted) | Verified | `storage/proxies.ts`, `media-actions.ts` | `reliability.spec.ts` | Built on demand (no automatic proxying yet) |
| Storage manager | Verified | `components/StorageManager.tsx` | `reliability.spec.ts` | — |
| Device benchmark page | Verified | `media-engine/bench.ts`, `pages/BenchmarkPage.tsx` | `reliability.spec.ts` | Memory figure only where the browser exposes it |
| Timeline render performance (playhead isolation, culling) | Implemented | `TimelinePanel.tsx` | e2e regression | — |
| Preview crash recovery, GPU context release | Implemented | `preview-engine.ts`, `pixel-fx.ts` | — | Crash path not forced in tests |
| Firefox / WebKit e2e | Not measured (host blocked browser launch) | `playwright.config.ts` | — | See BROWSER_COMPATIBILITY.md |

## Phase 9 — Polish

| Feature | Status | Location | Tests | Known limitations |
|---|---|---|---|---|
| Get started guide (onboarding) | Verified | `src/editor/GetStarted.tsx` | `new-user.spec.ts` | — |
| Keyboard shortcuts dialog | Implemented | `src/editor/ShortcutsDialog.tsx` | — | — |
| Context menus | Verified (Phase 4) | `TimelinePanel.tsx` | — | Timeline clips only |
| Accessibility (WCAG 2.1 AA automated audit) | Verified: 0 serious or critical | site, tools, editor, export | `a11y.spec.ts` | Automated checks only; no manual screen-reader audit yet |
| Responsive / phone editor | Verified (390 px, no overflow) | `EditorShell.tsx` | `new-user.spec.ts` | Precise timeline work is easier with a pointer |
| SEO (meta, JSON-LD, OG, robots, sitemap) | Implemented | `utils/meta.ts`, `vite.config.ts` | build check | Client-rendered pages (no SSR) |
| New user edits and exports without help | **Verified** | — | `new-user.spec.ts` | — |

## Not implemented (honest list)

| Area | Note |
|---|---|
| FFmpeg.wasm fallback (AVI/FLV/WMV, exotic codecs) | Decided against: GPL cores, and an LGPL build is out of scope |
| Speed ramps (keyframed speed) | Constant speed and reverse only |
| Bezier handles in the curve editor | Easing presets only |
| Rotation / rolling-shutter stabilisation | Translation only |
| Firefox / Safari verification | Fallbacks in code; e2e not runnable on the dev host |
| Manual screen-reader audit | Automated axe audit passes |
