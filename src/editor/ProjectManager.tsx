import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '@/components/layout/SiteLayout';
import { IconPlus, IconTrash, IconUpload } from '@/components/ui/icons';
import { Button, EmptyState } from '@/components/ui/primitives';
import { BRAND } from '@/config/brand';
import { duplicateProject, parseProjectFile } from '@/project/import-export';
import { createProject } from '@/project/schema/factory';
import type { ProjectSummary } from '@/project/schema/types';
import { requestPersistence } from '@/storage/media-store';
import { projectsRepo } from '@/storage/projects-repo';
import { formatDate } from '@/utils/format';

export function ProjectManager({ onOpen }: { onOpen(id: string): void }) {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    projectsRepo.list().then(setProjects, (e: Error) => setError(`Local storage is unavailable: ${e.message}`));
  }, []);
  useEffect(refresh, [refresh]);

  const create = async () => {
    try {
      const p = createProject(`Project ${new Date().toLocaleDateString()}`);
      await projectsRepo.save(p);
      void requestPersistence();
      onOpen(p.id);
    } catch (e) {
      setError(`Could not create a project: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const importFile = async (file: File) => {
    try {
      const p = await parseProjectFile(file);
      await projectsRepo.save(p);
      onOpen(p.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const duplicate = async (id: string) => {
    const p = await projectsRepo.load(id);
    if (p) {
      await projectsRepo.save(duplicateProject(p));
      refresh();
    }
  };

  const remove = async (s: ProjectSummary) => {
    if (!window.confirm(`Delete “${s.name}”? This removes the project from this browser. Your media files on disk are not affected. This cannot be undone.`)) return;
    await projectsRepo.remove(s.id);
    refresh();
  };

  return (
    <div className="theme-dark min-h-full bg-canvas text-fg">
      <header className="flex h-14 items-center gap-4 border-b border-line px-4">
        <Logo />
        <span className="text-sm text-muted">Projects</span>
        <Link to="/tools" className="ml-auto text-sm text-muted hover:text-fg">
          Tools
        </Link>
      </header>
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <h1 className="mr-auto text-xl font-semibold">Your projects</h1>
          <input
            ref={fileInput}
            type="file"
            accept={`${BRAND.projectFileExtension},application/json`}
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void importFile(f);
            }}
          />
          <Button onClick={() => fileInput.current?.click()} title="Open a project file exported from this editor">
            <IconUpload /> Import project file
          </Button>
          <Button variant="primary" onClick={() => void create()}>
            <IconPlus /> New project
          </Button>
        </div>
        {error && <p className="mb-4 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        {projects === null ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : projects.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line-strong">
            <EmptyState title="No projects yet" action={<Button variant="primary" onClick={() => void create()}>Create your first project</Button>}>
              Projects are saved automatically in this browser. Media stays on your disk and is referenced, not copied.
            </EmptyState>
          </div>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
            {projects.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
                <div className="min-w-0 flex-1">
                  {renaming === s.id ? (
                    <input
                      autoFocus
                      defaultValue={s.name}
                      aria-label="Project name"
                      className="w-full rounded-sm border border-accent bg-surface-2 px-2 py-1 text-sm"
                      onBlur={async (e) => {
                        const name = e.target.value.trim();
                        if (name && name !== s.name) await projectsRepo.rename(s.id, name.slice(0, 200));
                        setRenaming(null);
                        refresh();
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        if (e.key === 'Escape') setRenaming(null);
                      }}
                    />
                  ) : (
                    <button type="button" className="block max-w-full truncate text-left text-sm font-medium hover:text-accent" onClick={() => onOpen(s.id)}>
                      {s.name}
                    </button>
                  )}
                  <p className="text-xs text-muted">
                    {s.width}×{s.height} · {s.assetCount} media · edited {formatDate(s.updatedAt)}
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setRenaming(s.id)}>
                  Rename
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void duplicate(s.id)}>
                  Duplicate
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void remove(s)} aria-label={`Delete ${s.name}`}>
                  <IconTrash />
                </Button>
                <Button size="sm" onClick={() => onOpen(s.id)}>
                  Open
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
