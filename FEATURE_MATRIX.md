# Feature Implementation Matrix

Statuses: **Not started** · **In progress** · **Implemented** (code exists) · **Tested** (automated tests pass) ·
**Verified** (acceptance criteria checked against real media in a real browser).
"Verified" lists the browser it was verified in. Other engines are pending until Playwright runs exist (Phase 2).

Last updated: 2026-11-18 (end of Phase 1).

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

## Later phases (summary)

| Area | Status | Phase |
|---|---|---|
| Conversion jobs (trim/convert/compress) via Mediabunny `Conversion`, output validation | Not started | 2 |
| FFmpeg.wasm fallback (AVI/FLV/WMV, undecodable codecs) | Not started | 2–3 |
| Waveforms, filmstrips | Not started | 2 |
| Playwright real-browser suite (Chromium/Firefox/WebKit) | Not started | 2 |
| All processing tools in `src/tools/registry.ts` marked `planned` | Not started | 2–8 |
| Interactive timeline (drag, trim handles, snapping, playhead, markers, multi-select, copy/paste) | Not started (model ops done) | 4 |
| WebGL2 compositor, program monitor, audio clock | Not started | 5 |
| Effects, transitions, text, keyframe UI, color, masks, chroma key | Not started (schema ready) | 5–6 |
| Timeline export | Not started | 7 |
