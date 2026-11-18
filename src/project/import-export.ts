/**
 * Project file import/export. A project file holds edit decisions and media *references*
 * (names, sizes, fingerprints), never the media itself. The UI says so wherever it offers export.
 */
import { BRAND } from '@/config/brand';
import { createId } from '@/utils/id';
import type { Project } from './schema/types';
import { parseProject } from './schema/validate';

export const PROJECT_FILE_KIND = 'veyra-project';
const MAX_PROJECT_FILE_BYTES = 50 * 1024 * 1024;

export interface ProjectFileEnvelope {
  kind: typeof PROJECT_FILE_KIND;
  exportedAt: string;
  app: string;
  /** Explicit, so nobody mistakes the file for a media archive. */
  containsMedia: false;
  project: Project;
}

export function serializeProject(project: Project): string {
  const envelope: ProjectFileEnvelope = {
    kind: PROJECT_FILE_KIND,
    exportedAt: new Date().toISOString(),
    app: BRAND.name,
    containsMedia: false,
    project,
  };
  return JSON.stringify(envelope, null, 2);
}

export function projectFileName(project: Project): string {
  const safe = project.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'project';
  return `${safe}${BRAND.projectFileExtension}`;
}

/**
 * Parse a project file. Always assigns a fresh project id so importing never silently
 * overwrites an existing local project.
 */
export async function parseProjectFile(file: Blob): Promise<Project> {
  if (file.size > MAX_PROJECT_FILE_BYTES) throw new Error('This file is too large to be a project file.');
  let json: unknown;
  try {
    json = JSON.parse(await file.text());
  } catch {
    throw new Error('This is not a valid project file (not JSON).');
  }
  if (typeof json !== 'object' || json === null || (json as { kind?: unknown }).kind !== PROJECT_FILE_KIND) {
    throw new Error('This is not a project file.');
  }
  const project = parseProject((json as { project: unknown }).project);
  const now = Date.now();
  return { ...project, id: createId('prj'), updatedAt: now };
}

export function downloadText(text: string, fileName: string, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function duplicateProject(p: Project): Project {
  const now = Date.now();
  return { ...p, id: createId('prj'), name: `${p.name} (copy)`, createdAt: now, updatedAt: now };
}
