// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { makeProject, trackId } from '@/test/fixtures';
import { insertClip } from '@/timeline/model/ops';
import { ProjectValidationError } from '@/project/schema/validate';
import { idbPut, resetDbForTests } from './idb';
import { projectsRepo } from './projects-repo';

beforeEach(async () => {
  resetDbForTests();
  indexedDB.deleteDatabase('veyra');
});

describe('projectsRepo', () => {
  it('saves, lists (newest first), loads, renames and removes', async () => {
    const a = { ...makeProject(), name: 'A', updatedAt: 1 };
    const b = { ...makeProject(), name: 'B', updatedAt: 2 };
    await projectsRepo.save(a);
    await projectsRepo.save(b);
    expect((await projectsRepo.list()).map((s) => s.name)).toEqual(['B', 'A']);
    expect(await projectsRepo.load(a.id)).toEqual(a);
    await projectsRepo.rename(a.id, 'A2');
    expect((await projectsRepo.load(a.id))!.name).toBe('A2');
    await projectsRepo.remove(a.id);
    expect(await projectsRepo.load(a.id)).toBeNull();
    expect((await projectsRepo.list()).map((s) => s.id)).toEqual([b.id]);
  });

  it('persists timeline edits (recovery after reload)', async () => {
    const p0 = makeProject();
    const [p] = insertClip(p0, { trackId: trackId(p0, 'V1'), assetId: 'vid', start: 0 });
    await projectsRepo.save(p);
    resetDbForTests(); // simulate a fresh page: new connection
    const loaded = await projectsRepo.load(p.id);
    expect(loaded).toEqual(p);
  });

  it('refuses to load a corrupted stored project', async () => {
    const p = makeProject();
    await idbPut('projects', { ...p, tracks: 'oops' });
    await expect(projectsRepo.load(p.id)).rejects.toBeInstanceOf(ProjectValidationError);
  });
});
