import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { loadDivergences } from '../divergences.ts';
import { DIVERGENCES_FILE } from '../registry.ts';
import { runParity } from '../runner.ts';
import type { CorpusItem } from '../types.ts';
import { gitGraphGateCorpus } from './corpus.ts';
import { gitGraphAdapter } from './v13.ts';

/**
 * Oracle parity for gitGraph (R-COMPAT-2…4, #370) over the lexer gate's whole set: the e2e
 * fixtures and v12 spec strings (also in the main parity run), the quirks, the parser cases and
 * the line-separator cases, each also with CRLF line breaks and with comment lines added.
 * Accept/reject and the normalised model (`v12.ts`, `v13.ts`: commits, parents, branches and
 * their order, tags, types, direction, title fields) must agree, except listed divergences.
 * v12's `&lt;`/`&gt;`/`&equals;` (D263) are applied in the adapter (`v13.ts`).
 *
 * Excluded ({@link EXCLUDED}), with the reason the lexer gate gives: `unclosed directive …`.
 * Core's preprocess ends an unclosed `%%{` at its line end and reports `UNCLOSED_DIRECTIVE`, so
 * v13 rejects what v12 accepted with the rest of the line (or the text) removed. That is core's
 * directive reading, shared by every type; the test below checks it still holds.
 */
const EXCLUDED = 'unclosed directive ';

async function* each(items: CorpusItem[]): AsyncGenerator<CorpusItem> {
  yield* items;
}

describe('gitGraph oracle parity with mermaid@12', () => {
  it('matches accept/reject and the model over the gate corpus', async () => {
    const items = (await gitGraphGateCorpus()).filter((i) => !i.id.startsWith(EXCLUDED));
    const report = await runParity({
      adapters: [gitGraphAdapter],
      corpus: each(items),
      divergences: loadDivergences(fileURLToPath(DIVERGENCES_FILE)),
    });
    const agree = report.results.filter((r) => r.status === 'agree');
    const rejected = agree.filter((r) => !r.oracleAccepted).length;
    process.stdout.write(
      `gitGraph parity: ${report.results.length} sources, ${agree.length} agree (${rejected} rejected by both)\n`
    );
    expect(agree.length).toBeGreaterThan(1000);
    expect(rejected).toBeGreaterThan(150);
    expect({ unlisted: report.unlisted, disappeared: report.disappeared }).toEqual({
      unlisted: [],
      disappeared: [],
    });
  }, 300_000);

  it('still differs on unclosed directives, in core (the exclusion above)', async () => {
    const items = (await gitGraphGateCorpus()).filter((i) => i.id.startsWith(EXCLUDED));
    const report = await runParity({
      adapters: [gitGraphAdapter],
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
