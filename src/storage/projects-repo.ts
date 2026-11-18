import { summarize } from '@/project/schema/factory';
import type { Project, ProjectSummary } from '@/project/schema/types';
import { parseProject } from '@/project/schema/validate';
import { idbGet, idbGetAll, idbTransaction } from './idb';

/**
 * Project persistence. A project and its summary are written in one transaction so the
 * project list can never point at a missing project.
 */
export const projectsRepo = {
  async list(): Promise<ProjectSummary[]> {
    const all = await idbGetAll<ProjectSummary>('summaries');
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  },

  /** Loads and validates. Corrupted documents throw ProjectValidationError rather than loading half-broken. */
  async load(id: string): Promise<Project | null> {
    const raw = await idbGet<unknown>('projects', id);
    return raw == null ? null : parseProject(raw);
  },

  async save(project: Project): Promise<void> {
    await idbTransaction(['projects', 'summaries'], (tx) => {
      tx.objectStore('projects').put(project);
      tx.objectStore('summaries').put(summarize(project));
    });
  },

  async remove(id: string): Promise<void> {
    await idbTransaction(['projects', 'summaries'], (tx) => {
      tx.objectStore('projects').delete(id);
      tx.objectStore('summaries').delete(id);
    });
  },

  async rename(id: string, name: string): Promise<void> {
    const p = await this.load(id);
    if (!p) return;
    await this.save({ ...p, name, updatedAt: Date.now() });
  },
};
