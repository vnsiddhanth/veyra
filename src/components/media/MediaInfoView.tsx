import { codecLabel } from '@/media-engine/capabilities/codecs';
import type { MediaInfo } from '@/media-engine';
import { formatAspectRatio, formatBitrate, formatBytes, formatDuration, formatFps } from '@/utils/format';
import { Badge, Field, SectionTitle } from '../ui/primitives';

export type InfoFocus = 'all' | 'frame-rate' | 'resolution' | 'duration' | 'audio';

/** Structured, read-only display of probe results. Shared by tool pages and the editor inspector. */
export function MediaInfoView({ info, focus = 'all', fileName }: { info: MediaInfo; focus?: InfoFocus; fileName?: string }) {
  const show = (f: InfoFocus) => focus === 'all' || focus === f;
  return (
    <div className="text-sm">
      <SectionTitle>General</SectionTitle>
      <dl className="px-3">
        {fileName && <Field label="File">{fileName}</Field>}
        <Field label="Container">{info.container}</Field>
        <Field label="MIME type">{info.mimeType}</Field>
        <Field label="Size">{formatBytes(info.size)}</Field>
        {info.kind !== 'image' && (
          <Field label="Duration">
            {formatDuration(info.duration, 3)}
            {info.durationSource === 'computed' && <span className="ml-1 text-faint">(from packets)</span>}
          </Field>
        )}
        {info.bitrate != null && <Field label="Overall bitrate">{formatBitrate(info.bitrate)}</Field>}
        {info.width > 0 && (
          <Field label="Dimensions">
            {info.width} × {info.height} <span className="text-faint">({formatAspectRatio(info.width, info.height)})</span>
          </Field>
        )}
        {Object.entries(info.tags).map(([k, val]) => (
          <Field key={k} label={k[0]!.toUpperCase() + k.slice(1)}>
            {String(val)}
          </Field>
        ))}
      </dl>

      {info.video.map((t, i) => (
        <div key={`v${t.id}`}>
          <SectionTitle aside={!t.decodable ? <Badge tone="warn">Not decodable here</Badge> : <Badge tone="ok">Decodable</Badge>}>
            Video track {info.video.length > 1 ? i + 1 : ''}
          </SectionTitle>
          <dl className="px-3">
            <Field label="Codec">
              {codecLabel(t.codec)} {t.codecString && <span className="text-faint">({t.codecString})</span>}
            </Field>
            {show('resolution') && (
              <>
                <Field label="Display size">
                  {t.displayWidth} × {t.displayHeight}
                </Field>
                <Field label="Coded size">
                  {t.codedWidth} × {t.codedHeight}
                </Field>
                <Field label="Rotation">{t.rotation}°</Field>
                <Field label="Pixel aspect">
                  {t.pixelAspectRatio.num}:{t.pixelAspectRatio.den}
                </Field>
                <Field label="Aspect ratio">{formatAspectRatio(t.displayWidth, t.displayHeight)}</Field>
              </>
            )}
            {show('frame-rate') && t.frameRate && (
              <>
                <Field label="Frame rate">{formatFps(t.frameRate.bestGuess)}</Field>
                <Field label="Frame-rate mode">
                  {t.frameRate.isConstant ? 'Constant (CFR)' : 'Variable (VFR)'}
                </Field>
                {(!t.frameRate.isConstant || focus === 'frame-rate') && (
                  <>
                    <Field label="Average">{formatFps(t.frameRate.average)}</Field>
                    <Field label="Range">
                      {formatFps(t.frameRate.min)} – {formatFps(t.frameRate.max)}
                    </Field>
                  </>
                )}
                {focus === 'frame-rate' && info.duration > 0 && (
                  <Field label="Approx. frame count">{Math.round(t.frameRate.average * t.duration).toLocaleString()}</Field>
                )}
              </>
            )}
            {show('duration') && <Field label="Track duration">{formatDuration(t.duration, 3)}</Field>}
            <Field label="Bitrate">{formatBitrate(t.bitrate)}</Field>
            {focus === 'all' && (
              <>
                <Field label="HDR">{t.hdr ? 'Yes' : 'No'}</Field>
                <Field label="Alpha channel">{t.canBeTransparent ? 'Possible' : 'No'}</Field>
                <Field label="Language">{t.languageCode}</Field>
              </>
            )}
          </dl>
        </div>
      ))}

      {(focus === 'all' || focus === 'audio' || focus === 'duration') &&
        info.audio.map((t, i) => (
          <div key={`a${t.id}`}>
            <SectionTitle aside={!t.decodable ? <Badge tone="warn">Not decodable here</Badge> : <Badge tone="ok">Decodable</Badge>}>
              Audio track {info.audio.length > 1 ? i + 1 : ''}
            </SectionTitle>
            <dl className="px-3">
              <Field label="Codec">
                {codecLabel(t.codec)} {t.codecString && <span className="text-faint">({t.codecString})</span>}
              </Field>
              <Field label="Channels">{t.channels === 1 ? 'Mono' : t.channels === 2 ? 'Stereo' : `${t.channels} channels`}</Field>
              <Field label="Sample rate">{t.sampleRate.toLocaleString()} Hz</Field>
              <Field label="Bitrate">{formatBitrate(t.bitrate)}</Field>
              <Field label="Duration">{formatDuration(t.duration, 3)}</Field>
              <Field label="Language">{t.languageCode}</Field>
            </dl>
          </div>
        ))}

      {info.kind === 'video' && info.audio.length === 0 && (
        <p className="px-3 pt-3 text-xs text-muted">This file has no audio track.</p>
      )}

      {info.warnings.length > 0 && (
        <div className="m-3 space-y-1 rounded-md border border-warn/30 bg-warn/10 p-2.5 text-xs text-warn">
          {info.warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </div>
      )}
    </div>
  );
}
