/**
 * Add a soft (selectable) WebVTT subtitle track to a video without re-encoding: every audio and
 * video packet is copied as-is into a new container alongside the subtitle track.
 */
import {
  BufferTarget,
  EncodedAudioPacketSource,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  Output,
  StreamTarget,
  TextSubtitleSource,
  type AudioCodec,
  type StreamTargetChunk,
  type VideoCodec,
} from 'mediabunny';
import { MediaError } from '../core/errors';
import type { ConvertResult, ValidationCheck } from '../core/types';
import { openInput } from '../import/probe';
import { CONTAINER_INFO, makeFormat, outputFileName, validateOutput } from './convert';
import { createScratchFile, deleteScratchFile } from './output-store';

export interface SoftSubtitleOptions {
  vtt: string;
  container: 'mp4' | 'mkv' | 'webm';
  languageCode: string;
  label: string;
  fileName: string;
}

export async function addSoftSubtitles(file: Blob, o: SoftSubtitleOptions, jobId: string, onProgress: (p: number) => void, signal: AbortSignal): Promise<ConvertResult> {
  const started = performance.now();
  const input = openInput(file);
  const names = outputFileName(o.fileName, o.container, jobId);
  let scratch = await createScratchFile(names.scratch);
  const target = scratch ? new StreamTarget(scratch.writable as unknown as WritableStream<StreamTargetChunk>, { chunked: true }) : new BufferTarget();
  const format = makeFormat(o.container);
  const output = new Output({ format, target });
  try {
    if (!format.getSupportedSubtitleCodecs().includes('webvtt')) throw new MediaError('no-encoder', `${o.container.toUpperCase()} cannot hold WebVTT subtitles here.`);
    const v = await input.getPrimaryVideoTrack();
    const a = await input.getPrimaryAudioTrack();
    if (!v) throw new MediaError('no-tracks', 'This file has no video track.');
    if (v.codec && !format.getSupportedVideoCodecs().includes(v.codec)) throw new MediaError('no-encoder', `${o.container.toUpperCase()} cannot hold ${v.codec} video without re-encoding. Choose another format.`);
    if (a?.codec && !format.getSupportedAudioCodecs().includes(a.codec)) throw new MediaError('no-encoder', `${o.container.toUpperCase()} cannot hold ${a.codec} audio without re-encoding. Choose another format.`);

    const vSrc = new EncodedVideoPacketSource(v.codec as VideoCodec);
    output.addVideoTrack(vSrc, { rotation: v.rotation });
    const aSrc = a ? new EncodedAudioPacketSource(a.codec as AudioCodec) : null;
    if (aSrc) output.addAudioTrack(aSrc);
    const sSrc = new TextSubtitleSource('webvtt');
    output.addSubtitleTrack(sSrc, { languageCode: o.languageCode, name: o.label });
    await output.start();

    const duration = await input.computeDuration();
    const copy = async (track: typeof v | NonNullable<typeof a>, src: EncodedVideoPacketSource | EncodedAudioPacketSource, weight: number, base: number) => {
      const sink = new EncodedPacketSink(track);
      const decoderConfig = await track.getDecoderConfig();
      let first = true;
      for await (const packet of sink.packets()) {
        if (signal.aborted) throw new MediaError('cancelled', 'Cancelled.');
        await (src as EncodedVideoPacketSource).add(packet, first ? ({ decoderConfig } as EncodedVideoChunkMetadata) : undefined);
        first = false;
        if (duration > 0) onProgress(base + Math.min(1, packet.timestamp / duration) * weight);
      }
      src.close();
    };
    await sSrc.add(o.vtt);
    sSrc.close();
    await copy(v, vSrc, aSrc ? 0.6 : 0.9, 0);
    if (a && aSrc) await copy(a, aSrc, 0.3, 0.6);
    await output.finalize();

    const outFile = scratch
      ? new File([await scratch.handle.getFile()], names.display, { type: CONTAINER_INFO[o.container].mime })
      : new File([(target as BufferTarget).buffer!], names.display, { type: CONTAINER_INFO[o.container].mime });
    const fps = (await v.computeFrameRateMetrics({ targetPacketCount: 60 }).catch(() => null))?.bestGuessFrameRate ?? 30;
    const { checks, info } = await validateOutput(outFile, { expectVideo: true, expectAudio: !!a, expectedDuration: duration, frameDuration: 1 / fps, allowExpansion: false });
    // Subtitle tracks are not demuxed by our probe; check the codec tag is present in the file header area.
    const head = new Uint8Array(await outFile.slice(0, Math.min(outFile.size, 4 * 1024 * 1024)).arrayBuffer());
    const tail = new Uint8Array(await outFile.slice(Math.max(0, outFile.size - 4 * 1024 * 1024)).arrayBuffer());
    const tag = o.container === 'mp4' ? 'wvtt' : 'S_TEXT/WEBVTT';
    const has = (buf: Uint8Array) => new TextDecoder('latin1').decode(buf).includes(tag);
    const subCheck: ValidationCheck = { name: 'Subtitle track', ok: has(head) || has(tail), detail: `WebVTT (${o.languageCode}) ${has(head) || has(tail) ? 'present' : 'missing'}` };
    checks.push(subCheck);
    const failed = checks.filter((c) => !c.ok);
    if (failed.length) throw new MediaError('validation-failed', `The output failed validation: ${failed.map((c) => `${c.name} (${c.detail})`).join('; ')}.`);
    onProgress(1);
    const result: ConvertResult = { file: outFile, storage: scratch ? 'opfs' : 'memory', scratchName: scratch?.name ?? null, info, checks, dropped: [], elapsedMs: Math.round(performance.now() - started) };
    scratch = null;
    return result;
  } catch (e) {
    await output.cancel().catch(() => undefined);
    if (e instanceof MediaError) throw e;
    throw new MediaError('unknown', 'Adding subtitles failed.', e instanceof Error ? e.message : String(e));
  } finally {
    input.dispose();
    if (scratch) {
      await scratch.writable.abort().catch(() => undefined);
      await deleteScratchFile(scratch.name);
    }
  }
}
