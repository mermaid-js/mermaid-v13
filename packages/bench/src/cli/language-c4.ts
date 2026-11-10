/**
 * The language-service budget (R-LANG-4) for c4: one editing cycle (update + every query)
 * on the 50k-character c4 fixture, median over runs, per stage. Over the 15 ms budget
 * (D156) it fails only with `--enforce`, which belongs on the reference runner.
 *
 * From packages/bench: `pnpm exec tsx --conditions=mermaid-source src/cli/language-c4.ts`, with
 * `--runs 50`, `--warmup 10` and `--enforce` as options (no package script, shared-files.md).
 */
import { createLanguageService } from '@mermaid-js/language-service';
import { c4Language } from '@mermaid-js/diagram-c4/language';
import { bestOf, LANGUAGE_BUDGET_MS, typing } from '../language.ts';
import { measureC4, C4_FIXTURE } from '../language-c4.ts';
import { round } from '../stats.ts';
import { parseArgs } from './args.ts';

const args = parseArgs(process.argv.slice(2));
const log = (line: string) => process.stdout.write(line + '\n');
const service = createLanguageService();
await service.preload({ types: ['c4'] });

const texts = typing(C4_FIXTURE);
const r = measureC4(service, texts, {
  runs: args.num('runs', 50),
  warmup: args.num('warmup', 10),
});
const parse = bestOf(r.runs, (i) => c4Language.parse(texts(i), { keepTokens: true }));

log(`Language service (C4), ${r.chars} characters, ${r.runs} runs (median ms per stage)`);
for (const [stage, ms] of Object.entries(r.stages)) log(`  ${stage.padEnd(16)}${round(ms, 3)}`);
log(`  ${'cycle'.padEnd(16)}${round(r.total, 2)} (best ${round(r.best, 2)})`);
log(`  ${'bare parse'.padEnd(16)}${round(parse, 2)} (best; the facet's parse with tokens)`);
const over = r.total > LANGUAGE_BUDGET_MS;
log(`Budget ${LANGUAGE_BUDGET_MS} ms: ${over ? 'OVER' : 'within'}`);
if (over && args.flag('enforce')) process.exitCode = 1;
