import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { loadDivergences } from '../divergences.ts';
import { DIVERGENCES_FILE } from '../registry.ts';
import { runParity } from '../runner.ts';
import type { CorpusItem } from '../types.ts';
import { railroadGateCorpus } from './corpus.ts';
import { RAILROAD_ADAPTERS } from './v13.ts';

/**
 * Oracle parity for railroad (R-COMPAT-2…4, #610) over the lexer gates' whole set: the e2e
 * fixtures and v12 spec strings (also in the main parity run), the cases, each also with CRLF
 * line breaks and with comment lines added. Accept/reject and the normalised model (`v12.ts`,
 * `v13.ts`: rules in order with duplicates, each definition as the seven-kind tree, title,
 * accTitle, accDescr) must agree per notation, except listed divergences (`divergences.json`:
 * an empty front matter block, core's).
 *
 * Excluded ({@link isExcluded}), with the reason the lexer gates give: the unclosed-directive
 * cases. Core's preprocess ends an unclosed `%%{` at its line end and reports
 * `UNCLOSED_DIRECTIVE`, so v13 rejects what v12 accepted with the rest of the line (or the text)
 * removed. That is core's directive reading, shared by every type; the test below checks it
 * still holds.
 */
const EXCLUDED = ['railroad-cases/unclosed-directive', 'railroad-cases/directive-in-line-unclosed'];
const isExcluded = (id: string) => EXCLUDED.some((e) => id.startsWith(e));

async function* each(items: CorpusItem[]): AsyncGenerator<CorpusItem> {
  yield* items;
}

describe('railroad oracle parity with mermaid@12', () => {
  it('matches accept/reject and the model per notation over the gate corpus', async () => {
    const items = (await railroadGateCorpus()).filter((i) => !isExcluded(i.id));
    const report = await runParity({
      adapters: RAILROAD_ADAPTERS,
      corpus: each(items),
      divergences: loadDivergences(fileURLToPath(DIVERGENCES_FILE)),
    });
    const counts: Record<string, { accepted: number; rejected: number }> = {};
    for (const r of report.results) {
      if (r.status !== 'agree' || !r.adapter) continue;
      const c = (counts[r.adapter] ??= { accepted: 0, rejected: 0 });
      if (r.oracleAccepted) c.accepted++;
      else c.rejected++;
    }
    process.stdout.write(
      `railroad parity: ${report.results.length} sources; agree ${JSON.stringify(counts)}\n`
    );
    expect({ unlisted: report.unlisted, disappeared: report.disappeared }).toEqual({
      unlisted: [],
      disappeared: [],
    });
    // Each notation is compared on both outcomes.
    for (const a of RAILROAD_ADAPTERS) {
      expect(counts[a.id]?.accepted ?? 0, a.id).toBeGreaterThan(40);
      expect(counts[a.id]?.rejected ?? 0, a.id).toBeGreaterThan(20);
    }
  }, 600_000);

  it('still differs on unclosed directives, in core (the exclusion above)', async () => {
    const items = (await railroadGateCorpus()).filter((i) => isExcluded(i.id));
    const report = await runParity({ adapters: RAILROAD_ADAPTERS, corpus: each(items) });
    expect(items.length).toBeGreaterThan(0);
    for (const r of report.results) {
      expect(r.divergence?.kind, r.id).toBe('reject');
      expect(r.divergence?.detail, r.id).toMatch(/^UNCLOSED_DIRECTIVE/);
    }
  }, 60_000);
});
