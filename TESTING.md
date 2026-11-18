# Testing

## Layers

| Layer | Tool | Scope |
|---|---|---|
| Unit | Vitest (node) | Time math, timeline ops, project validation, subtitle parsing, file classification, tool registry |
| Integration | Vitest + jsdom + fake-indexeddb | Persistence repositories, autosave/recovery, history |
| Browser media | Playwright (Phase 2) | Probe, thumbnails, trim/convert, export validation on Chromium, Firefox, WebKit |
| Manual verification | Built-in browser during development | Each phase's acceptance criteria, recorded in CHANGELOG |

Run: `npm test` (unit/integration) and `npm run typecheck`.

## Media fixtures

`/dev/fixtures` (dev builds only) generates deterministic fixtures in the browser with Mediabunny
(`CanvasSource` + `AudioBufferSource`): a counter video with a sine tone. Each frame shows its own frame number, so
trim boundaries can be checked visually and programmatically. Phase 2 commits a fixtures folder (small files, < 2 MB total)
generated this way plus real-camera samples (VFR phone clip, 4K HEVC, MKV, no-audio clip, corrupt truncated file).

## Acceptance tests per phase

Each phase in DEVELOPMENT_ROADMAP.md lists acceptance criteria. A feature moves to **Verified** in FEATURE_MATRIX.md only when its
acceptance test passes in at least Chromium, with results for other engines recorded.
