/**
 * The language-service budget (R-LANG-4) for agentflow: one editing cycle (update + every query)
 * on the generated 50k-character agentflow, median over runs, per stage. Over the 15 ms
 * budget (D156) it fails only with `--enforce`, which belongs on the reference runner.
 *
 *   pnpm --filter \@mermaid-js/bench exec tsx --conditions=mermaid-source src/cli/language-agentflow.ts
 *     [--runs 50] [--warmup 10] [--enforce]
 *
 * The service loads the facet through the generated registry row (agentflow's manifest, #550).
 */
import { createLanguageService } from '@mermaid-js/language-service';
import { language } from '@mermaid-js/diagram-agentflow/language';
import { bestOf, LANGUAGE_BUDGET_MS, typing } from '../language.ts';
import { AGENTFLOW_FIXTURE, measureAgentflow } from '../language-agentflow.ts';
import { round } from '../stats.ts';
import { parseArgs } from './args.ts';

const args = parseArgs(process.argv.slice(2));
const log = (line: string) => process.stdout.write(line + '\n');
const service = createLanguageService();
await service.preload({ types: ['agentflow'] });

const texts = typing(AGENTFLOW_FIXTURE);
const r = measureAgentflow(service, texts, {
  runs: args.num('runs', 50),
  warmup: args.num('warmup', 10),
});
const parse = bestOf(r.runs, (i) => language.parse(texts(i), { keepTokens: true }));

log(`Language service (agentflow), ${r.chars} characters, ${r.runs} runs (median ms per stage)`);
for (const [stage, ms] of Object.entries(r.stages)) log(`  ${stage.padEnd(16)}${round(ms, 3)}`);
log(`  ${'cycle'.padEnd(16)}${round(r.total, 2)} (best ${round(r.best, 2)})`);
log(`  ${'bare parse'.padEnd(16)}${round(parse, 2)} (best; the facet's parse with tokens)`);
log(
  `  answers         ${JSON.stringify({ ...r.answers, definition: r.answers.definition !== undefined })}`
);
const over = r.total > LANGUAGE_BUDGET_MS;
log(`Budget ${LANGUAGE_BUDGET_MS} ms: ${over ? 'OVER' : 'within'}`);
if (over && args.flag('enforce')) process.exitCode = 1;
