/**
 * Report-only bench for the generated Lezer tokenizer (#171): the best and median time of a
 * full parse of the 50k-character bench fixture,
 * `packages/bench/fixtures/language/flowchart-50k.mmd`.
 * `pnpm --filter @mermaid-js/language-service-codemirror bench:parse [runs]`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { mermaidLanguage } from '../src/language.ts';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const text = readFileSync(join(ROOT, 'packages/bench/fixtures/language/flowchart-50k.mmd'), 'utf8');
const runs = Number(process.argv[2] ?? 10);
const { parser } = mermaidLanguage().language;

const times: number[] = [];
for (let i = 0; i < runs; i++) {
  const t = performance.now();
  parser.parse(text);
  times.push(performance.now() - t);
}
times.sort((a, b) => a - b);
const fmt = (ms: number) => `${ms.toFixed(1)} ms`;
process.stdout.write(
  `Full parse of flowchart-50k.mmd (${text.length} chars), ${runs} runs: ` +
    `best ${fmt(times[0]!)}, median ${fmt(times[Math.floor(runs / 2)]!)}\n`
);
