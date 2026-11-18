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

No broader hardware benchmarks have been recorded yet. Phase 8 adds a benchmark page plus a Playwright suite with fixtures
(short/long, 1080p/4K, 30/60/120 fps, VFR, multi-audio) that records decode fps, export fps and peak memory per browser.
Results will be published here as measured, per device. There is no fixed promise.
