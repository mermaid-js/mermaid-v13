import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { loadDivergences } from '../divergences.ts';
import { DIVERGENCES_DIR } from '../registry.ts';
import { runParity } from '../runner.ts';
import type { CorpusItem } from '../types.ts';
import { radarGateCorpus } from './corpus.ts';
import { radarAdapter } from './v13.ts';

/**
 * Oracle parity for radar (R-COMPAT-2…4, #446) over the lexer gate's whole set: the e2e
 * fixtures, the dev diagram and the v12 spec strings (the first and the last also in the main
 * parity run), and `corpus/radar-cases.json`, each also with CRLF line breaks and with comment
 * lines added. Accept/reject and the normalised model (`v12.ts`, `v13.ts`: `getAxes()`,
 * `getCurves()`, `getOptions()`, the title and accessibility) must agree, except the divergences
 * listed in `divergences/`.
 *
 * The listed radar divergences are core's reading, shared by every type, and the second test
 * checks they differ only there ({@link CORE}, {@link ENTITY_NAMES}):
 * - `radar-cases/unclosed-directive*`: core ends an unclosed `%%{` at its line end and reports
 *   `UNCLOSED_DIRECTIVE`, so v13 rejects what v12 accepted with the rest removed.
 * - `dev-diagrams/knsv/knsv2-03-radar.mmd`: its front matter is indented; core reads it (#7613)
 *   and reports `UNCLOSED_FRONT_MATTER`, where v12 saw no front matter. Its dedented copy
 *   (`radar-cases/dev-diagram-dedented`) agrees.
 * - `radar-cases/entities-semicolon`: a `#name;` whose name core's entity table does not hold stays as written, where
 *   v12 made it `&name;` (D559).
 */
const CORE: ReadonlyMap<string, RegExp> = new Map([
  ['radar-cases/unclosed-directive', /^UNCLOSED_DIRECTIVE/],
  ['dev-diagrams/knsv/knsv2-03-radar.mmd', /^UNCLOSED_FRONT_MATTER/],
]);

/** The model paths that differ under D559, by source. */
const ENTITY_NAMES: ReadonlyMap<string, RegExp> = new Map([
  ['radar-cases/entities-semicolon', /^axes\[0\]\.label$/],
]);

async function* each(items: CorpusItem[]): AsyncGenerator<CorpusItem> {
  yield* items;
}

const run = async () =>
  runParity({
    adapters: [radarAdapter],
    corpus: each(await radarGateCorpus()),
    divergences: loadDivergences(fileURLToPath(DIVERGENCES_DIR)),
  });

describe('radar oracle parity with mermaid@12', () => {
  it('matches accept/reject and the model over the gate corpus', async () => {
    const report = await run();
    const agree = report.results.filter((r) => r.status === 'agree');
    const rejected = agree.filter((r) => !r.oracleAccepted).length;
    process.stdout.write(
      `radar parity: ${report.results.length} sources, ${agree.length} agree (${rejected} rejected by both), ${report.expected.length} listed divergences\n`
    );
    expect(agree.length).toBeGreaterThan(550);
    expect(rejected).toBeGreaterThan(100);
    expect({ unlisted: report.unlisted, disappeared: report.disappeared }).toEqual({
      unlisted: [],
      disappeared: [],
    });
  }, 300_000);

  it('differs only in core, where the list says (unclosed directives, indented front matter, unknown entity names)', async () => {
    const report = await run();
    const prefixes = [...CORE.keys(), ...ENTITY_NAMES.keys()];
    for (const prefix of prefixes) {
      expect(
        report.expected.some((d) => d.id.startsWith(prefix)),
        prefix
      ).toBe(true);
    }
    for (const d of report.expected) {
      const prefix = prefixes.find((p) => d.id.startsWith(p));
      expect(prefix, d.id).toBeDefined();
      const core = CORE.get(prefix ?? '');
      expect(d.kind, d.id).toBe(core ? 'reject' : 'model');
      expect(d.detail, d.id).toMatch(core ?? ENTITY_NAMES.get(prefix ?? '') ?? /^$/);
    }
  }, 300_000);
});
