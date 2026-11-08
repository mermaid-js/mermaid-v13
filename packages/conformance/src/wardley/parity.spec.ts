import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { parseWardley } from '@mermaid-js/diagram-wardley';
import { loadDivergences } from '../divergences.ts';
import { loadOracle } from '../oracle.ts';
import { DIVERGENCES_FILE } from '../registry.ts';
import { runParity } from '../runner.ts';
import type { CorpusItem } from '../types.ts';
import { wardleyGateCorpus } from './corpus.ts';
import { wardleyAdapter } from './v13.ts';

/**
 * Oracle parity for wardley (R-COMPAT-2…4, #489) over the lexer gate's whole set: the e2e
 * fixtures and the v12 spec strings (both also in the main parity run), and
 * `corpus/wardley-cases.json` with the recovery set, each also with CRLF line breaks and with
 * comment lines added. Accept/reject and the normalised model (`v12.ts`, `v13.ts`:
 * `getWardleyData()`, the title and accessibility) must agree, except the divergences listed in
 * `divergences.json`.
 *
 * The listed wardley divergences are core's reading, shared by every type, and the second test
 * checks they differ only there ({@link CORE}): core ends an unclosed `%%{` at its line end and
 * reports `UNCLOSED_DIRECTIVE`, so v13 rejects what v12 accepted with the rest removed (or, after
 * a statement, read as a comment).
 */
const CORE: ReadonlyMap<string, RegExp> = new Map([
  ['wardley-cases/unclosed-directive', /^UNCLOSED_DIRECTIVE/],
  ['wardley-cases/directive-unclosed-in-line', /^UNCLOSED_DIRECTIVE/],
]);

async function* each(items: CorpusItem[]): AsyncGenerator<CorpusItem> {
  yield* items;
}

const run = async () =>
  runParity({
    adapters: [wardleyAdapter],
    corpus: each(await wardleyGateCorpus()),
    divergences: loadDivergences(fileURLToPath(DIVERGENCES_FILE)),
  });

/** v12's syntax errors (Langium) and detection failures, which carry no DB message. */
const NOT_THROWN = /Parsing failed|Lexer error|Parse error|No diagram type detected/;

/** Every context v12's `toPercent` and pipeline check name in a thrown message. */
const CONTEXTS = [
  /^Anchor ".*" (evolution|visibility) must/,
  /^Component ".*" evolution must/,
  /^Component ".*" visibility must/,
  /^Note ".*" (evolution|visibility) must/,
  /^Pipeline component ".*" evolution must/,
  /^Evolve target for ".*" must/,
  /^Annotations box (evolution|visibility) must/,
  /^Annotation \d+ (evolution|visibility) must/,
  /^Accelerator ".*" (evolution|visibility) must/,
  /^Deaccelerator ".*" (evolution|visibility) must/,
  /^Pipeline ".*" must reference an existing component with coordinates\.$/,
];

describe('wardley oracle parity with mermaid@12', () => {
  it('matches accept/reject and the model over the gate corpus', async () => {
    const report = await run();
    const agree = report.results.filter((r) => r.status === 'agree');
    const rejected = agree.filter((r) => !r.oracleAccepted).length;
    process.stdout.write(
      `wardley parity: ${report.results.length} sources, ${agree.length} agree (${rejected} rejected by both), ${report.expected.length} listed divergences\n`
    );
    expect(agree.length).toBeGreaterThan(600);
    expect(rejected).toBeGreaterThan(250);
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

  it("reports every message v12's DB threw, word for word, as an error", async () => {
    const oracle = await loadOracle();
    const missing: string[] = [];
    const seen = new Set<RegExp>();
    let thrown = 0;
    for (const item of await wardleyGateCorpus()) {
      const v12 = await oracle.parse(item.source);
      if (v12.accepted || NOT_THROWN.test(v12.error)) continue;
      thrown++;
      for (const c of CONTEXTS) if (c.test(v12.error)) seen.add(c);
      const errors = parseWardley(item.source)
        .diagnostics.filter((d) => d.severity === 'error')
        .map((d) => d.message);
      if (!errors.includes(v12.error)) missing.push(`${item.id}: ${v12.error}`);
    }
    expect(thrown).toBeGreaterThan(30);
    expect(missing).toEqual([]);
    expect(CONTEXTS.filter((c) => !seen.has(c)).map(String)).toEqual([]);
  }, 300_000);
});
