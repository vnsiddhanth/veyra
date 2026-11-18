import { describe, expect, it } from 'vitest';
import { makeProject, trackId } from '@/test/fixtures';
import { insertClip } from '@/timeline/model/ops';
import { parseProjectFile, serializeProject } from '../import-export';
import { ProjectValidationError, parseProject } from './validate';

function roundTrip<T>(v: T): unknown {
  return JSON.parse(JSON.stringify(v));
}

describe('parseProject', () => {
  it('round-trips a valid project with clips', () => {
    const p0 = makeProject();
    const [p] = insertClip(p0, { trackId: trackId(p0, 'V1'), assetId: 'vid', start: 0 });
    expect(parseProject(roundTrip(p))).toEqual(p);
  });

  it('drops unknown fields and cannot pollute prototypes', () => {
    const raw = roundTrip(makeProject()) as Record<string, unknown>;
    raw.evil = '<script>';
    (raw.settings as Record<string, unknown>).__proto__ = { polluted: true };
    const json = JSON.parse(JSON.stringify(raw).replace('"settings":{', '"settings":{"__proto__":{"polluted":true},'));
    const parsed = parseProject(json) as unknown as Record<string, unknown>;
    expect(parsed.evil).toBeUndefined();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('rejects wrong types with a path', () => {
    const raw = roundTrip(makeProject()) as { settings: { width: unknown } };
    raw.settings.width = '1920';
    expect(() => parseProject(raw)).toThrow(ProjectValidationError);
    expect(() => parseProject(raw)).toThrow(/settings.width/);
  });

  it('rejects overlapping clips and dangling references', () => {
    const p0 = makeProject();
    const [p1, a] = insertClip(p0, { trackId: trackId(p0, 'V1'), assetId: 'img', start: 0 });
    const [p2, b] = insertClip(p1, { trackId: trackId(p1, 'V1'), assetId: 'img', start: 1_000_000_000_0 });
    const overlapping = roundTrip({ ...p2, clips: { ...p2.clips, [b]: { ...p2.clips[b]!, start: p2.clips[a]!.start } } });
    expect(() => parseProject(overlapping)).toThrow(/overlaps/);
    const dangling = roundTrip({ ...p2, assets: p2.assets.filter((x) => x.id !== 'img') });
    expect(() => parseProject(dangling)).toThrow(/missing asset/);
  });

  it('rejects projects from a newer schema', () => {
    const raw = roundTrip(makeProject()) as { schemaVersion: number };
    raw.schemaVersion = 999;
    expect(() => parseProject(raw)).toThrow(/newer version/);
  });

  it('rejects malicious ids and colors', () => {
    const raw = roundTrip(makeProject()) as { id: string; settings: { background: string } };
    raw.id = '../../etc';
    expect(() => parseProject(raw)).toThrow(/invalid id/);
    const raw2 = roundTrip(makeProject()) as { settings: { background: string } };
    raw2.settings.background = 'red;background:url(x)';
    expect(() => parseProject(raw2)).toThrow(/settings.background/);
    raw2.settings.background = 'rgb(0)';
    expect(() => parseProject(raw2)).toThrow(/invalid color/);
  });
});

describe('project files', () => {
  it('export → import gives a fresh id and identical content, and states it contains no media', async () => {
    const p = makeProject();
    const text = serializeProject(p);
    expect(JSON.parse(text).containsMedia).toBe(false);
    const imported = await parseProjectFile(new Blob([text]));
    expect(imported.id).not.toBe(p.id);
    expect(imported.assets).toEqual(p.assets);
    expect(imported.tracks).toEqual(p.tracks);
  });

  it('rejects non-project files', async () => {
    await expect(parseProjectFile(new Blob(['not json']))).rejects.toThrow(/not JSON/);
    await expect(parseProjectFile(new Blob(['{"kind":"other"}']))).rejects.toThrow(/not a project file/);
  });
});
