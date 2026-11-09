import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { loadDivergences } from '../divergences.ts';
import { DIVERGENCES_DIR } from '../registry.ts';
import { runParity } from '../runner.ts';
import type { CorpusItem } from '../types.ts';
import { journeyGateCorpus } from './corpus.ts';
import { journeyAdapter } from './v13.ts';

/**
 * Oracle parity for journey (R-COMPAT-2…4, #302) over the lexer gate's whole set: the e2e
 * fixtures and v12 spec strings (also in the main parity run), the parser cases, the T1 edge
 * and line-separator cases, each also with CRLF line breaks and with comment lines added, and
 * the every-code-unit sources. Accept/reject and the normalised model (`v12.ts`, `v13.ts`)
 * must agree, except listed divergences.
 */
async function* each(items: CorpusItem[]): AsyncGenerator<CorpusItem> {
  yield* items;
}

describe('journey oracle parity with mermaid@12', () => {
  it('matches accept/reject and the model over the gate corpus', async () => {
    const items = await journeyGateCorpus();
    const report = await runParity({
      adapters: [journeyAdapter],
      corpus: each(items),
      divergences: loadDivergences(fileURLToPath(DIVERGENCES_DIR)),
    });
    const agree = report.results.filter((r) => r.status === 'agree');
    const rejected = agree.filter((r) => !r.oracleAccepted).length;
    process.stdout.write(
      `journey parity: ${report.results.length} sources, ${agree.length} agree (${rejected} rejected by both)\n`
    );
    expect(report.results.filter((r) => r.status === 'skipped').map((r) => r.id)).toEqual([]);
    expect(rejected).toBeGreaterThan(50);
    expect({ unlisted: report.unlisted, disappeared: report.disappeared }).toEqual({
      unlisted: [],
      disappeared: [],
    });
  }, 600_000);
});
