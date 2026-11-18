# Export Pipeline

Status: **implemented and verified**. Single-file conversion (Phase 2), project rendering (Phase 3) and the editor export dialog (Phase 7) all work. `e2e/export.spec.ts` checks that exports match the timeline frame by frame.

## Single-file tools (Phase 2–3)

`mediaEngine.convert(file, options)` → worker → Mediabunny `Conversion.init({ input, output, trim, video, audio })`.

- Stream copy when no re-encode is needed (trim on key frames, remux, mute). Re-encode otherwise.
- The output target is `StreamTarget` → an OPFS `FileSystemWritableFileStream`, so large exports never sit in RAM. The fallback is
  `BufferTarget` (memory). *Planned:* stream directly to a user-chosen file via `showSaveFilePicker` (Chromium).
- Progress comes from `conversion.onProgress`. It is real, never simulated.
- Cancel calls `conversion.cancel()` and the partial output is deleted.

## Timeline export (implemented)

```
for each output frame t (flicks, on the export frame grid):
  layers = resolveLayers(project, t)                // clip, source time, transform, effects, transition state
  frames = await decoders.frameAt(layers)           // per-source sequential decoders (forward-only during export)
  compositor.render(layers, frames) → OffscreenCanvas
  new VideoFrame(canvas, { timestamp }) → VideoEncoder (backpressure: encodeQueueSize ≤ 4)
audio: chunked OfflineAudioContext mix (10 s windows with overlap-free boundaries) → AudioEncoder
both → Mediabunny Output (MP4 or WebM) → target
```

- Encoder config is chosen from the capability probe: H.264 (avc1.640028 at 1080p, level chosen by resolution and fps),
  VP9, AV1, AAC, Opus. Unsupported choices are hidden, not just disabled.
- Presets: Small (0.5×), Balanced (1×), High (1.6×), Maximum practical (2.5×) of a resolution-scaled bitrate reference
  (≈ 8 Mbps at 1080p30 H.264). Custom bitrate is allowed.

## Validation before reporting success

1. Re-open the output with Mediabunny.
2. Check the container parses and the track count matches expectations.
3. Check duration within ±1 frame of the expected range.
4. Check resolution and codec match the settings.
5. Decode the first and last video frame. Decode one audio chunk.

Only then does the UI show "Export complete" with the download. A validation failure is shown as an error with details.

## Editor export flow (Phase 7)

1. The dialog collects format, codecs, size, quality and range, and checks that every used asset is online.
2. `mediaEngine.render({ project, files, settings })` runs in the media worker:
   - frames are rendered through the compositor into `CanvasSource`;
   - the mixdown goes to `AudioSampleSource` in 2048-sample blocks;
   - the muxer writes to an OPFS stream.
3. The output is validated. Only then does the dialog show the result card: a preview, the checks, and a download link. On Chromium it also offers a streaming "Save to a folder".
4. Cancel aborts the worker job, and the partial OPFS file is deleted.
