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

## Higher-level edits (`src/timeline/model/edit.ts`, Phase 4)

| Operation | Behaviour |
|---|---|
| `moveClips(p, ids, delta, trackDelta)` | All-or-nothing group move across tracks. Rejects overlaps, locked tracks and wrong track kinds; never goes before 0 |
| `clampMoveDelta` | Largest legal move toward the pointer (binary search on frames), used while dragging against neighbours |
| `rollEdit(p, leftId, cut)` | Moves the cut between two touching clips, keeping the total length; limited by both sources |
| `rippleDeleteClips` | Per-track gap closing |
| `splitAt(p, t, ids?)` | Splits the selection, or every unlocked clip under `t` |
| `setClipSpeed` | Rescales duration from the source span; refuses to overlap the next clip |
| `copyClips` / `pasteClips` | Relative timing kept; original track if free, else a compatible one, else a new track |
| `detachAudio` | Puts a video clip's sound on an audio track and mutes the video clip (`mute-audio` effect) |
| `addTextClip`, `updateClip` | Text clips on text tracks; non-timing clip updates |
| `setTransitionAfter`, `removeTransition` | Transitions only between touching clips; length capped by the shorter clip. Moves that separate clips drop the transition |
| `setKeyframe`, `removeKeyframe` | Frame-aligned keyframes per property |
| `addMarker`, `updateMarker`, `removeMarker`, `setInOut` | Frame-aligned, de-duplicated |
| `snapTargets`, `snapDelta` | Clip edges, markers, in/out, playhead and 0; threshold 8 px at the current zoom |

## Interaction model (`src/editor/timeline`)

- Every gesture edits a **draft** project computed by the pure operations. The draft is rendered live and committed on release as **one undo step**. The commit happens outside React state updaters, so StrictMode cannot double-apply it.
- **Clip gestures:** drag a clip body to move it (across tracks too). Drag an edge to trim it. Ctrl/⌘ + edge drag is a roll edit. Alt + drag is a slip edit. Shift inverts snapping while dragging. A yellow guide line shows the snap target.
- **Lane and ruler gestures:** dragging on empty lane space draws a marquee selection; clicking empty space deselects and moves the playhead. Drag on the ruler to scrub.
- **Library drag-and-drop:** drag media from the library onto a lane to place it at the drop time, or onto the nearest compatible track.
- **Context menu:** split, copy, cut, paste, duplicate, add crossfade, detach audio, delete, ripple delete.
- **Shortcuts:**

| Keys | Action |
|---|---|
| S or Ctrl+K | Split |
| Delete / Shift+Delete | Delete / ripple delete |
| Ctrl+C / X / V / D | Copy / cut / paste / duplicate |
| Ctrl+A | Select all |
| M | Add marker |
| I / O / X | Set in / set out / clear in–out |
| T | Add a title |
| N | Toggle snapping |
| ← → (Shift ×10) | Step frames |
| ↑ ↓ | Jump to the previous / next edit point |
| Home / End | Go to the start / end |
| + / − or Ctrl+wheel | Zoom |
| Space | Play / pause |

## Speed ramps (`src/render/speed.ts`)

`keyframes.speed` holds absolute speed multipliers over clip-local time; without them `clip.speed` applies. Source time is
`sourceIn + ∫₀^local speed(τ) dτ`. It is tabulated per keyframe list at 1 ms resolution (trapezoid rule), cached in a WeakMap
and linearly interpolated. `sourceTimeAt`, the audio mixer, reverse and `sourceSpan` all use it, so preview, export and trimming
agree. A ramped clip keeps its timeline length and plays more or less of its source.

## Undo/redo

`src/state/history.ts`: a bounded stack (200 entries) of immutable project snapshots. Ops never mutate, so a snapshot is
a pointer, and unchanged clips and tracks are shared between snapshots. Continuous gestures such as dragging commit a single entry
on pointer-up (`beginTransaction`/`commit`).
