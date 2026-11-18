import { describe, expect, it } from 'vitest';
import { classifyByName, classifyFile, sniff } from './classify';

const bytes = (...parts: Array<string | number[]>) => {
  const out: number[] = [];
  for (const p of parts) {
    if (typeof p === 'string') for (const c of p) out.push(c.charCodeAt(0));
    else out.push(...p);
  }
  return new Uint8Array(out) as Uint8Array<ArrayBuffer>;
};

function file(content: Uint8Array<ArrayBuffer>, name: string, type = ''): File {
  return new File([content], name, { type });
}

describe('sniff', () => {
  it('identifies containers by magic bytes', () => {
    expect(sniff(bytes([0, 0, 0, 0x20], 'ftypisom'))?.container).toBe('MP4');
    expect(sniff(bytes([0, 0, 0, 0x14], 'ftypqt  '))?.container).toBe('QuickTime');
    expect(sniff(bytes([0, 0, 0, 0x20], 'ftypM4A '))?.kind).toBe('audio');
    expect(sniff(bytes([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0], 'webm'))?.container).toBe('WebM');
    expect(sniff(bytes([0x1a, 0x45, 0xdf, 0xa3], 'matroska'))?.container).toBe('Matroska');
    expect(sniff(bytes('RIFF', [0, 0, 0, 0], 'WAVE'))?.container).toBe('WAVE');
    expect(sniff(bytes('RIFF', [0, 0, 0, 0], 'AVI '))).toMatchObject({ container: 'AVI', primary: false });
    expect(sniff(bytes('ID3', [4, 0]))?.container).toBe('MP3');
    expect(sniff(bytes('fLaC'))?.container).toBe('FLAC');
    expect(sniff(bytes('OggS'))?.container).toBe('Ogg');
    expect(sniff(bytes([0x89, 0x50, 0x4e, 0x47])))?.toMatchObject({ kind: 'image', container: 'PNG' });
    expect(sniff(bytes([0xff, 0xd8, 0xff, 0xe0])))?.toMatchObject({ kind: 'image', container: 'JPEG' });
    expect(sniff(bytes('GIF89a'))?.container).toBe('GIF');
    expect(sniff(bytes('hello world'))).toBeNull();
  });
});

describe('classify', () => {
  it('falls back to extension and MIME', () => {
    expect(classifyByName('clip.MKV', '')).toMatchObject({ kind: 'video', container: 'Matroska', primaryPipeline: true });
    expect(classifyByName('x.unknown', 'audio/x-foo')).toMatchObject({ kind: 'audio' });
    expect(classifyByName('x.bin', '').kind).toBe('unknown');
  });

  it('trusts magic bytes over a lying extension', async () => {
    const png = file(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]), 'not-a-video.mp4');
    expect((await classifyFile(png)).kind).toBe('image');
  });

  it('keeps audio-only MP4 (m4a) as audio', async () => {
    const m4a = file(bytes([0, 0, 0, 0x20], 'ftypisom'), 'song.m4a', 'audio/mp4');
    expect((await classifyFile(m4a)).kind).toBe('audio');
  });

  it('classifies subtitles, SVG and empty files', async () => {
    expect((await classifyFile(file(bytes('1\n00:00'), 'a.srt'))).kind).toBe('subtitle');
    expect((await classifyFile(file(bytes('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'a.svg'))).kind).toBe('image');
    expect((await classifyFile(file(new Uint8Array(0), 'empty.bin'))).reason).toMatch(/empty/);
  });
});
