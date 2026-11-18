# Security and Privacy

## Privacy guarantees (architectural, not policy-only)

- **No media upload code exists.** `connect-src 'self'` in the CSP means the page cannot send data to other origins
  even if a bug tried to.
- No analytics, trackers, ad SDKs or third-party fonts.
- Media is read only after the user picks or drops it. File handles are used only for files the user chose.
- Projects, thumbnails and caches stay in this browser's storage (IndexedDB/OPFS) for this origin.
  "Clear all local data" in settings deletes all of it.
- Any future feature needing a network service (for example downloading an optional transcription model) must show
  what is downloaded, its size and where from, and wait for explicit consent. Media is never sent.

## Untrusted input handling

| Input | Risk | Handling |
|---|---|---|
| Media files | Parser bugs, resource exhaustion | Parsed in workers by Mediabunny (memory-safe JS) and by browser decoders. Bounded queues. Per-job cancellation |
| SVG | Script execution | Only loaded via `<img>`/`createImageBitmap` from a Blob URL (scripts inert). Never inserted into the DOM |
| Subtitles (SRT/VTT) | HTML injection | Parsed to plain text. Tags stripped to a whitelist of styling flags (`b`,`i`,`u`). Rendered as text nodes/canvas |
| Project files | Prototype pollution, script injection | `JSON.parse` + `validateProject` builds a fresh object from known fields only. No `eval`, no HTML |
| File names | XSS | Rendered as React text (escaped) |

## Content Security Policy (production)

See `public/_headers`. `'wasm-unsafe-eval'` is required for WebAssembly (FFmpeg fallback). No `'unsafe-eval'` and no inline scripts.

## Dependency auditing

`npm audit` is run on each dependency change. Status on 2026-11-18: advisories reported against `picomatch`/`tinyglobby`, which are
pulled in by the **dev-only** toolchain (vite, vitest). They do not ship to users. They will be resolved when upstream
releases patched versions. Track with `npm audit --omit=dev` (must stay clean).
