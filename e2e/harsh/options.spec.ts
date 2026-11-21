/**
 * Harsh sweep 2: every control of every tool, one at a time — each dropdown option, each radio
 * choice, each checkbox flipped, and every number field at its minimum and maximum. Controls are
 * discovered from the page, so new options are covered automatically.
 */
import { expect, test, type Page } from '@playwright/test';
import { TOOLS } from '../../src/tools/registry';
import { HAVE_FIXTURES, SPECS, checkOutputs, exercise, fx, judge, loadFixture, record, toolsInSuite, type Fx, type ToolSpec } from './lib';

test.describe.configure({ mode: 'parallel' });
// No single click, fill or read may wait forever: a stuck step must fail that case, not the whole batch.
test.use({ actionTimeout: 30_000 });
test.skip(!HAVE_FIXTURES, 'harsh fixtures not generated');
test.describe.configure({ timeout: 45 * 60_000 });

const BASE: Record<ToolSpec['inputs'], string> = {
  video: 'v_h264_1080p30.mp4',
  'audio-or-video': 'a_noisy_dialogue.wav',
  audio: 'a_aac.m4a',
  images: 'i_1080p.png',
  subtitle: 's_good.srt',
  'any-media': 'v_h264_1080p30.mp4',
  picture: 'v_h264_1080p30.mp4',
};

// Controls are found again by their position on the page (`index` within their kind), not by label:
// a label's text can include hints, units or option text, which made label lookups wait forever.
type Control =
  | { type: 'select'; index: number; label: string; values: string[]; current: string }
  | { type: 'radio'; name: string; values: string[]; current: string }
  | { type: 'check'; index: number; label: string; checked: boolean }
  | { type: 'number'; index: number; label: string; min: string | null; max: string | null };

const SEL = { select: 'main select', check: 'main input[type=checkbox]', number: 'main input[type=number], main input[type=range]' };
/** Every control step gets a time limit, so one missing control fails one variant instead of the whole tool. */
const STEP = { timeout: 15_000 };

async function discover(page: Page): Promise<Control[]> {
  return page.evaluate(() => {
    const main = document.querySelector('main')!;
    const labelOf = (el: HTMLElement) => (el.getAttribute('aria-label') || (el as HTMLInputElement).labels?.[0]?.innerText || '').trim().split('\n')[0]!.trim();
    const out: Control[] = [];
    for (const [index, s] of [...main.querySelectorAll<HTMLSelectElement>('select')].entries()) {
      if (s.disabled || !labelOf(s)) continue;
      out.push({ type: 'select', index, label: labelOf(s), values: [...s.options].filter((o) => !o.disabled).map((o) => o.value), current: s.value });
    }
    const radios = new Map<string, { values: string[]; current: string }>();
    for (const r of main.querySelectorAll<HTMLInputElement>('input[type=radio]')) {
      const g = radios.get(r.name) ?? { values: [], current: '' };
      g.values.push(r.value);
      if (r.checked) g.current = r.value;
      radios.set(r.name, g);
    }
    for (const [name, g] of radios) out.push({ type: 'radio', name, ...g });
    for (const [index, c] of [...main.querySelectorAll<HTMLInputElement>('input[type=checkbox]')].entries()) if (labelOf(c)) out.push({ type: 'check', index, label: labelOf(c), checked: c.checked });
    for (const [index, n] of [...main.querySelectorAll<HTMLInputElement>('input[type=number], input[type=range]')].entries())
      if (labelOf(n)) out.push({ type: 'number', index, label: labelOf(n), min: n.getAttribute('min'), max: n.getAttribute('max') });
    return out;
  }) as Promise<Control[]>;
}

const even = (x: number) => Math.round(x / 2) * 2;

/** Expectations that change with a specific option (otherwise the tool's defaults apply). */
function expectationFor(slug: string, rawLabel: string, value: string, f: Fx): Partial<ToolSpec> {
  const num = Number(value);
  const label = rawLabel.replace(/\s*\([^)]*\)$/, ''); // "Hold for (s)" → "Hold for"
  if (slug === 'crop-video' && label === 'Aspect') {
    const [a, b] = value.split(':').map(Number) as [number, number];
    if (!(a > 0 && b > 0)) return { size: 'any' };
    // The largest a:b box that fits the frame.
    return { size: (w, h) => (w / h > a / b ? [even((h * a) / b), h] : [w, even((w * b) / a)]) };
  }
  if (slug === 'crop-video' && (label === 'Width' || label === 'Height')) return { size: 'any' };
  // A transition overlaps the clips by its length (0.8 s by default).
  if (slug === 'merge-videos' && label === 'Transition between clips' && value !== 'none') return { duration: (d) => 2 * d - 0.8 };
  if (slug === 'change-resolution' && label === 'Resolution') return { size: (w, h) => (h > w ? [num, Math.round((num * h) / w / 2) * 2] : [Math.round((num * w) / h / 2) * 2, num]) };
  if (slug === 'change-frame-rate' && label === 'New frame rate') return { fps: () => num };
  if (slug === 'change-speed' && label === 'Speed' && num > 0) return { duration: (d) => d / num };
  if (slug === 'rotate-video' && label === 'rotate') return { size: num % 180 === 0 ? 'same' : (w, h) => [h, w] };
  if (slug === 'compress-video' && label === 'Maximum resolution' && num > 0) return { size: 'any' };
  if (label === 'Keep audio') return { audio: 'any' };
  if (slug === 'add-end-credits' && label === 'Where' && value === 'over') return { duration: 'same' };
  if (slug === 'freeze-frame' && label === 'Hold for') return { duration: (d) => d + num };
  if (slug === 'add-end-credits' && label === 'Roll length') return { duration: (d) => d + num };
  if (slug === 'aspect-ratio-converter' && label === 'Aspect ratio') {
    const [a, b] = value.split(':').map(Number) as [number, number];
    return { size: (w, h) => { const L = Math.max(w, h); return a >= b ? [Math.round(L / 2) * 2, Math.round((L * b) / a / 2) * 2] : [Math.round((L * a) / b / 2) * 2, Math.round(L / 2) * 2]; } };
  }
  if (slug === 'resize-video' && label === 'Size') return { size: 'any' };
  void f;
  return {};
}

for (const tool of toolsInSuite(TOOLS)) {
  const spec = SPECS[tool.slug]!;
  if (spec.output === 'report' || spec.output === 'scopes') continue;
  // The subtitle editor has only free-text fields (cue times and text), which its own e2e tests cover.
  if (tool.slug === 'subtitle-editor') continue;
  test(`options · ${tool.slug}`, async ({ page }, info) => {
    const base = fx(BASE[spec.inputs]);
    await loadFixture(page, tool.slug, base);
    await page.waitForTimeout(1500);
    if (spec.second) {
      await page.locator('main input[type=file]').first().setInputFiles(`${process.cwd()}/e2e/fixtures/harsh/${spec.second}`);
      await page.waitForTimeout(800);
    }
    // Controls appear only once the file is read (and, for some tools, analysed): look until they show up.
    await expect(page.getByText(/^Reading .+…$/)).toHaveCount(0, { timeout: 60_000 }).catch(() => undefined);
    await spec.prepare?.(page, base).catch(() => undefined);
    let controls: Control[] = [];
    for (const until = Date.now() + 60_000; Date.now() < until; await page.waitForTimeout(500)) {
      controls = await discover(page);
      if (controls.length) break;
    }
    const failures: string[] = [];
    const variants: { name: string; label: string; value: string; apply: (p: Page) => Promise<void> }[] = [];
    for (const c of controls) {
      if (c.type === 'select') for (const v of c.values.filter((v) => v !== c.current)) variants.push({ name: `${c.label} = ${v}`, label: c.label, value: v, apply: (p) => p.locator(SEL.select).nth(c.index).selectOption(v, STEP).then(() => undefined) });
      if (c.type === 'radio') for (const v of c.values.filter((v) => v !== c.current)) variants.push({ name: `${c.name} = ${v}`, label: c.name, value: v, apply: (p) => p.locator(`main input[type=radio][name="${c.name}"][value="${v}"]`).first().check(STEP) });
      if (c.type === 'check') variants.push({ name: `${c.label} = ${!c.checked}`, label: c.label, value: String(!c.checked), apply: (p) => p.locator(SEL.check).nth(c.index).setChecked(!c.checked, STEP) });
      if (c.type === 'number')
        for (const v of [c.min, c.max].filter((x): x is string => x != null))
          variants.push({
            name: `${c.label} = ${v}`,
            label: c.label,
            value: v,
            apply: async (p) => {
              const el = p.locator(SEL.number).nth(c.index);
              if ((await el.getAttribute('type', STEP)) === 'range')
                await el.evaluate((n: HTMLInputElement, val) => {
                  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
                  set.call(n, val);
                  n.dispatchEvent(new Event('input', { bubbles: true }));
                  n.dispatchEvent(new Event('change', { bubbles: true }));
                }, v, STEP);
              else {
                await el.fill(v, STEP);
                await el.press('Enter', STEP);
              }
            },
          });
    }
    expect(variants.length, 'controls discovered').toBeGreaterThan(0);
    for (const v of variants) {
      const o = await exercise(page, tool.slug, base, v.apply);
      const extra = expectationFor(tool.slug, v.label, v.value, base);
      const problems = o.outcome === 'ok' ? await checkOutputs(tool.slug, base, o, extra) : [];
      // An option may legitimately make a run impossible (e.g. a minimum that leaves nothing to do) — but it must say why.
      const { pass, why } = judge('may', o, problems);
      record({ suite: 'options', tool: tool.slug, fixture: base.name, variant: v.name, verdict: 'may', outcome: o.outcome, pass, detail: why, ms: o.ms }, info.project.name);
      if (!pass) failures.push(`${v.name}: ${why}`);
    }
    expect(failures, `${tool.slug}: ${failures.length}/${variants.length} option variants failed`).toEqual([]);
  });
}
