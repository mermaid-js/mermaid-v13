import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadDivergences, resolveCorpus, runParity } from './index.ts';
import { DIVERGENCES_FILE, PARITY_SUITES } from './registry.ts';

/**
 * The oracle parity suite (R-COMPAT-2…4). In CI it runs over the in-repo fixtures of every
 * registered diagram. QA runs it over an external folder with
 * `PARSE_FIXTURE_PATH=<dir> pnpm --filter @mermaid-js/conformance oracle` (D65).
 */
describe('oracle parity with mermaid@12', () => {
  it('matches accept/reject and the normalised model, except listed divergences', async () => {
    const report = await runParity({
      adapters: PARITY_SUITES.map((s) => s.adapter),
      corpus: resolveCorpus(process.env, PARITY_SUITES),
      divergences: loadDivergences(fileURLToPath(DIVERGENCES_FILE)),
    });
    const count = (status: string) => report.results.filter((r) => r.status === status).length;
    process.stdout.write(
      `oracle parity: ${report.results.length} sources, ${count('agree')} agree, ` +
        `${report.expected.length} listed divergences, ${count('skipped')} skipped\n`
    );
    expect({ unlisted: report.unlisted, disappeared: report.disappeared }).toEqual({
      unlisted: [],
      disappeared: [],
    });
  }, 600_000);
});
