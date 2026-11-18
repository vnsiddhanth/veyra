# Testing

## Layers

| Layer | Tool | Scope |
|---|---|---|
| Unit | Vitest (node) | Time math, timeline ops, project validation, subtitle parsing, file classification, tool registry |
| Integration | Vitest + jsdom + fake-indexeddb | Persistence repositories, autosave/recovery, history |
| Browser media | Playwright (`e2e/`) | Trim (both modes, pixel-exact boundaries), cancel cleanup, damaged input, thumbnail PNG, metadata, project reload. Runs on installed Chrome and Edge |
| Manual verification | Built-in browser during development | Each phase's acceptance criteria, recorded in CHANGELOG |

Run: `npm test` (unit/integration), `npm run test:e2e` (real browsers) and `npm run typecheck`. `npm run test:all` runs everything.

The e2e suite drives the installed Chrome and Edge through Playwright's `channel` option, so no browser download is needed.
Firefox and WebKit need `npx playwright install firefox webkit` (about 300 MB) and a project entry in `playwright.config.ts`. That is not done yet.

### How outputs are verified
1. The app's own validation must pass (re-probe + decode checks) before a download is offered.
2. The test downloads the file and re-parses it **in Node** with Mediabunny (container, codecs, size, duration).
3. Frame-exactness is checked by colour. Each fixture frame has a unique background hue. The test asserts that output frame 0 equals
   source frame 30 and the last output frame equals source frame 89, and that neighbouring source frames are distinguishable.

## Media fixtures

`/dev/fixtures` (dev builds only) generates deterministic fixtures in the browser with Mediabunny
(`CanvasSource` + `AudioBufferSource`): a counter video with a sine tone. Each frame shows its own frame number, so
trim boundaries can be checked visually and programmatically. Fixtures have a key frame every 2 s. `e2e/global-setup.ts`
generates any missing fixture into `e2e/fixtures/` (committed, about 1 MB). Still to add: real-camera samples (VFR phone clip, 4K HEVC,
MKV, no-audio clip).

## Acceptance tests per phase

Each phase in DEVELOPMENT_ROADMAP.md lists acceptance criteria. A feature moves to **Verified** in FEATURE_MATRIX.md only when its
acceptance test passes in at least Chromium, with results for other engines recorded.
