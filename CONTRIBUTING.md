# Contributing to Veyra

Thanks for helping. Bug reports, fixes, new tools, translations and documentation are all welcome.

## Ground rules

- **Never fake functionality.** A feature either really processes media or it isn't shown. No simulated progress, no placeholder buttons.
- **Validate outputs.** Anything that produces a file goes through the engine's validation (re-open, check tracks, duration, size, decode).
- **Keep heavy work off the main thread.** Decoding, encoding and analysis run in workers (`src/media-engine/workers`, `src/render`).
- **Privacy first.** No network calls with user data, no analytics that track people, nothing that weakens the Content-Security-Policy.
- **Be honest in the UI and docs** about limits (browser support, formats, sizes).

## Setup

```bash
npm install
npm run dev            # http://localhost:5173
```

Open `/dev/fixtures` in dev to generate deterministic test videos.

## Before opening a pull request

```bash
npm run typecheck
npm test               # unit tests (Vitest)
npm run test:e2e       # browser tests (Playwright; uses your installed Chrome and Edge)
npm run build
```

New behaviour needs tests: pure logic gets Vitest unit tests next to the code, and user-visible flows get a Playwright spec in `e2e/`. Media
tests should check the actual output (re-parse it, compare frames), not just that a button was clicked.

## Adding a tool

1. Register it in `src/tools/registry.ts`.
2. Implement or reuse an engine component (see `src/tools/convert/ConvertTool.tsx` for single-file conversions and `src/tools/compose/*`
   for tools that build a composition).
3. Write its how-to in `src/tools/guides.ts`. A unit test fails if any tool lacks a guide.
4. Add an e2e test that downloads the result and checks it.

## Code style

TypeScript strict mode, functional React components, Tailwind for styling with the design tokens in `src/styles/index.css`. Keep components
accessible: labelled controls, keyboard support, visible focus. The axe audit in `e2e/a11y.spec.ts` must stay green.

## Reporting bugs

Open an issue with your browser and version, the steps to reproduce, and what happened versus what you expected. If a file triggers the
problem, describe it (container, codec, resolution, duration — `/tools/video-metadata` shows all of that). Please don't attach private media.

## Licence

By contributing you agree that your contribution is licensed under the [MIT licence](LICENSE).
