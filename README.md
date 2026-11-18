# Veyra

A free, local-first video editor and set of video tools that run entirely in the browser.
It has no uploads, no account, no watermark and no export limits. Media is processed on the user's device with WebCodecs and
[Mediabunny](https://mediabunny.dev) in Web Workers.

> **Status: 1.2.0. All nine roadmap phases are complete and verified in Chrome and Edge, plus speed ramps, Bezier easing and rotation stabilisation.**
>
> - **Standalone tools:** all 46 are available and produce validated outputs.
> - **Editor:** a multitrack editor with an interactive timeline, a real-time program monitor, keyframes, effects, a mixer, subtitles and validated export.
> - **Firefox and Safari:** fallbacks exist in code but are not yet measured (see [BROWSER_COMPATIBILITY.md](BROWSER_COMPATIBILITY.md)).
> - **Detail:** [FEATURE_MATRIX.md](FEATURE_MATRIX.md) lists exactly what is implemented and verified.

## What you can do

- **Standalone tools** (`/tools`), one job each:
  - **Convert and compress:** compress (or fit a target size), convert (MP4/WebM/MOV/MKV), extract or convert audio (MP3/M4A/Opus/WAV/FLAC), change frame rate or resolution, remux.
  - **Cut and reshape:** trim, split, merge with transitions, crop, resize for platforms, change aspect ratio (bars, crop or blurred fill), rotate, flip.
  - **Time and audio:** change speed with pitch kept, reverse, mute, replace or add audio with ducking, remove silence.
  - **Look and overlays:** filters and colour, text, watermark, burned-in or soft subtitles, a subtitle editor, stabilize.
  - **Images:** GIFs, frames to ZIP, slideshow, thumbnails, metadata inspectors.
- **Editor** (`/editor`):
  - **Timeline:** multitrack drag, trim, roll and slip with snapping; split and ripple; markers; copy and paste.
  - **Preview:** a WYSIWYG program monitor clocked by audio, with proxies for heavy media.
  - **Clips:** keyframes with a curve editor; colour, LUT, chroma key, masks and blur; text with animation; transitions.
  - **Audio:** EQ, compressor and ducking, plus a track mixer.
  - **Projects and export:** autosave and crash-safe recovery, and export to video or audio with validation.
- **Easy to learn:** drag to reorder anywhere (tool lists, media panel, timeline Rearrange mode), hover to preview, keyboard alternatives for everything, and a plain-language [guide](/guide) in the app.
- **Privacy:** files never leave the device. Outputs are re-opened and checked before you can download them. Nothing is simulated.

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173 (cross-origin isolated)
npm test             # unit + integration tests (Vitest)
npm run test:e2e     # real-browser tests (Playwright, installed Chrome + Edge)
npm run test:e2e:engines   # Firefox + WebKit (needs `npx playwright install firefox webkit`)
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
Set `VEYRA_SITE_URL=https://your.domain` at build time to emit `sitemap.xml`. `robots.txt` is always emitted.

Other pages: `/benchmark` measures the device, `/compatibility` lists codec support, `/privacy` shows local storage and lets you clear it.

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

Dependencies are used unmodified:
- Mediabunny and `@mediabunny/mp3-encoder` (MPL-2.0; the MP3 encoder wraps LAME, which is LGPL, as WASM)
- gifenc (MIT)
- React, Zustand, React Router (MIT)

No GPL code is shipped: FFmpeg.wasm was deliberately not included (see DEVELOPMENT_ROADMAP.md). The project's own licence is still to be chosen by the maintainer.
