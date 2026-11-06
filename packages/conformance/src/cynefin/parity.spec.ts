import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadDivergences } from '../divergences.ts';
import { DIVERGENCES_FILE } from '../registry.ts';
import { runParity } from '../runner.ts';
import type { CorpusItem } from '../types.ts';
import { cynefinGateCorpus } from './corpus.ts';
import { cynefinAdapter } from './v13.ts';

/**
 * Oracle parity for cynefin (R-COMPAT-2…4, #465) over the lexer gate's whole set: the e2e
 * fixtures and harvested v12 strings (also in the main parity run), the quirk and recovery
 * cases (`corpus/cynefin-cases.json`, with the line-separator cases), each also with CRLF line
 * breaks and with comment lines added. Accept/reject and the normalised model (`v12.ts`,
 * `v13.ts`) must agree, except listed divergences.
 *
 * Excluded ({@link EXCLUDED}), with the reason the lexer gate gives: core's preprocess ends an
 * unclosed `%%{` at its line end and reports `UNCLOSED_DIRECTIVE`, so v13 rejects what v12
 * accepted with the rest of the line (or the text) removed. That is core's directive reading,
 * shared by every type (pie excludes it too); the second test checks it still holds.
 */
const EXCLUDED = 'cynefin-cases/unclosed-directive-';

async function* each(items: CorpusItem[]): AsyncGenerator<CorpusItem> {
  yield* items;
}

describe('cynefin oracle parity with mermaid@12', () => {
  it('matches accept/reject and the model over the gate corpus', async () => {
    const items = (await cynefinGateCorpus()).filter((i) => !i.id.startsWith(EXCLUDED));
    const report = await runParity({
      adapters: [cynefinAdapter],
      corpus: each(items),
      divergences: loadDivergences(fileURLToPath(DIVERGENCES_FILE)),
    });
    const agree = report.results.filter((r) => r.status === 'agree');
    const rejected = agree.filter((r) => !r.oracleAccepted).length;
    process.stdout.write(
      `cynefin parity: ${report.results.length} sources, ${agree.length} agree (${rejected} rejected by both)\n`
    );
    expect(agree.length).toBeGreaterThan(400);
    expect(rejected).toBeGreaterThan(100);
    expect({ unlisted: report.unlisted, disappeared: report.disappeared }).toEqual({
      unlisted: [],
      disappeared: [],
    });
  }, 300_000);

  it('still differs on unclosed directives, in core (the exclusion above)', async () => {
    const items = (await cynefinGateCorpus()).filter((i) => i.id.startsWith(EXCLUDED));
    const report = await runParity({
      adapters: [cynefinAdapter],
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
