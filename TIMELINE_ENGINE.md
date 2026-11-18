# Timeline Engine

## Timebase

All timeline times are **integer flicks**: 705,600,000 per second (`src/utils/time.ts`).

| Rate | Flicks per unit |
|---|---|
| 24 fps | 29,400,000 |
| 23.976 (24000/1001) | 29,429,400 |
| 25 fps | 28,224,000 |
| 29.97 (30000/1001) | 23,543,520 |
| 30 fps | 23,520,000 |
| 59.94 (60000/1001) | 11,771,760 |
| 60 fps | 11,760,000 |
| 44.1 kHz sample | 16,000 |
| 48 kHz sample | 14,700 |

`Number.MAX_SAFE_INTEGER` flicks ≈ 147 days, so overflow is not a concern.
Helpers: `secondsToFlicks`, `flicksToSeconds`, `frameDuration(rate)`, `quantizeToFrame(t, rate, mode)`,
`framesToFlicks`, `flicksToFrames`, `formatTimecode(t, rate)` (SMPTE, drop-frame for 29.97/59.94).

## Document model (`src/project/schema/types.ts`)

```
Project
├─ id, name, createdAt, updatedAt, schemaVersion
├─ settings: { width, height, frameRate: Rational, sampleRate, background }
├─ assets: Asset[]           kind, name, size, lastModified, fingerprint, mediaInfo, folderId
├─ folders: Folder[]
├─ tracks: Track[]           id, kind (video|audio|text|overlay), name, locked, muted, hidden, clipIds[] (sorted by start)
├─ clips: Record<id, Clip>   id, trackId, assetId|null, start, duration, sourceIn, speed, reversed,
│                            transform, opacity, blendMode, effects[], keyframes, audio{gain,pan,fadeIn,fadeOut}, text?
├─ transitions: Record<id, Transition>  between two adjacent clips on one track
├─ markers: Marker[]
└─ export: ExportPreferences
```

Invariants (checked by `validateProject` and by tests):
1. Clips on one track never overlap. `clipIds` is sorted by `start`.
2. `duration > 0`, `start ≥ 0`, `sourceIn ≥ 0`.
3. For media clips, `sourceIn + duration × speed ≤ asset duration`. Stills and text have no source limit.
4. Every `clip.trackId` matches the track that lists it.

## Operations (`src/timeline/model/ops.ts`)

Pure functions that return a new project, or throw `TimelineError` without mutating anything:

| Op | Status |
|---|---|
| `addTrack`, `removeTrack`, `renameTrack`, `setTrackFlags`, `moveTrack` | Implemented + tested |
| `insertClip` (fails on overlap) | Implemented + tested |
| `moveClip` (to time/track, overlap check, frame snapping) | Implemented + tested |
| `trimClipStart` / `trimClipEnd` (respects source bounds and neighbours) | Implemented + tested |
| `splitClip` at time | Implemented + tested |
| `removeClip`, `rippleDelete` | Implemented + tested |
| `slipClip` | Implemented + tested |
| Roll edit, ripple insert, magnetic main track, groups | Phase 4 |
| Snapping engine (playhead, clip edges, markers, in/out) | Phase 4 |

## Undo/redo

`src/state/history.ts`: a bounded stack (200 entries) of immutable project snapshots. Ops never mutate, so a snapshot is
a pointer, and unchanged clips and tracks are shared between snapshots. Continuous gestures such as dragging commit a single entry
on pointer-up (`beginTransaction`/`commit`).
