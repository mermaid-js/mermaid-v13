import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ARCHITECTURE_GROUP_EDGE_END,
  ARCHITECTURE_GROUP_EDGE_UNGROUPED,
  parseArchitecture,
} from '@mermaid-js/diagram-architecture';
import { REPO_ROOT } from '../corpus.ts';
import { loadDivergences } from '../divergences.ts';
import { loadOracle } from '../oracle.ts';
import { DIVERGENCES_DIR } from '../registry.ts';
import { beforeFenceResults, BEFORE_FENCE_COMMENTED } from '../before-fence.ts';
import { runParity } from '../runner.ts';
import type { CorpusItem } from '../types.ts';
import { architectureGateCorpus } from './corpus.ts';
import { architectureAdapter, architectureV13Snapshot } from './v13.ts';
import { architectureV12Snapshot } from './v12.ts';

/**
 * Oracle parity for architecture (R-COMPAT-2…4, #599) over the lexer gate's whole set: the e2e
 * fixtures and the v12 spec strings (both also in the main parity run), and
 * `corpus/architecture-cases.json` with the recovery set, each also with CRLF line breaks and
 * with comment lines added. Accept/reject and the normalised model (`v12.ts`, `v13.ts`: the
 * DB's groups, services, junctions, edges and layout hints, the title and accessibility) must
 * agree, except the divergences listed in `divergences/architecture.json`.
 *
 * Those are {@link LISTED}: core's reading of an unclosed `%%{` (shared by every type: v13
 * rejects with `UNCLOSED_DIRECTIVE` what v12 accepted with the rest removed), D504's ignored
 * `{group}`, and D561's `#name;` kept as written when core's entity table does not hold the name
 * (v12 made it `&name;`). {@link DIFFERENCES} lists each of D504's four cases with what v12 and
 * v13 do.
 */
const LISTED: ReadonlyMap<string, { kind: string; detail: RegExp }> = new Map([
  ['architecture-cases/unclosed-directive', { kind: 'reject', detail: /^UNCLOSED_DIRECTIVE/ }],
  [
    'architecture-cases/directive-unclosed-in-line',
    { kind: 'reject', detail: /^UNCLOSED_DIRECTIVE/ },
  ],
  ['architecture-cases/edges-group-no-group', { kind: 'model', detail: /^edges\[0\]\.lhsGroup$/ }],
  [
    'architecture-cases/entities-outside-core',
    { kind: 'model', detail: /^services\[0\]\.title, services\[1\]\.title$/ },
  ],
]);

/** v12's syntax errors (Langium) and detection failures, which carry no DB message. */
const NOT_THROWN = /Parsing failed|Lexer error|Parse error|No diagram type detected/;

/** v12's `TypeError` for an edge end that names a group (D504; see {@link DIFFERENCES}). */
const TYPE_ERROR = "Cannot read properties of undefined (reading 'in')";

/**
 * One message for every check v12's DB throws from (`architectureDb.ts`), as v12 words it. Each
 * must be thrown by mermaid\@12 for some corpus source, and be among v13's errors there.
 * A group's "parent is not a group" cannot be thrown: v12 adds every group before any service
 * or junction, so a group's parent is a group or unknown. "An align directive requires at least
 * two members" cannot either: the grammar asks for two (`v12-specs/` calls the DB check
 * directly).
 */
const THROWN = [
  'The service id [a] is already in use by another node',
  'The service [a] cannot be placed within itself',
  "The service [a]'s parent does not exist. Please make sure the parent is created before this service",
  "The service [a]'s parent is not a group",
  'The junction id [a] is already in use by another node',
  'The junction [j] cannot be placed within itself',
  "The junction [j]'s parent does not exist. Please make sure the parent is created before this junction",
  "The junction [j]'s parent is not a group",
  'The group id [g] is already in use by another group',
  'The group [g] cannot be placed within itself',
  "The group [a]'s parent does not exist. Please make sure the parent is created before this group",
  'The left-hand id [a] does not yet exist. Please create the service/group before declaring an edge to it.',
  'The right-hand id [b] does not yet exist. Please create the service/group before declaring an edge to it.',
  'The left-hand id [a] is modified to traverse the group boundary, but the edge does not pass through two groups.',
  'The right-hand id [b] is modified to traverse the group boundary, but the edge does not pass through two groups.',
  'align row references [ghost], which is not a service or junction',
  'align row lists [a] more than once',
];

/** One of D504's four cases: a source, and what v12 and v13 do with it. */
interface Difference {
  /** A corpus id (`architecture-cases/…`) or a fixture path under `e2e/diagrams/architecture`. */
  readonly source: string;
  readonly v12: string;
  readonly v13: string;
  /** Checks both sides against the oracle's and the parser's results. */
  check(v12: Awaited<ReturnType<Oracle['parse']>>, source: string): void;
}

type Oracle = Awaited<ReturnType<typeof loadOracle>>;

/** D504: architecture edges v12 accepts and then breaks on, case by case. */
const DIFFERENCES: Readonly<Record<string, Difference>> = {
  'group-id edge end': {
    source: 'architecture-cases/edge-to-group-id',
    v12: 'rejects with a raw TypeError (`.in` read off the missing node, architectureDb.ts:225-226)',
    v13: "rejects with ARCHITECTURE_GROUP_EDGE_END and Pele's message",
    check(v12, source) {
      expect(v12.accepted).toBe(false);
      expect(v12.accepted ? '' : v12.error).toBe(TYPE_ERROR);
      const errors = parseArchitecture(source).diagnostics.filter((d) => d.severity === 'error');
      expect(errors.map((d) => [d.code, d.message])).toEqual([
        [
          ARCHITECTURE_GROUP_EDGE_END,
          'The right-hand id [g] is a group. Add {group} to a service inside it instead.',
        ],
      ]);
    },
  },
  'duplicate ordered pair': {
    source: 'architecture-cases/edges-duplicate-pair',
    v12: 'accepts both edges, then cytoscape throws `Can not create second element with ID` at render',
    v13: 'accepts both edges (`edge:a->b`, `edge:a->b@2`) and draws both',
    check(v12, source) {
      expect(v12.accepted).toBe(true);
      const { model, diagnostics } = parseArchitecture(source);
      expect(diagnostics).toEqual([]);
      expect(model.edges.map((e) => e.astId)).toEqual(['edge:a->b', 'edge:a->b@2']);
      if (v12.accepted) {
        expect(architectureV13Snapshot(model)).toEqual(architectureV12Snapshot(v12.db));
      }
    },
  },
  '`{group}` on an end in no group': {
    source: 'architecture-cases/edges-group-no-group',
    v12: 'keeps `lhsGroup` and moves the end by a group padding',
    v13: 'ignores it (`lhsGroup` false), with one ARCHITECTURE_GROUP_EDGE_UNGROUPED warning',
    check(v12, source) {
      expect(v12.accepted).toBe(true);
      const { model, diagnostics } = parseArchitecture(source);
      expect(diagnostics.map((d) => [d.severity, d.code])).toEqual([
        ['warning', ARCHITECTURE_GROUP_EDGE_UNGROUPED],
      ]);
      expect(model.edges[0]?.lhsGroup).toBe(false);
      if (v12.accepted) {
        const ours = architectureV13Snapshot(model);
        const theirs = architectureV12Snapshot(v12.db);
        expect(theirs.edges[0]?.lhsGroup).toBe(true);
        expect({ ...ours, edges: [] }).toEqual({ ...theirs, edges: [] });
      }
    },
  },
  'self and like-side edges': {
    source: 'nightly-check/lexer-like-side-and-self-edges.mmd',
    v12: 'accepts them and adds no layout constraint',
    v13: 'accepts them, as the same model, and draws them (compass routes them)',
    check(v12, source) {
      expect(v12.accepted).toBe(true);
      const { model, diagnostics } = parseArchitecture(source);
      expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      const self = model.edges.filter((e) => e.lhsId === e.rhsId);
      const like = model.edges.filter((e) => e.lhsId !== e.rhsId && e.lhsDir === e.rhsDir);
      expect(self.length).toBeGreaterThan(0);
      expect(like.length).toBeGreaterThan(0);
      if (v12.accepted) {
        expect(architectureV13Snapshot(model)).toEqual(architectureV12Snapshot(v12.db));
      }
    },
  },
};

async function* each(items: CorpusItem[]): AsyncGenerator<CorpusItem> {
  yield* items;
}

/** Leaves out {@link BEFORE_FENCE_COMMENTED} (D704), checked on its own below. */
const run = async () =>
  runParity({
    adapters: [architectureAdapter],
    corpus: each((await architectureGateCorpus()).filter((i) => i.id !== BEFORE_FENCE_COMMENTED)),
    divergences: loadDivergences(fileURLToPath(DIVERGENCES_DIR)),
  });

/** A {@link Difference}'s source text. */
async function sourceOf(ref: string): Promise<string> {
  if (ref.endsWith('.mmd')) {
    return readFileSync(join(REPO_ROOT, 'e2e/diagrams/architecture', ref), 'utf8');
  }
  const found = (await architectureGateCorpus()).find((c) => c.id === ref);
  if (!found) throw new Error(`no corpus case ${ref}`);
  return found.source;
}

describe('architecture oracle parity with mermaid@12', () => {
  it('matches accept/reject and the model over the gate corpus', async () => {
    const report = await run();
    const agree = report.results.filter((r) => r.status === 'agree');
    const rejected = agree.filter((r) => !r.oracleAccepted).length;
    process.stdout.write(
      `architecture parity: ${report.results.length} sources, ${agree.length} agree (${rejected} rejected by both), ${report.expected.length} listed divergences\n`
    );
    expect(agree.length).toBeGreaterThan(700);
    expect(rejected).toBeGreaterThan(350);
    expect({ unlisted: report.unlisted, disappeared: report.disappeared }).toEqual({
      unlisted: [],
      disappeared: [],
    });
  }, 300_000);

  it('differs only where the list says (unclosed directives, D504, D561)', async () => {
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

  it('still rejects the YAML of the commented copy below a `%%` line (D704)', async () => {
    const corpus = await architectureGateCorpus();
    const { items, results } = await beforeFenceResults(architectureAdapter, corpus);
    expect(items.length).toBe(1);
    expect(results.map((r) => [r.divergence?.kind, r.divergence?.detail])).toEqual([
      ['reject', expect.stringMatching(/^YAML_SYNTAX/)],
    ]);
  }, 60_000);

  it("reports every message v12's DB threw, word for word, as an error", async () => {
    const oracle = await loadOracle();
    const missing: string[] = [];
    const seen = new Set<string>();
    let thrown = 0;
    for (const item of await architectureGateCorpus()) {
      const v12 = await oracle.parse(item.source);
      if (v12.accepted || NOT_THROWN.test(v12.error)) continue;
      // D504: v12's TypeError has its own entry in DIFFERENCES.
      if (v12.error === TYPE_ERROR) continue;
      thrown++;
      seen.add(v12.error);
      const errors = parseArchitecture(item.source)
        .diagnostics.filter((d) => d.severity === 'error')
        .map((d) => d.message);
      if (!errors.includes(v12.error)) missing.push(`${item.id}: ${v12.error}`);
    }
    expect(thrown).toBeGreaterThan(40);
    expect(missing).toEqual([]);
    expect(THROWN.filter((m) => !seen.has(m))).toEqual([]);
  }, 300_000);

  describe("D504's differences", () => {
    for (const [name, d] of Object.entries(DIFFERENCES)) {
      it(`${name}: v12 ${d.v12}; v13 ${d.v13}`, async () => {
        const source = await sourceOf(d.source);
        const oracle = await loadOracle();
        d.check(await oracle.parse(source), source);
      });
    }
  });
});
