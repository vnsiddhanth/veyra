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

No hardware benchmarks have been recorded yet. Phase 8 adds a benchmark page plus a Playwright suite with fixtures
(short/long, 1080p/4K, 30/60/120 fps, VFR, multi-audio) that records decode fps, export fps and peak memory per browser.
Results will be published here as measured, per device. There is no fixed promise.
