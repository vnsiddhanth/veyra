# Veyra

A free, local-first video editor and set of video tools that run entirely in the browser.
It has no uploads, no account, no watermark and no export limits. Media is processed on the user's device with WebCodecs and
[Mediabunny](https://mediabunny.dev) in Web Workers.

> **Status: Phase 2 (Media engine) complete in Chrome/Edge.** The trim tool (frame-accurate or instant), thumbnail maker and inspector
> tools work today, with validated local exports. The editor imports media, autosaves, recovers and shows filmstrips and waveforms.
> More standalone tools (Phase 3) and the interactive timeline (Phase 4) are next.
> See [FEATURE_MATRIX.md](FEATURE_MATRIX.md) for exactly what is implemented and verified.

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173 (cross-origin isolated)
npm test             # unit + integration tests (Vitest)
npm run test:e2e     # real-browser media tests (Playwright, uses installed Chrome + Edge)
npm run typecheck
npm run build && npm run preview   # production build with CSP, http://localhost:4173
```

In dev, open **/dev/fixtures** to generate deterministic test videos (frame-numbered counter, sine tone with a click each second)
locally in your browser.

## Requirements

A modern Chromium (Chrome/Edge 120+) gives the full feature set today. Firefox and Safari work with documented limitations.
Open **/compatibility** in any browser to see its detected capabilities.

## Deploying

Static hosting only. The host must send these headers (already in `public/_headers` for Netlify/Cloudflare Pages):

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

The production CSP is also injected into `index.html` at build time. Single-page routing needs a fallback to `index.html`.

## Documentation

| Doc | Contents |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | System design, layers, storage, risks, dependencies |
| [MEDIA_ENGINE.md](MEDIA_ENGINE.md) | Engine contract, workers, probing, resource rules |
| [TIMELINE_ENGINE.md](TIMELINE_ENGINE.md) | Flick timebase, document model, edit operations |
| [EXPORT_PIPELINE.md](EXPORT_PIPELINE.md) | Conversion and timeline export design, output validation |
| [BROWSER_COMPATIBILITY.md](BROWSER_COMPATIBILITY.md) | Capability matrix and fallbacks |
| [PERFORMANCE.md](PERFORMANCE.md) | Budgets and techniques |
| [SECURITY_AND_PRIVACY.md](SECURITY_AND_PRIVACY.md) | Threat model, CSP, untrusted input |
| [TESTING.md](TESTING.md) | Test strategy and fixtures |
| [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md) | Phases, estimates, milestones |
| [FEATURE_MATRIX.md](FEATURE_MATRIX.md) | Per-feature status |
| [CHANGELOG.md](CHANGELOG.md) | History |

## Licence notes

Mediabunny is MPL-2.0 and is used unmodified. The project's own licence is still to be chosen by the maintainer.
