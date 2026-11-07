import { describe, expect, it } from 'vitest';
import { runParity } from '../runner.ts';
import { loadDivergences } from '../divergences.ts';
import { fileURLToPath } from 'node:url';
import { DIVERGENCES_FILE } from '../registry.ts';
import type { CorpusItem } from '../types.ts';
import { pieGateCorpus } from './corpus.ts';
import { pieAdapter } from './v13.ts';

/**
 * Oracle parity for pie (R-COMPAT-2…4, #305) over the lexer gate's whole set: the e2e fixtures
 * and v12 spec strings (also in the main parity run), the quirks, the parser cases and the
 * line-separator cases, each also with CRLF line breaks and with comment lines added.
 * Accept/reject and the normalised model (`v12.ts`, `v13.ts`) must agree, except listed
 * divergences.
 *
 * Excluded ({@link EXCLUDED}), with the reason the lexer gate gives: `pie-cases/unclosed directive …`.
 * Core's preprocess ends an unclosed `%%{` at its line end and reports `UNCLOSED_DIRECTIVE`, so
 * v13 rejects what v12 accepted with the rest of the line (or the text) removed. That is core's
 * directive reading, shared by every type; the test below checks it still holds.
 */
const EXCLUDED = 'pie-cases/unclosed directive ';

async function* each(items: CorpusItem[]): AsyncGenerator<CorpusItem> {
  yield* items;
}

describe('pie oracle parity with mermaid@12', () => {
  it('matches accept/reject and the model over the gate corpus', async () => {
    const items = (await pieGateCorpus()).filter((i) => !i.id.startsWith(EXCLUDED));
    const report = await runParity({
      adapters: [pieAdapter],
      corpus: each(items),
      divergences: loadDivergences(fileURLToPath(DIVERGENCES_FILE)),
    });
    const agree = report.results.filter((r) => r.status === 'agree');
    const rejected = agree.filter((r) => !r.oracleAccepted).length;
    process.stdout.write(
      `pie parity: ${report.results.length} sources, ${agree.length} agree (${rejected} rejected by both)\n`
    );
    expect(agree.length).toBeGreaterThan(550);
    expect(rejected).toBeGreaterThan(100);
    expect({ unlisted: report.unlisted, disappeared: report.disappeared }).toEqual({
      unlisted: [],
      disappeared: [],
    });
  }, 300_000);

  it('still differs on unclosed directives, in core (the exclusion above)', async () => {
    const items = (await pieGateCorpus()).filter((i) => i.id.startsWith(EXCLUDED));
    const report = await runParity({
      adapters: [pieAdapter],
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
