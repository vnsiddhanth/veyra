import { MediaInfoView } from '@/components/media/MediaInfoView';
import { Field, SectionTitle } from '@/components/ui/primitives';
import type { Project } from '@/project/schema/types';
import { useLibraryStore } from '@/state/library-store';
import { selectProject, useProjectStore } from '@/state/project-store';
import { formatBytes, formatDate } from '@/utils/format';
import { COMMON_FRAME_RATES, formatTimecode, rateToNumber } from '@/utils/time';
import { useEditorUi } from '../editor-ui-store';

const RESOLUTIONS: Array<[string, number, number]> = [
  ['4K UHD 3840×2160', 3840, 2160],
  ['1440p 2560×1440', 2560, 1440],
  ['1080p 1920×1080', 1920, 1080],
  ['720p 1280×720', 1280, 720],
  ['Vertical 1080×1920', 1080, 1920],
  ['Square 1080×1080', 1080, 1080],
  ['Portrait 1080×1350', 1080, 1350],
];

export function Inspector() {
  const project = useProjectStore(selectProject);
  const selectedAssetId = useLibraryStore((s) => s.selectedAssetId);
  const selectedClipIds = useEditorUi((s) => s.selectedClipIds);
  if (!project) return null;
  const clip = selectedClipIds.length === 1 ? project.clips[selectedClipIds[0]!] : undefined;
  const asset = project.assets.find((a) => a.id === (clip?.assetId ?? selectedAssetId));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-8 shrink-0 items-center border-b border-line px-3">
        <h2 className="text-xs font-semibold">{clip ? 'Clip' : asset ? 'Media' : 'Project'}</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        {clip && (
          <>
            <SectionTitle>Clip</SectionTitle>
            <dl className="px-3">
              <Field label="Name">{clip.name}</Field>
              <Field label="Start">{formatTimecode(clip.start, project.settings.frameRate)}</Field>
              <Field label="Duration">{formatTimecode(clip.duration, project.settings.frameRate)}</Field>
              <Field label="Source in">{formatTimecode(clip.sourceIn, project.settings.frameRate)}</Field>
              <Field label="Speed">{clip.speed}×</Field>
            </dl>
            <p className="px-3 pt-2 text-2xs leading-relaxed text-faint">Transform, effects, audio and keyframe controls arrive with the compositor and pro-editing phases (5–6).</p>
          </>
        )}
        {asset ? (
          <>
            {asset.info ? (
              <MediaInfoView info={asset.info} fileName={asset.fileName} />
            ) : (
              <>
                <SectionTitle>Subtitles</SectionTitle>
                <dl className="px-3">
                  <Field label="File">{asset.fileName}</Field>
                  <Field label="Cues">{asset.subtitles?.length ?? 0}</Field>
                  <Field label="Size">{formatBytes(asset.size)}</Field>
                </dl>
              </>
            )}
            <dl className="px-3 pt-2">
              <Field label="Added">{formatDate(asset.addedAt)}</Field>
            </dl>
          </>
        ) : (
          !clip && <ProjectSettings project={project} />
        )}
      </div>
    </div>
  );
}

function ProjectSettings({ project }: { project: Project }) {
  const s = project.settings;
  const apply = useProjectStore((st) => st.apply);
  const resKey = `${s.width}x${s.height}`;
  const fpsKey = `${s.frameRate.num}/${s.frameRate.den}`;
  const hasClips = Object.keys(project.clips).length > 0;
  return (
    <div>
      <SectionTitle>Format</SectionTitle>
      <div className="space-y-2 px-3 text-xs">
        <label className="block">
          <span className="mb-1 block text-muted">Resolution</span>
          <select
            value={resKey}
            onChange={(e) => {
              const [w, h] = e.target.value.split('x').map(Number);
              apply((p) => ({ ...p, settings: { ...p.settings, width: w!, height: h! } }));
            }}
            className="h-7 w-full rounded-sm border border-line bg-surface-2 px-1.5"
          >
            {!RESOLUTIONS.some(([, w, h]) => `${w}x${h}` === resKey) && <option value={resKey}>Custom {s.width}×{s.height}</option>}
            {RESOLUTIONS.map(([label, w, h]) => (
              <option key={label} value={`${w}x${h}`}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-muted">Frame rate</span>
          <select
            value={fpsKey}
            onChange={(e) => {
              const [num, den] = e.target.value.split('/').map(Number);
              apply((p) => ({ ...p, settings: { ...p.settings, frameRate: { num: num!, den: den! } } }));
            }}
            className="h-7 w-full rounded-sm border border-line bg-surface-2 px-1.5"
          >
            {!COMMON_FRAME_RATES.some((r) => `${r.rate.num}/${r.rate.den}` === fpsKey) && <option value={fpsKey}>{rateToNumber(s.frameRate).toFixed(3)} fps</option>}
            {COMMON_FRAME_RATES.map((r) => (
              <option key={r.label} value={`${r.rate.num}/${r.rate.den}`}>
                {r.label} fps
              </option>
            ))}
          </select>
          {hasClips && <span className="mt-1 block text-2xs text-faint">Changing the frame rate keeps clip times; new edits snap to the new frame grid.</span>}
        </label>
      </div>
      <SectionTitle>Project</SectionTitle>
      <dl className="px-3">
        <Field label="Media">{project.assets.length}</Field>
        <Field label="Tracks">{project.tracks.length}</Field>
        <Field label="Clips">{Object.keys(project.clips).length}</Field>
        <Field label="Created">{formatDate(project.createdAt)}</Field>
      </dl>
      <p className="px-3 pt-3 text-2xs leading-relaxed text-faint">
        Projects save automatically in this browser. Media files stay on your disk and are referenced, never copied or uploaded.
      </p>
    </div>
  );
}
