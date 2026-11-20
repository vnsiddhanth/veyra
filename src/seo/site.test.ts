import { describe, expect, it } from 'vitest';
import { TOOLS } from '../tools/registry';
import { llmsTxt, pageInfo, publicPaths, staticBody, titleCase } from './site';

describe('SEO page info', () => {
  it('covers every public page with a unique title and description', () => {
    const infos = publicPaths().map((p) => pageInfo(p, 'https://example.com')!);
    expect(infos.every(Boolean)).toBe(true);
    expect(new Set(infos.map((i) => i.title)).size).toBe(infos.length);
    expect(new Set(infos.map((i) => i.description)).size).toBe(infos.length);
  });

  it('puts "No Upload" in every tool title and keeps titles short enough for Google', () => {
    for (const t of TOOLS) {
      const info = pageInfo(`/tools/${t.slug}`)!;
      expect(info.title).toContain('No Upload');
      expect(info.title.length).toBeLessThanOrEqual(60);
      expect(info.description).toMatch(/never uploaded/);
    }
    expect(pageInfo('/')!.title).toContain('No Upload');
  });

  it('writes readable, escaped content for crawlers', () => {
    const body = staticBody(pageInfo('/tools/rotate-video')!);
    expect(body).toContain('<h1>Rotate &amp; flip video online — free, no upload</h1>');
    expect(body).toContain('<ol>');
    expect(body).not.toMatch(/<script/i);
    expect(staticBody(pageInfo('/')!)).toContain('Are my videos uploaded anywhere?');
  });

  it('lists every tool in llms.txt', () => {
    const txt = llmsTxt('https://example.com');
    for (const t of TOOLS) expect(txt).toContain(`https://example.com/tools/${t.slug}`);
  });

  it('title-cases without shouting small words or acronyms', () => {
    expect(titleCase('compress to target size')).toBe('Compress to Target Size');
    expect(titleCase('Convert to MP4')).toBe('Convert to MP4');
  });

  it('returns nothing for private routes', () => {
    expect(pageInfo('/editor/prj_123')).toBeNull();
  });
});
