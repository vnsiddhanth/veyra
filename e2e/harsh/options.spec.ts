/**
 * Harsh sweep 2: every control of every tool, one at a time — each dropdown option, each radio
 * choice, each checkbox flipped, and every number field at its minimum and maximum. Controls are
 * discovered from the page, so new options are covered automatically.
 */
import { expect, test, type Page } from '@playwright/test';
import { TOOLS } from '../../src/tools/registry';
import { HAVE_FIXTURES, SPECS, checkOutputs, exercise, fx, judge, loadFixture, record, toolsInSuite, type Fx, type ToolSpec } from './lib';

test.describe.configure({ mode: 'parallel' });
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

type Control =
  | { type: 'select'; label: string; values: string[]; current: string }
  | { type: 'radio'; name: string; values: string[]; current: string }
  | { type: 'check'; label: string; checked: boolean }
  | { type: 'number'; label: string; min: string | null; max: string | null };

async function discover(page: Page): Promise<Control[]> {
  return page.evaluate(() => {
    const main = document.querySelector('main')!;
    const labelOf = (el: HTMLElement) => (el.getAttribute('aria-label') || (el as HTMLInputElement).labels?.[0]?.innerText || '').trim().split('\n')[0]!.trim();
    const out: Control[] = [];
    for (const s of main.querySelectorAll<HTMLSelectElement>('select')) {
      if (s.disabled || !labelOf(s)) continue;
      out.push({ type: 'select', label: labelOf(s), values: [...s.options].filter((o) => !o.disabled).map((o) => o.value), current: s.value });
    }
    const radios = new Map<string, { values: string[]; current: string }>();
    for (const r of main.querySelectorAll<HTMLInputElement>('input[type=radio]')) {
      const g = radios.get(r.name) ?? { values: [], current: '' };
      g.values.push(r.value);
      if (r.checked) g.current = r.value;
      radios.set(r.name, g);
    }
    for (const [name, g] of radios) out.push({ type: 'radio', name, ...g });
    for (const c of main.querySelectorAll<HTMLInputElement>('input[type=checkbox]')) if (labelOf(c)) out.push({ type: 'check', label: labelOf(c), checked: c.checked });
    for (const n of main.querySelectorAll<HTMLInputElement>('input[type=number], input[type=range]')) if (labelOf(n)) out.push({ type: 'number', label: labelOf(n), min: n.getAttribute('min'), max: n.getAttribute('max') });
    return out;
  }) as Promise<Control[]>;
}

/** Expectations that change with a specific option (otherwise the tool's defaults apply). */
function expectationFor(slug: string, label: string, value: string, f: Fx): Partial<ToolSpec> {
  const num = Number(value);
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
  test(`options · ${tool.slug}`, async ({ page }, info) => {
    const base = fx(BASE[spec.inputs]);
    await loadFixture(page, tool.slug, base);
    await page.waitForTimeout(1500);
    if (spec.second) {
      await page.locator('main input[type=file]').first().setInputFiles(`${process.cwd()}/e2e/fixtures/harsh/${spec.second}`);
      await page.waitForTimeout(800);
    }
    await spec.prepare?.(page, base).catch(() => undefined);
    const controls = await discover(page);
    const failures: string[] = [];
    const variants: { name: string; label: string; value: string; apply: (p: Page) => Promise<void> }[] = [];
    for (const c of controls) {
      if (c.type === 'select') for (const v of c.values.filter((v) => v !== c.current)) variants.push({ name: `${c.label} = ${v}`, label: c.label, value: v, apply: (p) => p.getByLabel(c.label, { exact: true }).first().selectOption(v).then(() => undefined) });
      if (c.type === 'radio') for (const v of c.values.filter((v) => v !== c.current)) variants.push({ name: `${c.name} = ${v}`, label: c.name, value: v, apply: (p) => p.locator(`main input[type=radio][name="${c.name}"][value="${v}"]`).first().check() });
      if (c.type === 'check') variants.push({ name: `${c.label} = ${!c.checked}`, label: c.label, value: String(!c.checked), apply: (p) => p.getByLabel(c.label, { exact: true }).first().setChecked(!c.checked) });
      if (c.type === 'number')
        for (const v of [c.min, c.max].filter((x): x is string => x != null))
          variants.push({
            name: `${c.label} = ${v}`,
            label: c.label,
            value: v,
            apply: async (p) => {
              const el = p.getByLabel(c.label, { exact: true }).first();
              if ((await el.getAttribute('type')) === 'range') await el.evaluate((n: HTMLInputElement, val) => {
                const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
                set.call(n, val);
                n.dispatchEvent(new Event('input', { bubbles: true }));
                n.dispatchEvent(new Event('change', { bubbles: true }));
              }, v);
              else {
                await el.fill(v);
                await el.press('Enter');
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
