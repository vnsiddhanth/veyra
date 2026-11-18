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

Values in this table are expected behaviour. **Phase 8 replaces them with measured results** from Playwright runs on each engine.

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
