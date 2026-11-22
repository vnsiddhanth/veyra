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
| WebKit (Playwright build, **macOS** CI, 2026-11-22) | **135/136 passing** (55 harsh/4K tests skip without their fixtures) | See *WebKit on macOS* below. The one failure is a real encoder gap, not a crash |

Local runs of the Playwright Firefox and WebKit builds are blocked on the dev machine by Windows **Smart App Control**, which refuses their
unsigned DLLs. CI runs them on Linux instead: `.github/workflows/engines.yml` runs on every push to `main`.

Run `npm run test:e2e:engines` on a machine where these browsers launch to measure them. Paths that are known to differ have
fallbacks in code, but these are **unverified on those engines**:
- **No AAC encoder (Firefox):** export codec selection falls back to the first encodable codec, Opus in MP4/WebM.
- **No MP3 encoder:** the LAME WASM encoder is used.
- **No OPFS `createWritable` (Safari before 26):** outputs and proxies are written with a sync access handle in a worker (Safari 15.2+); with no usable OPFS at all they fall back to memory.
- **No WebGL2:** pixel effects are reported as skipped, never silently dropped.
- **No `showSaveFilePicker`:** files are saved by download only.

## WebKit on macOS (Safari's engine)

The `e2e (webkit, macos-latest)` job runs Playwright's WebKit on macOS, which uses Apple's media frameworks (VideoToolbox, WebCodecs)
the way Safari does. It is still not Safari itself, so the job is informational. On 2026-11-22 it went from 29 failures to 1
(run 44995618545; the 55 harsh/4K tests skip without their fixtures). Chrome (136/136 locally) and Firefox (CI) still pass.

**What was wrong (fixed):**
- **Workers were refused under COEP.** Vite's dev server answers cached modules with a bare `304` that leaves out
  `Cross-Origin-Embedder-Policy`. Chrome and Firefox reuse the cached headers; WebKit checks the `304` itself and refuses to load
  the module into a worker ("Worker load was blocked by Cross-Origin-Embedder-Policy"). The media and preview workers died on their
  second load, which showed up as "The processing worker stopped unexpectedly, twice" and an empty media library. `vite.config.ts` now
  sets the isolation headers on every dev and preview response. Production was not affected: `public/_headers` covers every path.
- **The program monitor crashed without `transferControlToOffscreen`** (Playwright WebKit on Windows). If the canvas cannot be
  transferred, the preview worker now draws into its own OffscreenCanvas and sends each frame back as an ImageBitmap. If the worker has no
  OffscreenCanvas at all, the monitor shows a message instead of crashing. Safari 16.4+ has both, so it takes the normal path.
- **Compress could return a bigger file.** It now re-encodes at an explicit bitrate below the source's (up to twice) and, if the file
  still is not smaller, says so instead of claiming a saving.
- **Proxies were silently dropped without OPFS.** They are now kept for the session, and the editor says so.

**Remaining gaps:**

| Test | Why | What a Safari user sees |
|---|---|---|
| `tools-phase3` › compress video makes a smaller valid MP4 (**fails**) | WebKit's H.264 encoder (VideoToolbox, software on CI) does not go below about 500 kbit/s at 720p: asking for 150 kbit/s gave 312 KB, "very low" 327 KB. The x264 test source is already 309 KB (about 490 kbit/s) | For footage that is already tightly compressed, Compress at the same resolution cannot shrink it. The result says so and suggests a lower maximum resolution |
| `trim` › trim can be cancelled and leaves no output behind; `reliability` › preview proxy is created, persisted and listed in storage (**pass**, with a note) | In Playwright WebKit on macOS every OPFS call fails with `UnknownError`, as in Safari Private Browsing. Outputs fall back to memory (`storage: 'memory'`) and nothing can persist. These tests detect that and check only what still applies (the cancel itself; the proxy kept for the session), and record a note. On-disk output and proxy persistence are therefore **not verified** in WebKit | In Private Browsing: big exports must fit in memory, and proxies last only for the session |

Measured by a diagnostic run on the same runner: main thread `createWritable` present, worker `createSyncAccessHandle` present, but
`getDirectoryHandle`, listing and sync writes all fail with `UnknownError`; quota is reported as 1 GB with 0 used. VP8, VP9 and H.264
encode all work.

Performance on that runner (software VideoToolbox, 4 cores): 1080p encode 60 fps, decode 356 fps, two-layer export 11.8 fps;
preview playback of a 1080p60 two-layer timeline about 2 fps (61 ms a frame). The playback test passes; real Macs with hardware
decoding should be much faster, but that is unmeasured.

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
