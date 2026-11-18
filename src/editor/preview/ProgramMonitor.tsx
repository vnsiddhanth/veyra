/**
 * Program monitor: the composed timeline at the playhead, rendered by the preview worker with the
 * export compositor. Playback is clocked by Web Audio.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, IconButton } from '@/components/ui/primitives';
import { mediaEngine } from '@/media-engine';
import { useLibraryStore } from '@/state/library-store';
import { selectProject, useProjectStore } from '@/state/project-store';
import { projectDuration } from '@/timeline/model/ops';
import { flicksToSeconds, formatTimecode } from '@/utils/time';
import { useEditorUi } from '../editor-ui-store';
import { goToEnd, jumpToEdit, stepFrames } from '../timeline/commands';
import { PreviewEngine, type PreviewStats } from './preview-engine';
import { GetStarted } from '../GetStarted';

const QUALITY: [string, number][] = [
  ['Full', 1],
  ['1/2', 0.5],
  ['1/4', 0.25],
];

export function ProgramMonitor() {
  const project = useProjectStore(selectProject);
  const originals = useLibraryStore((s) => s.files);
  const proxies = useLibraryStore((s) => s.proxies);
  const useProxies = useEditorUi((s) => s.useProxies);
  const files = useMemo(() => (useProxies ? { ...originals, ...Object.fromEntries(Object.entries(proxies).filter(([id]) => !!originals[id])) } : originals), [originals, proxies, useProxies]);
  const filesRef = useRef(files);
  filesRef.current = files;
  const playing = useEditorUi((s) => s.playing);
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<PreviewEngine | null>(null);
  const [quality, setQuality] = useState(0.5);
  const qualityRef = useRef(quality);
  qualityRef.current = quality;
  const [warnings, setWarnings] = useState<string[]>([]);
  const [stats, setStats] = useState<PreviewStats | null>(null);
  const [generation, setGeneration] = useState(0);
  const projectId = project?.id;
  const aspect = project ? project.settings.width / project.settings.height : 16 / 9;

  // One engine (worker + transferred canvas) per open project.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !projectId) return;
    const canvas = document.createElement('canvas');
    canvas.className = 'block h-full w-full object-contain';
    canvas.setAttribute('aria-label', 'Program monitor');
    canvas.setAttribute('role', 'img');
    host.appendChild(canvas);
    const engine = new PreviewEngine(canvas);
    engineRef.current = engine;
    if (import.meta.env.DEV) (window as unknown as { __veyraPreview?: PreviewEngine }).__veyraPreview = engine;
    engine.onTime = (t) => useEditorUi.getState().setPlayhead(t);
    engine.onEnded = () => useEditorUi.getState().setPlaying(false);
    engine.onWarnings = setWarnings;
    engine.onStats = setStats;
    engine.onCrash = (msg) => {
      useEditorUi.getState().notify(`Preview restarted after an error: ${msg}`);
      setGeneration((g) => g + 1);
    };
    const st = useProjectStore.getState().history?.present;
    if (st) {
      engine.setProject(st, flicksToSeconds(projectDuration(st)));
      engine.setFiles(Object.fromEntries(Object.entries(filesRef.current).filter(([, f]) => !!f)) as Record<string, Blob>);
      engine.setQuality(qualityRef.current);
      engine.seek(useEditorUi.getState().playhead);
    }
    return () => {
      engine.dispose();
      engineRef.current = null;
      canvas.remove();
      useEditorUi.getState().setPlaying(false);
    };
  }, [projectId, generation]);

  useEffect(() => {
    const e = engineRef.current;
    if (!e || !project) return;
    e.setProject(project, flicksToSeconds(projectDuration(project)));
    if (!e.isPlaying) e.seek(useEditorUi.getState().playhead);
  }, [project]);

  useEffect(() => {
    engineRef.current?.setFiles(Object.fromEntries(Object.entries(files).filter(([, f]) => !!f)) as Record<string, Blob>);
    if (!engineRef.current?.isPlaying) engineRef.current?.seek(useEditorUi.getState().playhead);
  }, [files]);

  useEffect(() => {
    engineRef.current?.setQuality(quality);
    if (!engineRef.current?.isPlaying) engineRef.current?.seek(useEditorUi.getState().playhead);
  }, [quality]);

  useEffect(() => {
    const e = engineRef.current;
    if (!e) return;
    mediaEngine.setBackgroundPaused(playing);
    if (playing && !e.isPlaying) e.play(useEditorUi.getState().playhead);
    else if (!playing && e.isPlaying) e.stop();
  }, [playing]);

  // Paused scrubbing: show the frame at the playhead. Subscribed outside render so playback does not
  // re-render the monitor every frame.
  useEffect(
    () =>
      useEditorUi.subscribe((st, prev) => {
        const e = engineRef.current;
        if (st.playhead !== prev.playhead && e && !e.isPlaying) e.seek(st.playhead);
      }),
    [],
  );

  if (!project) return null;
  const total = projectDuration(project);
  const empty = Object.keys(project.clips).length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black p-2">
        <div ref={hostRef} className="relative max-h-full max-w-full" style={{ aspectRatio: `${aspect}`, height: '100%' }} />
        {empty && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-auto p-3">
            <GetStarted project={project} />
          </div>
        )}
        {warnings.length > 0 && (
          <ul className="absolute left-2 top-2 max-w-[70%] space-y-1 text-2xs" role="status">
            {warnings.slice(0, 3).map((w) => (
              <li key={w} className="rounded bg-warn/90 px-2 py-0.5 text-black">
                {w}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex min-h-9 shrink-0 flex-wrap items-center gap-1 border-t border-line px-2 py-0.5 text-xs">
        <IconButton label="Go to start (Home)" onClick={() => goToEnd(false)}>
          ⏮
        </IconButton>
        <IconButton label="Previous edit (↑)" onClick={() => jumpToEdit(-1)}>
          ⇤
        </IconButton>
        <IconButton label="Previous frame (←)" onClick={() => stepFrames(-1)}>
          ◂
        </IconButton>
        <Button size="sm" variant="primary" onClick={() => useEditorUi.getState().setPlaying(!playing)} aria-label={playing ? 'Pause (Space)' : 'Play (Space)'} className="w-16">
          {playing ? 'Pause' : 'Play'}
        </Button>
        <IconButton label="Next frame (→)" onClick={() => stepFrames(1)}>
          ▸
        </IconButton>
        <IconButton label="Next edit (↓)" onClick={() => jumpToEdit(1)}>
          ⇥
        </IconButton>
        <IconButton label="Go to end (End)" onClick={() => goToEnd(true)}>
          ⏭
        </IconButton>
        <span className="ml-2 font-mono tabular" aria-label="Playhead timecode">
          <MonitorTimecode project={project} />
        </span>
        <span className="font-mono text-faint tabular">/ {formatTimecode(total, project.settings.frameRate)}</span>
        {playing && stats && (
          <span className="ml-2 font-mono text-2xs text-faint tabular" title="Frames shown per second · worker render time · frames skipped">
            {stats.fps} fps · {stats.renderMs.toFixed(1)} ms · {stats.dropped} skipped
          </span>
        )}
        {Object.keys(proxies).length > 0 && (
          <label className="ml-auto flex items-center gap-1 text-2xs text-faint" title="Preview from 540p proxies. Export always uses the original media.">
            <input type="checkbox" checked={useProxies} onChange={(e) => useEditorUi.getState().setUseProxies(e.target.checked)} className="accent-[var(--c-accent)]" />
            Proxies
          </label>
        )}
        <label className={`${Object.keys(proxies).length > 0 ? 'ml-2' : 'ml-auto'} flex items-center gap-1 text-2xs text-faint`}>
          Preview
          <select value={quality} onChange={(e) => setQuality(Number(e.target.value))} className="h-6 rounded-sm border border-line bg-surface-2 px-1" aria-label="Preview quality">
            {QUALITY.map(([l, v]) => (
              <option key={l} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

function MonitorTimecode({ project }: { project: { settings: { frameRate: { num: number; den: number } } } }) {
  const playhead = useEditorUi((s) => s.playhead);
  return <>{formatTimecode(playhead, project.settings.frameRate)}</>;
}
