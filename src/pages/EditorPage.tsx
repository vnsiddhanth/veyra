import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { EditorShell } from '@/editor/EditorShell';
import { ProjectManager } from '@/editor/ProjectManager';
import type { Project } from '@/project/schema/types';
import { useLibraryStore } from '@/state/library-store';
import { reconnectMedia } from '@/state/media-actions';
import { useProjectStore } from '@/state/project-store';
import { projectsRepo } from '@/storage/projects-repo';

export default function EditorPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<{ status: 'loading' } | { status: 'ready'; project: Project } | { status: 'error'; message: string }>({
    status: 'loading',
  });

  // Editor is always dark.
  useEffect(() => {
    const root = document.documentElement;
    const prev = root.dataset.theme;
    root.dataset.theme = 'dark';
    return () => {
      if (prev) root.dataset.theme = prev;
      else delete root.dataset.theme;
    };
  }, []);

  useEffect(() => {
    if (!projectId) {
      document.title = 'Editor — Veyra';
      return;
    }
    let cancelled = false;
    setState({ status: 'loading' });
    projectsRepo
      .load(projectId)
      .then((project) => {
        if (cancelled) return;
        if (!project) {
          setState({ status: 'error', message: 'This project was not found in this browser. It may have been deleted, or created in another browser.' });
          return;
        }
        useLibraryStore.getState().reset();
        useProjectStore.getState().open(project);
        document.title = `${project.name} — Veyra`;
        setState({ status: 'ready', project });
        // Silent reconnect: succeeds where the browser kept file permission; others show as offline.
        void reconnectMedia(project, false);
      })
      .catch((e: Error) => !cancelled && setState({ status: 'error', message: `Could not open the project: ${e.message}` }));
    return () => {
      cancelled = true;
      void useProjectStore.getState().close();
    };
  }, [projectId]);

  if (!projectId) return <ProjectManager onOpen={(id) => navigate(`/editor/${id}`)} />;
  if (state.status === 'loading') return <div className="theme-dark flex h-full items-center justify-center bg-canvas text-sm text-muted">Opening project…</div>;
  if (state.status === 'error')
    return (
      <div className="theme-dark flex h-full flex-col items-center justify-center gap-3 bg-canvas p-6 text-center">
        <p className="max-w-md text-sm text-fg">{state.message}</p>
        <Link to="/editor" className="text-sm text-accent hover:underline">
          Back to projects
        </Link>
      </div>
    );
  return <EditorShell />;
}
