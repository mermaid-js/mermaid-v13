import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { parseWardley } from '@mermaid-js/diagram-wardley';
import { loadDivergences } from '../divergences.ts';
import { loadOracle } from '../oracle.ts';
import { DIVERGENCES_DIR } from '../registry.ts';
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
 * `divergences/`.
 *
 * The listed wardley divergences are core's reading, shared by every type, and the second test
 * checks they differ only there ({@link LISTED}): core ends an unclosed `%%{` at its line end and
 * reports `UNCLOSED_DIRECTIVE`, so v13 rejects what v12 accepted with the rest removed (or, after
 * a statement, read as a comment); and core's entity table, smaller than the HTML table a browser
 * drew v12's `#name;` codes from, so a name outside it is not decoded (GAPS #493), and stays
 * `#name;` as written (D561), also where no browser knew the name and v12 drew `&name;`.
 */
const LISTED: ReadonlyMap<string, { kind: string; detail: RegExp }> = new Map([
  ['wardley-cases/unclosed-directive', { kind: 'reject', detail: /^UNCLOSED_DIRECTIVE/ }],
  ['wardley-cases/directive-unclosed-in-line', { kind: 'reject', detail: /^UNCLOSED_DIRECTIVE/ }],
  [
    'wardley-cases/entities-outside-core',
    { kind: 'model', detail: /^nodes\[0\]\.id, nodes\[0\]\.label, notes\[0\]\.text$/ },
  ],
  [
    'e2e/nightly-check/parser-entity-codes.mmd',
    { kind: 'model', detail: /^links\[0\]\.target, nodes\[1\]\.id, nodes\[1\]\.label$/ },
  ],
]);

async function* each(items: CorpusItem[]): AsyncGenerator<CorpusItem> {
  yield* items;
}

const run = async () =>
  runParity({
    adapters: [wardleyAdapter],
    corpus: each(await wardleyGateCorpus()),
    divergences: loadDivergences(fileURLToPath(DIVERGENCES_DIR)),
  });

/** v12's syntax errors (Langium) and detection failures, which carry no DB message. */
const NOT_THROWN = /Parsing failed|Lexer error|Parse error|No diagram type detected/;

/**
 * One message for every check v12's `populateDb` throws from (`wardleyParser.ts`), as v12
 * words it: each axis of every `toPercent` context (16) and the pipeline parent. Each must be
 * thrown by mermaid\@12 for some corpus source, and be among v13's errors there.
 */
const THROWN = [
  'Anchor "Business" evolution must be between 0-1 (decimal) or 0-100 (percentage). Received: 200',
  'Anchor "User" visibility must be between 0-1 (decimal) or 0-100 (percentage). Received: 150',
  'Component "Cup" evolution must be between 0-1 (decimal) or 0-100 (percentage). Received: 101.5',
  'Component "Cup" visibility must be between 0-1 (decimal) or 0-100 (percentage). Received: 300',
  'Note "Hot" evolution must be between 0-1 (decimal) or 0-100 (percentage). Received: 101',
  'Note "Hot" visibility must be between 0-1 (decimal) or 0-100 (percentage). Received: 150',
  'Pipeline component "Gas" evolution must be between 0-1 (decimal) or 0-100 (percentage). Received: 150',
  'Evolve target for "Tea" must be between 0-1 (decimal) or 0-100 (percentage). Received: 120',
  'Annotations box evolution must be between 0-1 (decimal) or 0-100 (percentage). Received: 150',
  'Annotations box visibility must be between 0-1 (decimal) or 0-100 (percentage). Received: 500',
  'Annotation 7 evolution must be between 0-1 (decimal) or 0-100 (percentage). Received: 300',
  'Annotation 7 visibility must be between 0-1 (decimal) or 0-100 (percentage). Received: 150',
  'Accelerator "Cloud" evolution must be between 0-1 (decimal) or 0-100 (percentage). Received: 102',
  'Accelerator "Cloud" visibility must be between 0-1 (decimal) or 0-100 (percentage). Received: 150',
  'Deaccelerator "Legacy" evolution must be between 0-1 (decimal) or 0-100 (percentage). Received: 150',
  'Deaccelerator "Legacy" visibility must be between 0-1 (decimal) or 0-100 (percentage). Received: 102',
  'Pipeline "Pot" must reference an existing component with coordinates.',
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

  it('differs only in core, where the list says (unclosed directives, entity names)', async () => {
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
      expect(d.detail, d.id).toMatch(listed?.detail ?? /^$/);
    }
  }, 300_000);

  it("reports every message v12's DB threw, word for word, as an error", async () => {
    const oracle = await loadOracle();
    const missing: string[] = [];
    const seen = new Set<string>();
    let thrown = 0;
    for (const item of await wardleyGateCorpus()) {
      const v12 = await oracle.parse(item.source);
      if (v12.accepted || NOT_THROWN.test(v12.error)) continue;
      thrown++;
      seen.add(v12.error);
      const errors = parseWardley(item.source)
        .diagnostics.filter((d) => d.severity === 'error')
        .map((d) => d.message);
      if (!errors.includes(v12.error)) missing.push(`${item.id}: ${v12.error}`);
    }
    expect(thrown).toBeGreaterThan(30);
    expect(missing).toEqual([]);
    expect(THROWN.filter((m) => !seen.has(m))).toEqual([]);
  }, 300_000);
});
