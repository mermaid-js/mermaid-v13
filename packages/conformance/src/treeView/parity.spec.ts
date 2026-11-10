import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { loadDivergences } from '../divergences.ts';
import { DIVERGENCES_DIR } from '../registry.ts';
import { runParity } from '../runner.ts';
import type { CorpusItem } from '../types.ts';
import { treeViewGateCorpus } from './corpus.ts';
import { treeViewAdapter } from './v13.ts';

/**
 * Oracle parity for treeView (R-COMPAT-2…4, #572) over the lexer gate's whole set: the e2e
 * fixtures and the v12 spec strings (also in the main parity run), `corpus/treeView-cases.json`,
 * the recovery set and the line-separator cases, each also with CRLF line breaks and with
 * comment lines added. Accept/reject and the normalised model (`v12.ts`, `v13.ts`: `getRoot()`
 * as a depth-first list of depth, name, node type, icon, class and description, `getCount()`, the
 * title and accessibility) must agree, except the divergences listed in `divergences/treeView.json`.
 *
 * The listed treeView divergences are core's reading, shared by every type, and the second test
 * checks they differ only there ({@link CORE}):
 * - `treeView-cases/unclosed-directive*`: core ends an unclosed `%%{` at its line end and reports
 *   `UNCLOSED_DIRECTIVE`, so v13 rejects what v12 accepted with the rest removed.
 *
 * The lexer gate's other exclusion, `treeView-cases/cypress-custom-config-raw` (core reads front
 * matter after leading blank lines), agrees here: both reject it, v12 for its `---` lines, v13
 * for the blank line its template ends with.
 */
const CORE: ReadonlyMap<string, RegExp> = new Map([
  ['treeView-cases/unclosed-directive', /^UNCLOSED_DIRECTIVE/],
]);

async function* each(items: CorpusItem[]): AsyncGenerator<CorpusItem> {
  yield* items;
}

const run = async () =>
  runParity({
    adapters: [treeViewAdapter],
    corpus: each(await treeViewGateCorpus()),
    divergences: loadDivergences(fileURLToPath(DIVERGENCES_DIR)),
  });

describe('treeView oracle parity with mermaid@12', () => {
  it('matches accept/reject and the model over the gate corpus', async () => {
    const report = await run();
    const agree = report.results.filter((r) => r.status === 'agree');
    const rejected = agree.filter((r) => !r.oracleAccepted).length;
    process.stdout.write(
      `treeView parity: ${report.results.length} sources, ${agree.length} agree (${rejected} rejected by both), ${report.expected.length} listed divergences\n`
    );
    expect(agree.length).toBeGreaterThan(900);
    expect(rejected).toBeGreaterThan(100);
    expect({ unlisted: report.unlisted, disappeared: report.disappeared }).toEqual({
      unlisted: [],
      disappeared: [],
    });
  }, 300_000);

  it('differs only in core, where the list says (unclosed directives)', async () => {
    const report = await run();
    const prefixes = [...CORE.keys()];
    for (const prefix of prefixes) {
      expect(
        report.expected.some((d) => d.id.startsWith(prefix)),
        prefix
      ).toBe(true);
    }
    for (const d of report.expected) {
      const prefix = prefixes.find((p) => d.id.startsWith(p));
      expect(prefix, d.id).toBeDefined();
      expect(d.kind, d.id).toBe('reject');
      expect(d.detail, d.id).toMatch(CORE.get(prefix ?? '') ?? /^$/);
    }
  }, 300_000);
});
