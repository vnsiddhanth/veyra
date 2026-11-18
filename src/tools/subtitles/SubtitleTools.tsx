/** Subtitle editor (timing + text with live preview, SRT/VTT export) and soft-subtitle muxing. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/primitives';
import { mediaEngine, type ConvertResult } from '@/media-engine';
import { parseSubtitles, sanitizeCueText, toSrt, toVtt, type SubtitleCue } from '@/media-engine/subtitles/parse';
import type { ToolDef } from '../registry';
import { Panel, SelectField, TextField } from '../shared/controls';
import { baseName, ConvertResultCard, ErrorBox, JobArea, SourceDrop, SourceGate, SourceHeader, useObjectUrl, VIDEO_ACCEPT } from '../shared/ToolParts';
import { useMediaJob } from '../shared/useMediaJob';
import { useSource } from '../shared/useSource';

const SUB_ACCEPT = '.srt,.vtt,text/vtt,application/x-subrip';

function fmt(t: number): string {
  const ms = Math.round(t * 1000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${h ? `${h}:` : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(s).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
}
function parseTime(s: string): number | null {
  const m = /^(?:(\d+):)?(\d+):(\d+(?:[.,]\d+)?)$|^(\d+(?:\.\d+)?)$/.exec(s.trim());
  if (!m) return null;
  if (m[4]) return Number(m[4]);
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]!.replace(',', '.'));
}

function TimeCell({ value, onChange, label }: { value: number; onChange(v: number): void; label: string }) {
  const [text, setText] = useState(fmt(value));
  useEffect(() => setText(fmt(value)), [value]);
  return (
    <input
      value={text}
      aria-label={label}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const t = parseTime(text);
        if (t == null || t < 0) setText(fmt(value));
        else onChange(t);
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      className="h-7 w-24 rounded-sm border border-line bg-surface-2 px-1 font-mono text-xs tabular"
    />
  );
}

export function SubtitleEditorTool() {
  const video = useSource(true);
  const [cues, setCues] = useState<SubtitleCue[]>([]);
  const [name, setName] = useState('subtitles');
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [shift, setShift] = useState('0');
  const videoRef = useRef<HTMLVideoElement>(null);
  const active = cues.find((c) => now >= c.start && now < c.end);

  const load = async (f: File) => {
    try {
      const r = parseSubtitles(await f.text());
      setCues(r.cues);
      setName(baseName(f.name));
      setError(r.cues.length ? null : 'No cues found in this file.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const update = (i: number, patch: Partial<SubtitleCue>) => setCues((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const sorted = () => setCues((cs) => [...cs].sort((a, b) => a.start - b.start));
  const problems = useMemo(() => cues.map((c, i) => (c.end <= c.start ? 'ends before it starts' : i > 0 && c.start < cues[i - 1]!.end ? 'overlaps the previous cue' : null)), [cues]);

  const download = (kind: 'srt' | 'vtt') => {
    const text = kind === 'srt' ? toSrt(cues) : toVtt(cues);
    // Validate by parsing our own output before offering it.
    const back = parseSubtitles(text);
    if (back.cues.length !== cues.length) return setError('The exported file did not parse back correctly; nothing was saved.');
    const blob = new Blob([text], { type: kind === 'srt' ? 'application/x-subrip' : 'text/vtt' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${name}.${kind}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          {video.source.status === 'ready' ? (
            <div className="space-y-2">
              <SourceHeader file={video.source.file} info={video.source.info} onChange={video.clear} />
              <div className="relative">
                <video ref={videoRef} src={video.source.url} controls className="w-full rounded-lg bg-black" onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)} onSeeked={(e) => setNow(e.currentTarget.currentTime)} aria-label="Video preview" />
                {active && (
                  <p className="pointer-events-none absolute inset-x-4 bottom-12 whitespace-pre-wrap text-center text-lg font-semibold text-white [text-shadow:0_0_4px_#000,0_0_2px_#000]" aria-live="polite">
                    {active.text.replace(/<\/?[biu]>/gi, '')}
                  </p>
                )}
              </div>
            </div>
          ) : video.source.status === 'empty' ? (
            <SourceDrop onFile={video.open} accept={VIDEO_ACCEPT} label="Drop a video to preview timing (optional)" />
          ) : (
            <SourceGate source={video.source} open={video.open} clear={video.clear} accept={VIDEO_ACCEPT} />
          )}
        </div>
        <div className="space-y-2">
          <SourceDrop onFile={(f) => void load(f)} accept={SUB_ACCEPT} label={cues.length ? `${cues.length} cues loaded — drop another file to replace` : 'Drop an .srt or .vtt file (or start empty below)'} />
          {error && <ErrorBox error={error} />}
        </div>
      </div>
      <Panel>
        <TextField label="File name" value={name} onChange={setName} />
        <div className="flex items-end gap-2">
          <TextField label="Shift all cues by (s)" value={shift} onChange={setShift} />
          <Button
            size="sm"
            onClick={() => {
              const d = Number(shift);
              if (Number.isFinite(d)) setCues((cs) => cs.map((c) => ({ start: Math.max(0, c.start + d), end: Math.max(0.001, c.end + d), text: c.text })));
            }}
          >
            Shift
          </Button>
        </div>
        <div className="flex items-end gap-2">
          <Button
            size="sm"
            onClick={() => {
              const t = videoRef.current?.currentTime ?? (cues.at(-1)?.end ?? 0);
              setCues((cs) => [...cs, { start: t, end: t + 2, text: 'New subtitle' }].sort((a, b) => a.start - b.start));
            }}
          >
            + Add cue at {fmt(videoRef.current?.currentTime ?? now)}
          </Button>
          <Button size="sm" variant="ghost" onClick={sorted}>
            Sort by time
          </Button>
        </div>
      </Panel>
      {cues.length > 0 && (
        <ol className="max-h-[480px] space-y-1 overflow-y-auto" aria-label="Subtitle cues">
          {cues.map((c, i) => (
            <li key={i} className={`grid grid-cols-[2rem_auto_auto_1fr_auto] items-start gap-2 rounded-md border p-2 text-sm ${c === active ? 'border-accent bg-accent-soft/30' : 'border-line bg-surface'}`}>
              <button type="button" className="pt-1 text-xs text-faint hover:text-accent" aria-label={`Play cue ${i + 1}`} onClick={() => videoRef.current && (videoRef.current.currentTime = c.start)}>
                {i + 1}
              </button>
              <TimeCell label={`Cue ${i + 1} start`} value={c.start} onChange={(v) => update(i, { start: v })} />
              <TimeCell label={`Cue ${i + 1} end`} value={c.end} onChange={(v) => update(i, { end: v })} />
              <div>
                <textarea value={c.text} rows={Math.min(3, c.text.split('\n').length)} aria-label={`Cue ${i + 1} text`} onChange={(e) => update(i, { text: sanitizeCueText(e.target.value) })} className="w-full rounded-sm border border-line bg-surface-2 p-1 text-sm" />
                {problems[i] && <p className="text-xs text-warn">This cue {problems[i]}.</p>}
              </div>
              <button type="button" className="pt-1 text-faint hover:text-danger" aria-label={`Delete cue ${i + 1}`} onClick={() => setCues((cs) => cs.filter((_, j) => j !== i))}>
                ×
              </button>
            </li>
          ))}
        </ol>
      )}
      <div className="flex gap-2">
        <Button variant="primary" onClick={() => download('srt')} disabled={!cues.length}>
          Download .srt
        </Button>
        <Button onClick={() => download('vtt')} disabled={!cues.length}>
          Download .vtt
        </Button>
      </div>
    </div>
  );
}

export function SoftSubtitlesTool({ tool }: { tool: ToolDef }) {
  void tool;
  const video = useSource(true);
  const job = useMediaJob<ConvertResult>((r) => void mediaEngine.releaseOutput(r));
  const [cues, setCues] = useState<SubtitleCue[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [lang, setLang] = useState('eng');
  const [label, setLabel] = useState('English');
  const [container, setContainer] = useState<'mp4' | 'mkv' | 'webm'>('mp4');
  const info = video.source.status === 'ready' ? video.source.info : null;
  useEffect(() => {
    if (info?.mimeType.includes('webm')) setContainer('webm');
  }, [info]);
  if (video.source.status !== 'ready' || !info) return <SourceGate source={video.source} open={video.open} clear={video.clear} accept={VIDEO_ACCEPT} />;
  return (
    <div className="space-y-4">
      <SourceHeader file={video.source.file} info={info} onChange={() => (job.reset(), video.clear())} disabled={job.state.status === 'running'} />
      {cues ? (
        <p className="text-sm">
          {cues.length} cues ready.{' '}
          <button className="text-accent hover:underline" onClick={() => setCues(null)}>
            Use another file
          </button>
        </p>
      ) : (
        <SourceDrop
          onFile={async (f) => {
            try {
              const r = parseSubtitles(await f.text());
              if (!r.cues.length) throw new Error('No cues found.');
              setCues(r.cues);
              setErr(null);
            } catch (e) {
              setErr(e instanceof Error ? e.message : String(e));
            }
          }}
          accept={SUB_ACCEPT}
          label="Drop the .srt or .vtt to attach"
        />
      )}
      {err && <ErrorBox error={err} />}
      <Panel>
        <SelectField
          label="Language"
          value={lang}
          onChange={(v) => {
            setLang(v);
            setLabel({ eng: 'English', spa: 'Español', fra: 'Français', deu: 'Deutsch', hin: 'हिन्दी', jpn: '日本語', por: 'Português', ita: 'Italiano', und: 'Subtitles' }[v] ?? v);
          }}
          options={[
            ['eng', 'English'],
            ['spa', 'Spanish'],
            ['fra', 'French'],
            ['deu', 'German'],
            ['hin', 'Hindi'],
            ['jpn', 'Japanese'],
            ['por', 'Portuguese'],
            ['ita', 'Italian'],
            ['und', 'Other / undetermined'],
          ]}
        />
        <TextField label="Track name" value={label} onChange={setLabel} />
        <SelectField
          label="Output format"
          value={container}
          onChange={setContainer}
          options={[
            ['mp4', 'MP4'],
            ['mkv', 'MKV'],
            ['webm', 'WebM'],
          ]}
          hint="Video and audio are copied without re-encoding."
        />
      </Panel>
      <JobArea
        state={job.state}
        onCancel={job.cancel}
        label="Muxing"
        action="Add subtitle track"
        disabledReason={!cues ? 'Add a subtitle file.' : null}
        onRun={() => cues && job.run(() => mediaEngine.softSubtitles(video.source.status === 'ready' ? video.source.file : new Blob(), { vtt: toVtt(cues), container, languageCode: lang, label, fileName: `${baseName(video.source.status === 'ready' ? video.source.file.name : 'video')}-subtitled` }))}
        done={(r) => <ConvertResultCard result={r} onReset={job.reset} resetLabel="Change settings" />}
      />
    </div>
  );
}

export { useObjectUrl };
