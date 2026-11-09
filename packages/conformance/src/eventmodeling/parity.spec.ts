import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { parseEventModel } from '@mermaid-js/diagram-eventmodeling';
import { LineIndex } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import { loadDivergences } from '../divergences.ts';
import { loadOracle } from '../oracle.ts';
import { DIVERGENCES_FILE } from '../registry.ts';
import { runParity } from '../runner.ts';
import type { CorpusItem } from '../types.ts';
import { eventModelingGateCorpus } from './corpus.ts';
import { eventModelingAdapter } from './v13.ts';

/**
 * Oracle parity for event modeling (R-COMPAT-2…4, #602) over the lexer gate's whole set: the
 * e2e fixtures and the v12 spec strings (both also in the main parity run), and
 * `corpus/eventmodeling-cases.json` with the recovery set, each also with CRLF line breaks and
 * with comment lines added. Accept/reject and the normalised model (`v12.ts`, `v13.ts`: v12's
 * `getState()` lanes, boxes and relations, its AST's lists, the title and accessibility) must
 * agree, except the divergences listed in `divergences.json`.
 *
 * The second test checks they differ only where {@link LISTED} says: the maintainer's fixes
 * D522 (one lane per namespace: lanes, the boxes in them, and an inferred relation that now
 * finds its source in the same lane) and D523 (data text: box text only), and core's reading of
 * an unclosed `%%{` (`UNCLOSED_DIRECTIVE`), shared by every type.
 */
/** A model divergence whose every differing path matches `path`. */
const only = (path: RegExp) => ({
  kind: 'model',
  detail: (detail: string) => detail.split(', ').every((p) => path.test(p)),
});
const D523 = only(/^boxes\[\d+\]\.text$/);
const D522 = only(/^(?:boxes\[\d+\]\.lane|lanes\b.*|relations\[\d+\]\.source)$/);
const reject = (detail: string) => detail.startsWith('UNCLOSED_DIRECTIVE');
const LISTED: ReadonlyMap<string, { kind: string; detail: (detail: string) => boolean }> = new Map([
  ['eventmodeling-cases/unclosed-directive', { kind: 'reject', detail: reject }],
  ['eventmodeling-cases/directive-in-line-unclosed', { kind: 'reject', detail: reject }],
  ['eventmodeling-cases/inline-', D523],
  ['e2e/nightly-check/parser-inline-data.mmd', D523],
  ['v12-specs/eventmodeling.test.ts#1', D523],
  ['e2e/nightly-check/parser-namespace-repeated.mmd', D522],
  ['e2e/nightly-check/parser-same-lane.mmd', D522],
]);

async function* each(items: CorpusItem[]): AsyncGenerator<CorpusItem> {
  yield* items;
}

const run = async () =>
  runParity({
    adapters: [eventModelingAdapter],
    corpus: each(await eventModelingGateCorpus()),
    divergences: loadDivergences(fileURLToPath(DIVERGENCES_FILE)),
  });

/** v12's syntax errors (Langium) and detection failures, which carry no DB message. */
const NOT_THROWN = /Parsing failed|Lexer error|Parse error|No diagram type detected/;

describe('event modeling oracle parity with mermaid@12', () => {
  it('matches accept/reject and the model over the gate corpus', async () => {
    const report = await run();
    const agree = report.results.filter((r) => r.status === 'agree');
    const rejected = agree.filter((r) => !r.oracleAccepted).length;
    process.stdout.write(
      `eventmodeling parity: ${report.results.length} sources, ${agree.length} agree (${rejected} rejected by both), ${report.expected.length} listed divergences\n`
    );
    expect(agree.length).toBeGreaterThan(700);
    expect(rejected).toBeGreaterThan(300);
    expect({ unlisted: report.unlisted, disappeared: report.disappeared }).toEqual({
      unlisted: [],
      disappeared: [],
    });
  }, 300_000);

  it('differs only where the list says (D522, D523, unclosed directives)', async () => {
    const report = await run();
    const prefixes = [...LISTED.keys()];
    for (const prefix of prefixes) {
      expect(
        report.expected.some((d) => d.id.startsWith(prefix)),
        prefix
      ).toBe(true);
    }
    for (const d of report.expected) {
      const prefix = prefixes.find((p) => d.id.startsWith(p));
      expect(prefix, d.id).toBeDefined();
      const listed = LISTED.get(prefix ?? '');
      expect(d.kind, d.id).toBe(listed?.kind);
      expect(listed?.detail(d.detail), `${d.id}: ${d.detail}`).toBe(true);
    }
  }, 300_000);

  it("reports the duplicate frame id v12's DB threw, word for word, as an error", async () => {
    const oracle = await loadOracle();
    const missing: string[] = [];
    let thrown = 0;
    for (const item of await eventModelingGateCorpus()) {
      const v12 = await oracle.parse(item.source);
      if (v12.accepted || NOT_THROWN.test(v12.error)) continue;
      thrown++;
      // v12 counted lines after the front matter, v13 from the source's first line (#527).
      const pre = preprocess(item.source);
      const lines = new LineIndex(item.source).position(pre.bodyStart).line;
      const expected = v12.error.replace(
        / on line (\d+)$/,
        (_, n: string) => ` on line ${Number(n) + lines}`
      );
      const errors = parseEventModel(item.source)
        .diagnostics.filter((d) => d.severity === 'error')
        .map((d) => d.message);
      if (!errors.includes(expected)) missing.push(`${item.id}: ${v12.error}`);
    }
    expect(thrown).toBeGreaterThan(15);
    expect(missing).toEqual([]);
  }, 300_000);
});
