import { describe, expect, it } from 'vitest';
import { makeAsset } from '@/test/fixtures';
import { createProject } from '@/project/schema/factory';
import { addAssetToProject } from './media-actions';

describe('addAssetToProject', () => {
  it('matches project format to the first video, even if an image arrived first', () => {
    const img = makeAsset('img', 'image');
    const vid = makeAsset('vid', 'video', 6);
    vid.info = { ...vid.info!, width: 853, height: 480, video: [{ ...vid.info!.video[0]!, frameRate: { bestGuess: 23.976, average: 23.976, min: 23.976, max: 23.976, isConstant: true } }] };
    const p = addAssetToProject(addAssetToProject(createProject(), img), vid);
    expect(p.settings).toMatchObject({ width: 854, height: 480, frameRate: { num: 24000, den: 1001 } }); // even dimensions
  });

  it('does not change the format for later videos', () => {
    const a = makeAsset('a', 'video');
    const b = makeAsset('b', 'video');
    b.info = { ...b.info!, width: 640, height: 360 };
    const p = addAssetToProject(addAssetToProject(createProject(), a), b);
    expect(p.settings.width).toBe(1920);
    expect(p.assets).toHaveLength(2);
  });
});
