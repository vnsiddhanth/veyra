# Performance

## Budgets

| Metric | Budget |
|---|---|
| Homepage JS (gzip) | ≤ 120 KB. No media libraries loaded |
| Editor initial JS (gzip) | ≤ 350 KB. Mediabunny loads inside workers only |
| Probe of a local file (metadata only) | < 300 ms for typical MP4 |
| Main-thread long tasks during processing | none > 50 ms caused by our code |
| Preview memory | bounded ring buffers (≤ 8 frames per active decoder) |

## Techniques in place

- Mediabunny and all media handlers live in worker chunks. The homepage and tool directory never import them.
- `BlobSource` reads byte ranges on demand, so large files are not read into memory.
- Thumbnails: ≤ 160 px wide, 2-canvas pool, JPEG blobs cached in IndexedDB by fingerprint.
- Route-level code splitting (`React.lazy`) for editor, tools and compatibility pages.

## Benchmarks

First measurements (Chrome, Windows 11, 12 logical cores, one run each, generated fixtures). These are indicative only:

| Operation | Input | Time |
|---|---|---|
| Fast trim (copy) 2 s | 720p30 H.264/AAC | 0.11 s |
| Frame-accurate trim 2 s (re-encode) | 720p30, 2 s GOP | ~2.8 s |
| Remux MP4 → MOV | 720p30 5 s | 0.19 s |
| Transcode → WebM VP9/Opus 480p | 720p30 5 s | 2.9 s |
| Rotate 90° (re-encode) | 720p30 5 s | 3.8 s |
| Extract audio → M4A (copy) | 5 s | 0.03 s |

Re-encoding includes the validation pass, which decodes the first and last frames.

### Device benchmark (`/benchmark`, Phase 8)

Measured by `e2e/reliability.spec.ts` on the development machine: Windows 11, 12 logical cores, headless.
The test clip is 1080p30, 90 frames, H.264 (hardware encoder).

| Browser | Encode | Decode | Two-layer export (decode + composite + encode) |
|---|---|---|---|
| Chrome | 83–90 fps | 580–790 fps | 45–49 fps (≈ 1.6× real time) |
| Edge | 77 fps | 573 fps | 47 fps |

### Preview playback (`e2e/preview.spec.ts`)

| Project | Browser | Shown fps | Worker render time |
|---|---|---|---|
| 1080p60 + 720p picture-in-picture, full quality | Chrome | 53–59 | 0.9–1.3 ms |
| same | Edge | 52–60 | 0.9–1.4 ms |

Numbers vary run to run by about 10% and are much lower on machines without hardware video encode. Anyone can measure their own device on
`/benchmark`. There is no fixed promise; results are published here as measured.

### Phase 8 optimisations

- **Timeline rendering:** the playhead, timecode and auto-scroll subscribe to the store on their own, so playback no longer re-renders the timeline every frame. Off-screen clips (beyond the viewport plus 400 px) are not rendered.
- **Proxies:** a 540p proxy with 1 s key frames cuts decode cost for 4K or long-GOP sources in preview.
- **Decoder reuse:** frame streams survive value-equal project updates, so edits do not restart decoders.
- **GPU cleanup:** WebGL contexts are released explicitly after each render.

### Contention note (release 1.1.0)

Under heavy load from other applications, the same benchmark measured about half the throughput: encode 38 fps, export 21 fps.
Preview playback became bimodal, either 51–60 fps or 1–14 fps depending on whether hardware decode was available. Veyra now pauses
background analysis during playback and keeps the main thread out of the per-frame path, but it cannot make a contended GPU decoder fast.
