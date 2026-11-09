import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { loadDivergences } from '../divergences.ts';
import { DIVERGENCES_DIR } from '../registry.ts';
import { runParity } from '../runner.ts';
import type { CorpusItem } from '../types.ts';
import { infoGateCorpus, UNCLOSED_DIRECTIVE } from './corpus.ts';
import { infoAdapter } from './v13.ts';

/**
 * Oracle parity for info (R-COMPAT-2…4, #420) over the lexer gate's whole set: the e2e fixtures
 * and v12 spec strings (also in the main parity run) and the cases, each also with CRLF line
 * breaks and with comment lines added. v12's info DB held nothing a source sets, so this is
 * accept/reject parity (`v12.ts`).
 *
 * Excluded: `unclosed directive …`, core's reading of an unclosed `%%{` (`UNCLOSED_DIRECTIVE`),
 * as in pie's parity suite; the second test checks it still holds.
 */
async function* each(items: CorpusItem[]): AsyncGenerator<CorpusItem> {
  yield* items;
}

describe('info oracle parity with mermaid@12', () => {
  it('matches accept/reject over the gate corpus', async () => {
    const items = (await infoGateCorpus()).filter((i) => !i.id.startsWith(UNCLOSED_DIRECTIVE));
    const report = await runParity({
      adapters: [infoAdapter],
      corpus: each(items),
      divergences: loadDivergences(fileURLToPath(DIVERGENCES_DIR)),
    });
    const agree = report.results.filter((r) => r.status === 'agree');
    const rejected = agree.filter((r) => !r.oracleAccepted).length;
    process.stdout.write(
      `info parity: ${report.results.length} sources, ${agree.length} agree (${rejected} rejected by both)\n`
    );
    expect(agree.length).toBeGreaterThan(280);
    expect(rejected).toBeGreaterThan(80);
    expect({ unlisted: report.unlisted, disappeared: report.disappeared }).toEqual({
      unlisted: [],
      disappeared: [],
    });
  }, 300_000);

  it('still differs on unclosed directives, in core (the exclusion above)', async () => {
    const items = (await infoGateCorpus()).filter((i) => i.id.startsWith(UNCLOSED_DIRECTIVE));
    const report = await runParity({
      adapters: [infoAdapter],
      corpus: each(items),
      divergences: [],
    });
    expect(items.length).toBeGreaterThan(0);
    for (const r of report.results) {
      expect(r.divergence?.kind, r.id).toBe('reject');
      expect(r.divergence?.detail, r.id).toMatch(/^UNCLOSED_DIRECTIVE/);
    }
  }, 60_000);
});
