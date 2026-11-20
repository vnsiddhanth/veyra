/**
 * Harsh sweep 1: every tool × every fixture (good, odd, wrong-kind and broken files).
 * Each case must end in a verified, correct output or a clear refusal — never a crash, hang,
 * wrong output, or garbage accepted. Results: test-results/harsh/*.jsonl.
 */
import { expect, test } from '@playwright/test';
import { TOOLS } from '../../src/tools/registry';
import { HAVE_FIXTURES, MANIFEST, SPECS, checkOutputs, exercise, judge, record, toolsInSuite, verdictFor } from './lib';

test.describe.configure({ mode: 'parallel' });
test.skip(!HAVE_FIXTURES, 'harsh fixtures not generated (run e2e/harsh/make-fixtures.sh; CI does this)');
test.describe.configure({ timeout: 6 * 60_000 });

for (const tool of toolsInSuite(TOOLS)) {
  for (const f of MANIFEST) {
    // Second-input fixtures are exercised by the tools that consume them.
    if (f.kind === 'subtitle' && SPECS[tool.slug]!.inputs !== 'subtitle') continue;
    test(`${tool.slug} × ${f.name}`, async ({ page }, info) => {
      const verdict = verdictFor(tool.slug, f);
      const o = await exercise(page, tool.slug, f);
      const problems = o.outcome === 'ok' ? await checkOutputs(tool.slug, f, o) : [];
      const { pass, why } = judge(verdict, o, problems, { tool: tool.slug, fixture: f.name });
      record({ suite: 'fixtures', tool: tool.slug, fixture: f.name, verdict, outcome: o.outcome, pass, detail: why, ms: o.ms }, info.project.name);
      expect(pass, `${tool.slug} with ${f.name} (${verdict}): ${why}`).toBe(true);
    });
  }
}

/** The second inputs: every audio file as an added/replacement track, every subtitle and image as overlays. */
const SECOND: [string, string, (f: (typeof MANIFEST)[number]) => boolean][] = [
  ['add-audio', 'audio', (f) => f.kind === 'audio' || f.kind === 'broken'],
  ['replace-audio', 'audio', (f) => f.kind === 'audio' || f.kind === 'broken'],
  ['add-subtitles', 'subtitle', (f) => f.kind === 'subtitle'],
  ['burn-subtitles', 'subtitle', (f) => f.kind === 'subtitle'],
];
for (const [slug, , pick] of SECOND) {
  for (const f of MANIFEST.filter(pick)) {
    test(`${slug} second input × ${f.name}`, async ({ page }, info) => {
      const base = MANIFEST.find((x) => x.name === 'v_h264_1080p30.mp4')!;
      const o = await exercise(page, slug, base, undefined, { second: f.name });
      const problems = o.outcome === 'ok' ? await checkOutputs(slug, base, o) : [];
      const verdict = f.expect === 'reject' || f.kind === 'broken' ? 'must-refuse' : f.expect === 'either' || /silence|mono8k/.test(f.name) ? 'may' : 'must';
      const { pass, why } = judge(verdict, o, problems);
      record({ suite: 'second-input', tool: slug, fixture: f.name, verdict, outcome: o.outcome, pass, detail: why, ms: o.ms }, info.project.name);
      expect(pass, `${slug} with second input ${f.name} (${verdict}): ${why}`).toBe(true);
    });
  }
}
