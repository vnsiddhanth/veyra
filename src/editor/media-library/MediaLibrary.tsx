import { useEffect, useMemo, useRef, useState } from 'react';
import { FileDrop, pickFiles } from '@/components/ui/FileDrop';
import { IconAlert, IconCaptions, IconFilm, IconImage, IconLink, IconMusic, IconSearch, IconUpload, IconX } from '@/components/ui/icons';
import { Button, EmptyState, IconButton, Progress } from '@/components/ui/primitives';
import { ACCEPT_ATTRIBUTE } from '@/media-engine';
import type { Asset } from '@/project/schema/types';
import { assetStatus, useLibraryStore } from '@/state/library-store';
import { importFiles, reconnectMedia, relinkAsset, removeAsset, renameAsset } from '@/state/media-actions';
import { selectProject, useProjectStore } from '@/state/project-store';
import { formatBytes, formatDuration } from '@/utils/format';
import { cn } from '@/utils/id';
import { useEditorUi } from '../editor-ui-store';
import { appendToTimeline } from '../timeline/timeline-actions';

type SortKey = 'added' | 'name' | 'duration' | 'size';
type KindFilter = 'all' | Asset['kind'];

const KIND_ICON = { video: IconFilm, audio: IconMusic, image: IconImage, subtitle: IconCaptions } as const;

export function MediaLibrary() {
  const project = useProjectStore(selectProject);
  const imports = useLibraryStore((s) => s.imports);
  const files = useLibraryStore((s) => s.files);
  const errors = useLibraryStore((s) => s.errors);
  const importRequest = useEditorUi((s) => s.importRequest);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('added');
  const [kind, setKind] = useState<KindFilter>('all');
  const pickerOpen = useRef<() => void>(() => undefined);

  useEffect(() => {
    if (importRequest > 0) pickerOpen.current();
  }, [importRequest]);

  const assets = useMemo(() => {
    if (!project) return [];
    const q = query.trim().toLowerCase();
    const list = project.assets.filter((a) => (kind === 'all' || a.kind === kind) && (!q || a.name.toLowerCase().includes(q) || a.fileName.toLowerCase().includes(q)));
    const cmp: Record<SortKey, (a: Asset, b: Asset) => number> = {
      added: (a, b) => a.addedAt - b.addedAt,
      name: (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }),
      duration: (a, b) => (b.info?.duration ?? 0) - (a.info?.duration ?? 0),
      size: (a, b) => b.size - a.size,
    };
    return [...list].sort(cmp[sort]);
  }, [project, query, sort, kind]);

  if (!project) return null;
  const offlineCount = project.assets.filter((a) => a.kind !== 'subtitle' && assetStatus(a.id, { files, errors }) === 'offline').length;

  const onImport = (entries: Parameters<typeof importFiles>[0]) => {
    void importFiles(entries).then((failures) => {
      if (failures.length) useEditorUi.getState().notify(`${failures.length} file${failures.length > 1 ? 's' : ''} could not be imported.`);
    });
  };

  return (
    <FileDrop onFiles={onImport} className="flex min-h-0 flex-1 flex-col" accept={ACCEPT_ATTRIBUTE}>
      {({ dragging, open }) => {
        pickerOpen.current = open;
        return (
          <div className={cn('relative flex min-h-0 flex-1 flex-col', dragging && 'bg-accent-soft/40')} onFocusCapture={() => useEditorUi.getState().setFocusArea('library')}>
            <div className="flex items-center gap-1 border-b border-line px-2 py-1.5">
              <h2 className="px-1 text-xs font-semibold">Media</h2>
              <span className="text-2xs text-faint">{project.assets.length}</span>
              <Button size="sm" variant="primary" className="ml-auto" onClick={open} title="Import media (Ctrl+I)">
                <IconUpload /> Import
              </Button>
            </div>

            {project.assets.length > 0 && (
              <div className="space-y-1.5 border-b border-line p-2">
                <label className="relative block">
                  <span className="sr-only">Search media</span>
                  <IconSearch size={14} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-faint" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search"
                    className="h-7 w-full rounded-sm border border-line bg-surface-2 pl-7 pr-2 text-xs placeholder:text-faint focus:border-accent focus:outline-none"
                  />
                </label>
                <div className="flex gap-1">
                  <select value={kind} onChange={(e) => setKind(e.target.value as KindFilter)} aria-label="Filter by type" className="h-6 flex-1 rounded-sm border border-line bg-surface-2 px-1 text-2xs text-muted">
                    <option value="all">All types</option>
                    <option value="video">Video</option>
                    <option value="audio">Audio</option>
                    <option value="image">Images</option>
                    <option value="subtitle">Subtitles</option>
                  </select>
                  <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort by" className="h-6 flex-1 rounded-sm border border-line bg-surface-2 px-1 text-2xs text-muted">
                    <option value="added">Date added</option>
                    <option value="name">Name</option>
                    <option value="duration">Duration</option>
                    <option value="size">Size</option>
                  </select>
                </div>
              </div>
            )}

            {offlineCount > 0 && (
              <div className="flex items-center gap-2 border-b border-line bg-warn/10 px-3 py-2 text-xs text-warn">
                <IconLink size={14} className="shrink-0" />
                <span className="flex-1">
                  {offlineCount} file{offlineCount > 1 ? 's' : ''} need{offlineCount > 1 ? '' : 's'} reconnecting.
                </span>
                <Button
                  size="sm"
                  onClick={async () => {
                    const left = await reconnectMedia(project, true);
                    if (left > 0) useEditorUi.getState().notify(`${left} file${left > 1 ? 's' : ''} still offline. Use “Locate” on each one to pick it again.`);
                  }}
                >
                  Reconnect
                </Button>
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto">
              {imports.length > 0 && (
                <ul className="space-y-1 border-b border-line p-2">
                  {imports.map((t) => (
                    <li key={t.id} className="rounded-sm bg-surface-2 px-2 py-1.5">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="min-w-0 flex-1 truncate">{t.name}</span>
                        {t.error && (
                          <button type="button" aria-label="Dismiss" className="text-faint hover:text-fg" onClick={() => useLibraryStore.getState().removeImport(t.id)}>
                            <IconX size={12} />
                          </button>
                        )}
                      </div>
                      {t.error ? <p className="mt-0.5 text-2xs text-danger">{t.error}</p> : <Progress className="mt-1" value={t.progress > 0 ? t.progress : null} label={`Importing ${t.name}`} />}
                    </li>
                  ))}
                </ul>
              )}
              {project.assets.length === 0 && imports.length === 0 ? (
                <EmptyState icon={<IconUpload size={22} />} title={dragging ? 'Drop to import' : 'Import media'} action={<Button onClick={open}>Choose files</Button>}>
                  Drag video, audio, images or subtitles here. Files stay on your disk and are referenced by the project.
                </EmptyState>
              ) : (
                <ul className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2 p-2">
                  {assets.map((a) => (
                    <AssetCard key={a.id} asset={a} />
                  ))}
                </ul>
              )}
              {project.assets.length > 0 && assets.length === 0 && <p className="p-4 text-center text-xs text-muted">No media matches.</p>}
            </div>
            {dragging && <div className="pointer-events-none absolute inset-1 rounded-md border-2 border-dashed border-accent" />}
          </div>
        );
      }}
    </FileDrop>
  );
}

function selectAsset(id: string) {
  useLibraryStore.getState().select(id);
  useEditorUi.getState().selectClips([]);
}

function AssetCard({ asset }: { asset: Asset }) {
  const thumbs = useLibraryStore((s) => s.thumbs[asset.id]);
  const status = useLibraryStore((s) => assetStatus(asset.id, s));
  const error = useLibraryStore((s) => s.errors[asset.id]);
  const selected = useLibraryStore((s) => s.selectedAssetId === asset.id);
  const [renaming, setRenaming] = useState(false);
  const relinkInput = useRef<HTMLInputElement>(null);
  const Icon = KIND_ICON[asset.kind];
  const duration = asset.info?.duration;

  const relink = async (file: File, handle?: FileSystemFileHandle) => {
    try {
      const { warning } = await relinkAsset(asset, file, handle);
      useEditorUi.getState().notify(warning ?? `Reconnected “${asset.name}”.`);
    } catch (e) {
      useEditorUi.getState().notify(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        aria-label={`${asset.name}${status === 'offline' && asset.kind !== 'subtitle' ? ' (offline)' : ''}`}
        onClick={() => selectAsset(asset.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') selectAsset(asset.id);
          if (e.key === 'F2') setRenaming(true);
        }}
        onDoubleClick={() => setRenaming(true)}
        className={cn('group block w-full cursor-default rounded-md border p-1 text-left outline-none', selected ? 'border-accent bg-surface-3' : 'border-transparent hover:bg-surface-2')}
      >
        <div className="relative aspect-video overflow-hidden rounded-sm bg-black/60">
          {thumbs?.[0] ? (
            <img src={thumbs[0]} alt="" className={cn('h-full w-full object-contain', status !== 'online' && 'opacity-40 grayscale')} draggable={false} />
          ) : (
            <div className="flex h-full items-center justify-center text-faint">
              <Icon size={22} />
            </div>
          )}
          {duration ? <span className="absolute bottom-0.5 right-0.5 rounded-sm bg-black/75 px-1 font-mono text-2xs text-white tabular">{formatDuration(duration, 0)}</span> : null}
          {asset.kind !== 'subtitle' && status === 'offline' && (
            <span className="absolute left-0.5 top-0.5 flex items-center gap-1 rounded-sm bg-warn px-1 text-2xs font-medium text-black">
              <IconLink size={10} /> Offline
            </span>
          )}
          {status === 'error' && (
            <span className="absolute left-0.5 top-0.5 rounded-sm bg-danger px-1 text-2xs text-white" title={error}>
              <IconAlert size={10} />
            </span>
          )}
          <div className={cn('absolute right-0.5 top-0.5 gap-0.5 group-hover:flex group-focus-within:flex', selected ? 'flex' : 'hidden')}>
            {status === 'online' && asset.kind !== 'subtitle' && (
              <IconButton
                label="Append to timeline"
                className="h-5 w-5 bg-black/70 text-white"
                onClick={(e) => {
                  e.stopPropagation();
                  appendToTimeline(asset.id);
                }}
              >
                +
              </IconButton>
            )}
            <IconButton
              label="Remove from project"
              className="h-5 w-5 bg-black/70 text-white"
              onClick={(e) => {
                e.stopPropagation();
                removeAsset(asset.id);
                useEditorUi.getState().notify(`Removed “${asset.name}”. Undo with Ctrl+Z.`);
              }}
            >
              <IconX size={12} />
            </IconButton>
          </div>
        </div>
        {renaming ? (
          <input
            autoFocus
            defaultValue={asset.name}
            aria-label="Asset name"
            className="mt-1 w-full rounded-sm border border-accent bg-surface-2 px-1 text-xs"
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => {
              renameAsset(asset.id, e.target.value);
              setRenaming(false);
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') setRenaming(false);
            }}
          />
        ) : (
          <p className="mt-1 truncate px-0.5 text-xs" title={`${asset.fileName} · ${formatBytes(asset.size)}`}>
            {asset.name}
          </p>
        )}
        {asset.kind !== 'subtitle' && status === 'offline' && (
          <>
            <input
              ref={relinkInput}
              type="file"
              hidden
              accept={ACCEPT_ATTRIBUTE}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void relink(f);
              }}
            />
            <button
              type="button"
              className="mt-0.5 px-0.5 text-2xs text-accent hover:underline"
              onClick={async (e) => {
                e.stopPropagation();
                const entries = await pickFiles(relinkInput.current, false);
                const first = entries?.[0];
                if (first) void relink(first.file, first.handle);
              }}
            >
              Locate file…
            </button>
          </>
        )}
      </div>
    </li>
  );
}
