/**
 * The language-service budget (R-LANG-4) for requirement: one editing cycle (update + every query)
 * on the two 50k-character requirement fixtures (bare names, and quoted names with `#`, `&`
 * and `%`), median over runs, per stage. Over the 15 ms budget
 * (D156) it fails only with `--enforce`, which belongs on the reference runner.
 *
 *   pnpm --filter bench exec tsx --conditions=mermaid-source src/cli/language-requirement.ts
 *     [--runs 50] [--warmup 10] [--enforce]
 *
 * Until the manifest (#587) gives the facet its generated row, the facet is passed in.
 */
import { createLanguageService } from '@mermaid-js/language-service';
import { detectRequirement, requirementLanguage } from '@mermaid-js/diagram-requirement/language';
import { bestOf, LANGUAGE_BUDGET_MS, typing } from '../language.ts';
import {
  measureRequirement,
  REQUIREMENT_FIXTURE,
  REQUIREMENT_QUOTED_FIXTURE,
} from '../language-requirement.ts';
import { round } from '../stats.ts';
import { parseArgs } from './args.ts';

const args = parseArgs(process.argv.slice(2));
const log = (line: string) => process.stdout.write(line + '\n');
const service = createLanguageService({
  facets: [
    {
      type: 'requirement',
      id: 'requirement',
      detector: (src) => detectRequirement(src),
      facet: requirementLanguage,
    },
  ],
});
await service.preload({ types: ['requirement'] });

let over = false;
for (const [name, fixture] of [
  ['bare names', REQUIREMENT_FIXTURE],
  ['quoted names with #, & and %', REQUIREMENT_QUOTED_FIXTURE],
] as const) {
  const texts = typing(fixture);
  const r = measureRequirement(service, texts, {
    runs: args.num('runs', 50),
    warmup: args.num('warmup', 10),
  });
  const parse = bestOf(r.runs, (i) => requirementLanguage.parse(texts(i), { keepTokens: true }));
  log(
    `Language service (requirement, ${name}), ${r.chars} characters, ${r.runs} runs (median ms per stage)`
  );
  for (const [stage, ms] of Object.entries(r.stages)) log(`  ${stage.padEnd(16)}${round(ms, 3)}`);
  log(`  ${'cycle'.padEnd(16)}${round(r.total, 2)} (best ${round(r.best, 2)})`);
  log(`  ${'bare parse'.padEnd(16)}${round(parse, 2)} (best; the facet's parse with tokens)`);
  over ||= r.total > LANGUAGE_BUDGET_MS;
  log(`Budget ${LANGUAGE_BUDGET_MS} ms: ${r.total > LANGUAGE_BUDGET_MS ? 'OVER' : 'within'}`);
}
if (over && args.flag('enforce')) process.exitCode = 1;
