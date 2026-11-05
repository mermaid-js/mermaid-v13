// Spec #265 A/B ratios (IMPLEMENTER step 5, LEDGER.md) from a bench report: sums of warm time
// over the fixtures every renderer rendered, the 14 largest and the tiny set (Pele < 0.5 ms).
// Usage: node v13/docs/agents/runs/265/ratios.mjs <report.json> [fixture id ...]
// The fixture ids print one line each with head/Pele and base/Pele (the page-history check).
import { readFileSync } from 'node:fs';

const [file, ...extra] = process.argv.slice(2);
const report = JSON.parse(readFileSync(file, 'utf8'));
const warm = {};
for (const run of report.renderers) {
  warm[run.renderer] = new Map(
    run.results.filter((r) => r.status === 'ok' && r.warmMs !== null).map((r) => [r.id, r.warmMs])
  );
}
const head = warm['v13'];
const base = warm['v13-base'];
const pele = warm['pele'];
const common = [...head.keys()].filter((id) => base?.has(id) && pele?.has(id));
const largest = common.filter((id) => id.startsWith('perf/') || id === 'pele/flowchart-500');
const tiny = common.filter((id) => pele.get(id) < 0.5);
const sum = (m, ids) => ids.reduce((s, id) => s + m.get(id), 0);
const row = (name, ids) => {
  const h = sum(head, ids);
  const b = sum(base, ids);
  const p = sum(pele, ids);
  return `| ${name} (${ids.length}) | ${(h / p).toFixed(2)}× | ${(b / p).toFixed(2)}× | ${(h / b).toFixed(3)} |`;
};
console.log('| Fixtures | head / Pele | base / Pele | head / base |');
console.log('| --- | --- | --- | --- |');
console.log(row('All common', common));
console.log(row('14 largest', largest));
console.log(row('Tiny, Pele < 0.5 ms', tiny));
for (const id of extra) {
  if (!head.has(id) || !pele.has(id)) continue;
  const b = base?.get(id);
  console.log(
    `${id}: head/Pele ${(head.get(id) / pele.get(id)).toFixed(2)}×` +
      (b === undefined ? '' : `, base/Pele ${(b / pele.get(id)).toFixed(2)}×`)
  );
}
