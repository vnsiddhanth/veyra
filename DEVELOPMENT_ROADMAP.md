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
