// Merge harsh-suite results (JSONL from every shard and browser) into a Markdown report.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2] ?? 'test-results';
const out = process.argv[3] ?? 'harsh-report.md';
const rows = [];
const walk = (d) => {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p);
    else if (n.endsWith('.jsonl')) for (const line of readFileSync(p, 'utf8').split('\n')) if (line.trim()) rows.push(JSON.parse(line));
  }
};
if (statSync(root, { throwIfNoEntry: false })?.isDirectory()) walk(root);

const by = (k) => rows.reduce((m, r) => (m.set(r[k], [...(m.get(r[k]) ?? []), r]), m), new Map());
const browsers = [...new Set(rows.map((r) => r.project))].sort();
const lines = [];
const fails = rows.filter((r) => !r.pass);
lines.push(`# Harsh test report`, '');
lines.push(`**${rows.length} cases** across ${browsers.join(' and ')} · **${rows.length - fails.length} passed** · **${fails.length} failed**`, '');
lines.push(`- ok: produced a verified, correct file · refused: declined with a clear message (expected for wrong or broken inputs)`, '');
lines.push('| Tool | Cases | Worked | Refused properly | Failed |', '|---|---:|---:|---:|---:|');
for (const [tool, rs] of [...by('tool')].sort((a, b) => a[0].localeCompare(b[0]))) {
  const ok = rs.filter((r) => r.pass && r.outcome === 'ok').length;
  const ref = rs.filter((r) => r.pass && r.outcome === 'refused').length;
  const f = rs.filter((r) => !r.pass).length;
  lines.push(`| ${tool} | ${rs.length} | ${ok} | ${ref} | ${f ? `**${f}**` : 0} |`);
}
lines.push('', '## Failures', '');
if (!fails.length) lines.push('None.');
for (const [tool, rs] of [...by('tool')].sort((a, b) => a[0].localeCompare(b[0]))) {
  const fr = rs.filter((r) => !r.pass);
  if (!fr.length) continue;
  lines.push(`### ${tool}`, '');
  for (const r of fr) lines.push(`- [${r.project}] ${r.suite} · \`${r.fixture}\`${r.variant ? ` · ${r.variant}` : ''} — ${r.detail}`);
  lines.push('');
}
writeFileSync(out, lines.join('\n'));
console.log(lines.slice(0, 6).join('\n'));
