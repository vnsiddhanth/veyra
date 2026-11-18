# Browser Compatibility

Live detection: open **/compatibility** in any browser for that browser's actual matrix.

## Target browsers

| Capability | Chrome / Edge (desktop) | Firefox | Safari 17+ | Fallback |
|---|---|---|---|---|
| WebCodecs video | Yes | Yes (130+) | Yes (decode/encode, codec-limited) | FFmpeg.wasm (Phase 2–3) |
| WebCodecs audio | Yes | Yes | Partial (AudioEncoder in 26+) | Web Audio decode + WASM encoders |
| H.264 encode | Yes (usually hardware) | OS-dependent | Yes | VP9/WebM |
| AAC encode | Yes | **No** | Yes | Opus (WebM) |
| HEVC decode | Hardware-dependent | No | Yes | FFmpeg.wasm |
| WebGL2 | Yes | Yes | Yes | Canvas 2D (reduced effects) |
| WebGPU | Yes | Partial | 26+ | WebGL2 |
| OPFS | Yes | Yes | Yes (`createWritable` newer) | IndexedDB blobs |
| File System Access pickers | Yes | No | No | `<input type=file>` + download |
| Persisted file handles | Yes | No | No | Relink after reload, or opt-in OPFS copies |
| SharedArrayBuffer | With COOP/COEP | With COOP/COEP | With COOP/COEP | Single-thread FFmpeg |
| AudioWorklet | Yes | Yes | Yes | — |

Values in this table are expected behaviour from the specifications and vendor documentation.

## Measured (2026-11-18, Windows 11)

| Engine | e2e result | Notes |
|---|---|---|
| Chrome (stable) | **39/39 passing** | Primary target |
| Edge (stable) | **39/39 passing** | Primary target |
| Firefox (Playwright build, Linux CI) | **46/51 on the first run**; the 5 failures are addressed in 1.2.0 (see below) | AAC is not encodable, so MP4 exports use Opus (verified). Playback hung without an audio device; it now falls back to the wall clock |
| WebKit (Playwright WebKitGTK, Linux CI) | **30/51** (informational) | Media workers crash while decoding H.264 in this GTK build. OPFS writes failed once with "UnknownError". Basic tools, metadata, conversion UI, accessibility and the guide work. **This is not Safari**; Safari is still unmeasured |

Local runs of the Playwright Firefox and WebKit builds are blocked on the dev machine by Windows **Smart App Control**, which refuses their
unsigned DLLs. CI runs them on Linux instead: `.github/workflows/engines.yml` runs on every push to `main`.

Run `npm run test:e2e:engines` on a machine where these browsers launch to measure them. Paths that are known to differ have
fallbacks in code, but these are **unverified on those engines**:
- **No AAC encoder (Firefox):** export codec selection falls back to the first encodable codec, Opus in MP4/WebM.
- **No MP3 encoder:** the LAME WASM encoder is used.
- **No OPFS `createWritable` (older Safari):** outputs fall back to memory.
- **No WebGL2:** pixel effects are reported as skipped, never silently dropped.
- **No `showSaveFilePicker`:** files are saved by download only.

## Mobile

Phones get the standalone tools and a simplified editor (Phase 9). The multitrack timeline needs a pointer and a wide viewport,
and we will not pretend otherwise.

## Required server configuration

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Configured in `vite.config.ts` (dev and preview) and in `public/_headers` (Netlify / Cloudflare Pages).
WASM must be served as `application/wasm`. Workers are same-origin ES modules.
