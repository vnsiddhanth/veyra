# Development Roadmap

Estimates assume one developer working with AI coding tools at ~25–30 focused hours/week. They are honest ranges, not promises.
The media-heavy phases carry the most uncertainty.

| Phase | Scope | Estimate | Acceptance criteria |
|---|---|---|---|
| 1. Foundation | Shell, design system, routing, tool directory, editor workspace, project model, capability detection, import, metadata, local storage | 2–3 weeks | A user can import a local video, inspect its metadata, preview it and create a local project that survives a refresh |
| 2. Media engine | Decode, frame extraction, thumbnails, waveform, seeking, encode, mux, conversion jobs, progress, cancellation, FFmpeg fallback, Playwright + fixtures | 3–4 weeks | Import a real video, trim it, export a valid playable file locally, validated by re-probe |
| 3. Standalone tools | Compressor, converter, trimmer, merger, splitter, cropper, resizer, rotator, audio extractor, GIF, thumbnails (then the rest of the list) | 3–4 weeks | Each listed tool produces a validated output file in Chromium. Results recorded for Firefox/Safari |
| 4. Timeline engine | Timeline UI, drag/drop, trim handles, split, snapping, zoom, ripple/roll/slip, markers, multi-select, copy/paste, undo/redo | 4–5 weeks | Assemble multiple clips across tracks and edit positions and durations, with undo/redo |
| 5. Preview & composition | WebGL2 compositor, decoder sessions, audio clock, text/image overlays, transitions, effects framework | 4–6 weeks | Preview matches the timeline at any playhead position, and plays 1080p30 two-layer projects on a mid-range laptop |
| 6. Pro editing | Audio mixer/EQ/compressor/ducking, keyframes + curve editor, color (curves, LUTs), masks, chroma key, speed ramps, subtitles, text animation, proxies | 6–8 weeks | A meaningful multitrack project with independently editable visual and audio elements |
| 7. Export pipeline | Timeline render, audio mixdown, encoders, presets, streaming targets, validation | 3–4 weeks | Exported file matches the timeline (timing, transitions, effects, audio), checked by automated frame/audio probes |
| 8. Optimization & reliability | Memory/GPU cleanup, proxies, profiling, compatibility runs, storage management, large-file tests | 3–4 weeks | Usable during demanding operations. Fails gracefully at device limits |
| 9. Polish | Onboarding, shortcuts, context menus, docs, a11y, responsive, SEO, final UI | 2–3 weeks | A new user edits and exports without help |

**Total: roughly 30–41 weeks (7–10 months)** to the full product standard. Usable standalone tools exist after Phase 3 (~2–2.5 months).
A usable basic editor exists after Phase 5 plus a minimal Phase 7 export (~5 months).

## First working milestone (end of Phase 2)

> Drop a video into the editor or the trimmer tool, see real metadata and thumbnails, set in/out, export an MP4 (or WebM
> where H.264 is unavailable) entirely locally, with real progress and cancel, and download a file that was validated by re-probing.

## Phase 1 task breakdown (current)

1. Repository scaffold (Vite 8, React 19, TS strict, Tailwind 4, Vitest), COOP/COEP headers, CSP. ✔
2. Design tokens + UI primitives (Button, Panel, Splitter, Dropzone, Badge, Progress, EmptyState). ✔
3. Routing: `/`, `/tools`, `/tools/:slug`, `/editor`, `/editor/:id`, `/compatibility`, `/privacy`. ✔
4. Tool registry with all ~45 planned tools, an honest per-tool status, search and categories. ✔
5. Capability detection (sync APIs + async codec probe) and the compatibility page. ✔
6. Media engine core: Job abstraction, worker pool, media worker, classification, probe, image probe, thumbnails. ✔
7. Project schema, factory, validation, flick time utils, timeline ops (pure, tested). ✔
8. Storage: IndexedDB repo for projects, handles, thumbnails. Autosave and recovery. Project import/export (JSON references). ✔
9. Editor workspace: top bar, media library (import, drag/drop, search, sort, rename, remove, metadata), source monitor,
   inspector, timeline panel (track headers from the model; interactive editing arrives in Phase 4). ✔
10. Real metadata tools: metadata viewer, frame-rate inspector, resolution inspector, duration calculator, audio metadata viewer. ✔
11. Subtitle import parsing (SRT/VTT) with tests. ✔
12. Dev fixture generator. ✔

## Phase 2 status (2026-11-18)

Acceptance criterion **met in Chrome and Edge**: a real video is trimmed in the Trim tool and exported locally. The output is validated by
the app, independently re-parsed in Node, and checked frame-exact by pixel comparison (`e2e/trim.spec.ts`).

Done: conversion job (trim/transcode/remux/resize/crop/rotate/fps/codec/bitrate, 9 containers), OPFS output streaming,
cancellation with cleanup, output validation, frame extraction, waveform peaks, filmstrips, Trim and Thumbnail tools,
timeline filmstrips and waveforms (cached), Playwright suite (7 tests × Chrome/Edge).

Carried into Phase 3:
- **FFmpeg.wasm fallback (AVI/FLV/WMV, undecodable codecs).** Needs a licensing decision. The published `@ffmpeg/core` builds include
  GPL components (x264/x265), which would make the distributed app GPL. Options: (a) accept GPL for the app, (b) build an LGPL-only core
  (no x264, so decode/remux only and encode via WebCodecs), (c) skip FFmpeg and support only what Mediabunny + WebCodecs handle.
  Recommendation: (b).
- Firefox and WebKit e2e runs (need the Playwright browser download).
- Save directly to a chosen file with `showSaveFilePicker` streaming.
- Real-camera fixtures (VFR phone clip, HEVC, MKV).

## Phase 3 status (2026-11-18)

Acceptance criterion **met in Chrome and Edge**: every tool in the registry except the subtitle editor, soft subtitles, stabilisation and the
overlay-removal workflow produces a validated output. Each tool is covered by an e2e test that re-parses the output in Node
(`e2e/tools-phase3.spec.ts`). Speed, reverse and merge are also checked frame-by-frame.

Decisions:
- **FFmpeg.wasm: option (c), not shipped.** Mediabunny + WebCodecs cover MP4/MOV/WebM/MKV/MP3/WAV/FLAC/Ogg/AAC. An LGPL-only FFmpeg
  core would need a custom Emscripten build; it can be added later as an optional lazy worker without changing the engine API.
- **Render engine built early.** The compositor, frame streams and mixer were written in Phase 3 because merge, speed, overlays and
  slideshow need them. Phases 5–7 reuse them for the program monitor and timeline export.
- Firefox/WebKit runs are still pending (Phase 8).

## Phase 4 status (2026-11-18)

Acceptance criterion **met**: clips from several files are assembled across tracks and their positions and durations edited with
mouse and keyboard, with undo/redo. Verified by `e2e/timeline.spec.ts` with real pointer input, asserting on the project model.

## Phase 5 status (2026-11-18)

Acceptance criterion **met in Chrome/Edge**: the preview matches the timeline at any playhead position, checked pixel-for-pixel against
independently decoded source frames. A 1080p60 two-layer project plays at full rate on the development machine (59 fps measured).
Compositing is Canvas 2D with a WebGL2 pass for per-pixel effects. A full WebGL2/WebGPU layer compositor is an optimisation for Phase 8,
if profiling on low-end devices calls for it.

## Phase 6 status (2026-11-18)

Acceptance criterion **met**: a multitrack project has independently editable visual elements (transform, keyframes, effects, text) and
audio elements (volume/pan/fades, effects, track mixer), all undoable, with the preview reflecting edits (`e2e/pro-editing.spec.ts`).
Deferred: speed ramps and curve bezier handles. Proxies move to Phase 8.

## Phase 7 status (2026-11-18)

Acceptance criterion **met in Chrome**: `e2e/export.spec.ts` exports a two-clip timeline with a crossfade and a title. It proves cut
timing (frame-exact source frames on both sides of the transition), the crossfade (the frame at the cut equals the 50/50 blend), container,
codecs, duration and audible audio.
