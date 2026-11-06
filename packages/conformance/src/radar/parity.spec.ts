import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { loadDivergences } from '../divergences.ts';
import { DIVERGENCES_FILE } from '../registry.ts';
import { runParity } from '../runner.ts';
import type { CorpusItem } from '../types.ts';
import { radarGateCorpus } from './corpus.ts';
import { radarAdapter } from './v13.ts';

/**
 * Oracle parity for radar (R-COMPAT-2…4, #446) over the lexer gate's whole set: the e2e
 * fixtures, the dev diagram and the v12 spec strings (the first and the last also in the main
 * parity run), and `corpus/radar-cases.json`, each also with CRLF line breaks and with comment
 * lines added. Accept/reject and the normalised model (`v12.ts`, `v13.ts`: `getAxes()`,
 * `getCurves()`, `getOptions()`, the title and accessibility) must agree, except listed
 * divergences.
 *
 * Excluded ({@link EXCLUDED}, by id prefix, every variant), with the reasons the lexer gate
 * gives, both core's reading shared by every type and each checked below to still differ only
 * there:
 * - `radar-cases/unclosed-directive`: core ends an unclosed `%%{` at its line end and reports
 *   `UNCLOSED_DIRECTIVE`, so v13 rejects what v12 accepted with the rest removed.
 * - `dev-diagrams/knsv/knsv2-03-radar.mmd`: its front matter is indented; core reads it (#7613)
 *   and reports `UNCLOSED_FRONT_MATTER`, where v12 saw no front matter. Its dedented copy
 *   (`radar-cases/dev-diagram-dedented`) is in the gate.
 */
const EXCLUDED: ReadonlyMap<string, RegExp> = new Map([
  ['radar-cases/unclosed-directive', /^UNCLOSED_DIRECTIVE/],
  ['dev-diagrams/knsv/knsv2-03-radar.mmd', /^UNCLOSED_FRONT_MATTER/],
]);
const excluded = (id: string) => [...EXCLUDED.keys()].some((p) => id.startsWith(p));

async function* each(items: CorpusItem[]): AsyncGenerator<CorpusItem> {
  yield* items;
}

describe('radar oracle parity with mermaid@12', () => {
  it('matches accept/reject and the model over the gate corpus', async () => {
    const items = (await radarGateCorpus()).filter((i) => !excluded(i.id));
    const report = await runParity({
      adapters: [radarAdapter],
      corpus: each(items),
      divergences: loadDivergences(fileURLToPath(DIVERGENCES_FILE)),
    });
    const agree = report.results.filter((r) => r.status === 'agree');
    const rejected = agree.filter((r) => !r.oracleAccepted).length;
    process.stdout.write(
      `radar parity: ${report.results.length} sources, ${agree.length} agree (${rejected} rejected by both)\n`
    );
    expect(agree.length).toBeGreaterThan(550);
    expect(rejected).toBeGreaterThan(100);
    expect({ unlisted: report.unlisted, disappeared: report.disappeared }).toEqual({
      unlisted: [],
      disappeared: [],
    });
  }, 300_000);

  it('still differs on the exclusions, in core', async () => {
    for (const [prefix, detail] of EXCLUDED) {
      const items = (await radarGateCorpus()).filter((i) => i.id.startsWith(prefix));
      const report = await runParity({
        adapters: [radarAdapter],
        corpus: each(items),
        divergences: [],
      });
      expect(items.length, prefix).toBeGreaterThan(0);
      for (const r of report.results) {
        expect(r.divergence?.kind, r.id).toBe('reject');
        expect(r.divergence?.detail, r.id).toMatch(detail);
      }
    }
  }, 60_000);
});
