import { describe, expect, it } from 'vitest';
import { CONTAINER_INFO, outputFileName } from './convert';
import { isScratchName } from './output-store';

describe('outputFileName', () => {
  it('sanitises unsafe characters and adds the container extension', () => {
    const { display, scratch } = outputFileName('my:clip/../<x>?', 'webm', 'job_12');
    expect(display).toBe('my_clip_.._x_.webm');
    expect(scratch).toBe('out_job_12__my_clip_.._x_.webm');
    expect(isScratchName(scratch)).toBe(true);
  });

  it('falls back to a default name and limits length', () => {
    expect(outputFileName('   ', 'mp4', 'j').display).toBe('output.mp4');
    expect(outputFileName('a'.repeat(500), 'mp4', 'j').display.length).toBe(124);
  });

  it('maps audio containers to the right extensions', () => {
    expect(CONTAINER_INFO.adts.ext).toBe('aac');
    expect(CONTAINER_INFO.m4a.audioOnly).toBe(true);
    expect(CONTAINER_INFO.mov.mime).toBe('video/quicktime');
  });
});
