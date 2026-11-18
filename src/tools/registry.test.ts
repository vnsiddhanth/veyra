import { describe, expect, it } from 'vitest';
import { TOOLS, findTool, relatedTools, searchTools } from './registry';

describe('tool registry', () => {
  it('has unique, URL-safe slugs', () => {
    const slugs = TOOLS.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9-]+$/);
  });

  it('only marks tools available when they have a real engine', () => {
    for (const t of TOOLS) {
      if (t.status === 'available') expect(t.engine).not.toBe('none');
      else expect(t.engine).toBe('none');
    }
  });

  it('searches by title, keyword and category', () => {
    expect(searchTools('compress')[0]!.slug).toBe('compress-video');
    expect(searchTools('fps').map((t) => t.slug)).toContain('frame-rate-inspector');
    expect(searchTools('zzzz')).toEqual([]);
  });

  it('finds tools and related tools', () => {
    const t = findTool('video-metadata')!;
    expect(t.status).toBe('available');
    expect(relatedTools(t).every((r) => r.slug !== t.slug)).toBe(true);
  });
});
