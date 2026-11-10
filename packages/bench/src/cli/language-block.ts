/**
 * The language-service budget (R-LANG-4) for block: one editing cycle (update + every query)
 * on the generated 50k-character block diagram, median over runs, per stage. Over the 15 ms
 * budget (D156) it fails only with `--enforce`, which belongs on the reference runner.
 *
 *   pnpm --filter \@mermaid-js/bench exec tsx --conditions=mermaid-source src/cli/language-block.ts
 *     [--runs 50] [--warmup 10] [--enforce]
 *
 * It cannot run before the manifest (#558): block is not a bench dependency until then, so
 * `@mermaid-js/diagram-block` does not resolve from this package. The facet is imported by a
 * specifier the type check does not resolve, so the bench type-checks meanwhile, and passed in
 * as a row of its own; T5 runs this CLI and reports its numbers, and may then import the facet
 * statically and drop the row.
 */
import { createLanguageService } from '@mermaid-js/language-service';
import type { LanguageFacet } from '@mermaid-js/language-service';
import { bestOf, LANGUAGE_BUDGET_MS, typing } from '../language.ts';
import { BLOCK_FIXTURE, measureBlock } from '../language-block.ts';
import { round } from '../stats.ts';
import { parseArgs } from './args.ts';

const BLOCK_LANGUAGE = '@mermaid-js/diagram-block/language';
const { detectBlock, language } = (await import(BLOCK_LANGUAGE)) as {
  detectBlock: (src: string) => boolean;
  language: LanguageFacet;
};

const args = parseArgs(process.argv.slice(2));
const log = (line: string) => process.stdout.write(line + '\n');
const service = createLanguageService({
  facets: [
    {
      type: 'block',
      id: 'block',
      detector: detectBlock,
      facet: language,
    },
  ],
});
await service.preload({ types: ['block'] });

const texts = typing(BLOCK_FIXTURE);
const r = measureBlock(service, texts, {
  runs: args.num('runs', 50),
  warmup: args.num('warmup', 10),
});
const parse = bestOf(r.runs, (i) => language.parse(texts(i), { keepTokens: true }));

log(`Language service (block), ${r.chars} characters, ${r.runs} runs (median ms per stage)`);
for (const [stage, ms] of Object.entries(r.stages)) log(`  ${stage.padEnd(16)}${round(ms, 3)}`);
log(`  ${'cycle'.padEnd(16)}${round(r.total, 2)} (best ${round(r.best, 2)})`);
log(`  ${'bare parse'.padEnd(16)}${round(parse, 2)} (best; the facet's parse with tokens)`);
log(
  `  answers         ${JSON.stringify({ ...r.answers, definition: r.answers.definition !== undefined })}`
);
const over = r.total > LANGUAGE_BUDGET_MS;
log(`Budget ${LANGUAGE_BUDGET_MS} ms: ${over ? 'OVER' : 'within'}`);
if (over && args.flag('enforce')) process.exitCode = 1;
