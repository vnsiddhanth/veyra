import { describe, expect, it } from 'vitest';
import { keepRanges } from './compose/SilenceTool';
import { splitPoints } from './split/SplitTool';
import { parseCubeLut } from '@/render/pixel-fx';

describe('splitPoints', () => {
  it('splits into equal parts', () => {
    expect(splitPoints(10, 'parts', 0, 4, '')).toEqual([0, 2.5, 5, 7.5, 10]);
  });
  it('splits every N seconds without a sliver at the end', () => {
    expect(splitPoints(10.02, 'every', 5, 0, '')).toEqual([0, 5, 10.02]);
  });
  it('parses custom times in seconds and m:ss, sorted and in range', () => {
    expect(splitPoints(200, 'at', 0, 0, '1:30, 12.5 ; 999 x')).toEqual([0, 12.5, 90, 200]);
  });
});

describe('keepRanges (silence removal)', () => {
  it('cuts silences longer than the minimum, keeping padding', () => {
    // 10 peaks/s: 1 s loud, 2 s silent, 1 s loud, 0.3 s silent, 1 s loud.
    const peaks = new Uint8Array([...Array(10).fill(200), ...Array(20).fill(0), ...Array(10).fill(200), ...Array(3).fill(0), ...Array(10).fill(200)]);
    const ranges = keepRanges({ peaks, peaksPerSecond: 10, duration: 5.3 }, -40, 0.5, 0.1);
    expect(ranges).toHaveLength(2);
    expect(ranges[0]!.start).toBe(0);
    expect(ranges[0]!.end).toBeCloseTo(1.1);
    expect(ranges[1]!.start).toBeCloseTo(2.9);
    expect(ranges[1]!.end).toBeCloseTo(5.3);
  });
});

describe('parseCubeLut', () => {
  it('parses a 2³ identity LUT', () => {
    const lines = ['TITLE "id"', 'LUT_3D_SIZE 2'];
    for (let b = 0; b < 2; b++) for (let g = 0; g < 2; g++) for (let r = 0; r < 2; r++) lines.push(`${r} ${g} ${b}`);
    const lut = parseCubeLut(lines.join('\n'));
    expect(lut.size).toBe(2);
    expect(lut.title).toBe('id');
    expect([...lut.data.slice(0, 6)]).toEqual([0, 0, 0, 255, 0, 0]);
  });
  it('rejects a truncated LUT', () => {
    expect(() => parseCubeLut('LUT_3D_SIZE 2\n0 0 0')).toThrow(/Expected 8/);
  });
});
