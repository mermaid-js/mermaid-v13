import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { parseUsecase } from '@mermaid-js/diagram-usecase';
import { loadDivergences } from '../divergences.ts';
import { loadOracle } from '../oracle.ts';
import { DIVERGENCES_DIR } from '../registry.ts';
import { runParity } from '../runner.ts';
import type { CorpusItem } from '../types.ts';
import { usecaseGateCorpus } from './corpus.ts';
import { firstErrorProblem, readV12Error } from './errors.ts';
import { usecaseAdapter } from './v13.ts';

/**
 * Oracle parity for usecase (R-COMPAT-2…4, #563) over the lexer gate's whole set: the e2e
 * fixtures and the v12 spec strings (both also in the main parity run), and
 * `corpus/usecase-cases.json` with the recovery set, each also CRLF, with comment lines added,
 * and cut by a comment and by a directive after a CR. Accept/reject and the normalised model
 * (`v12.ts`, `v13.ts`: the getters `getActors()` … `getAccDescription()`) must agree, and on a
 * rejection the first error's offset (D473, `errors.ts`), except the divergences listed.
 *
 * Every listed divergence is core's reading, shared by every type ({@link LISTED}): core ends an
 * unclosed `%%{` at its line end and reports `UNCLOSED_DIRECTIVE`, where v12's directive regex
 * removed it with the line break after it (so v13 rejects what v12 accepted, or rejects it at the
 * directive, or, cut by a later `%%{…}%%` after a CR, reads the two as one directive and accepts
 * what v12 rejected); and core's entity table, smaller than the HTML table a browser drew v12's
 * `#name;` codes from, so a name outside it keeps its `&name;`.
 */
const LISTED: ReadonlyMap<string, { kind: string; detail: RegExp }> = new Map([
  // Before its prefix `directive-unclosed`: the first prefix that matches is used.
  ['usecase-cases/directive-unclosed-in-line', { kind: 'accept', detail: /^Error parsing/ }],
  ['usecase-cases/directive-unclosed', { kind: 'reject', detail: /^UNCLOSED_DIRECTIVE/ }],
  ['usecase-cases/entities-outside-core', { kind: 'model', detail: /^useCases\[2\]\.label$/ }],
]);

/**
 * The first error elsewhere: core's `UNCLOSED_DIRECTIVE` comes first (rejected by both), or
 * there is none (the copy cut by a directive, accepted, listed above).
 */
const OFFSET_LISTED = 'usecase-cases/directive-unclosed-in-line';

/**
 * Every message v12's model builder can throw (`usecaseModelBuilder.ts`), as a pattern; each
 * must be thrown by mermaid\@12 for some corpus source (and be among v13's errors there, word
 * for word). Two it throws from cannot be reached from the grammar: "Metadata target … is not
 * an explicit edge" (only edge ids resolve to edges) and "Parent boundary … is unresolved"
 * (every boundary an element names is declared).
 */
const THROWN = [
  /^ID '.*' is declared as both \w+ and \w+/,
  /^Generated ID '.*' collides with another declaration/,
  /^ID '.*' has conflicting labels/,
  /^Use case '.*' has conflicting shapes/,
  /^Element '.*' belongs to more than one system boundary/,
  /^Element '.*' has conflicting stereotypes/,
  /^Boundary '.*' has conflicting titles/,
  /^Relationship endpoint '.*' uses ::: without declaring the node/,
  /^Metadata target '.*' is unresolved/,
  /^Use case '.*' has conflicting business metadata/,
  /^Actor '.*' has conflicting type metadata/,
  /^Actor '.*' has conflicting icon metadata/,
  /^Actor '.*' has conflicting business metadata/,
  /^Actor '.*' cannot combine icon with type/,
  /^Business actor '.*' must use normal or hollow geometry/,
  /^Rectangular use case '.*' cannot be a business use case/,
  /^Note target '.*' is unresolved/,
  /^Note target '.*' must be an actor or use case/,
  /^Class\/style target '.*' is unresolved or anonymous/,
  /^Relationship source '.*' cannot be/,
  /^Relationship target '.*' cannot be/,
  /^include relationship requires use-case endpoints/,
  /^extend relationship requires use-case endpoints/,
  /^Generalization requires actor-to-actor or use-case-to-use-case endpoints/,
  /^JSON relationship '.*' to '.*' permits only/,
  /^Metadata property '.*' is invalid for/,
  /^ID '.*' is declared more than once/,
];

async function* each(items: CorpusItem[]): AsyncGenerator<CorpusItem> {
  yield* items;
}

const run = async () =>
  runParity({
    adapters: [usecaseAdapter],
    corpus: each(await usecaseGateCorpus()),
    divergences: loadDivergences(fileURLToPath(DIVERGENCES_DIR)),
  });

describe('usecase oracle parity with mermaid@12', () => {
  it('matches accept/reject and the model over the gate corpus', async () => {
    const report = await run();
    const agree = report.results.filter((r) => r.status === 'agree');
    const rejected = agree.filter((r) => !r.oracleAccepted).length;
    process.stdout.write(
      `usecase parity: ${report.results.length} sources, ${agree.length} agree (${rejected} rejected by both), ${report.expected.length} listed divergences\n`
    );
    expect(agree.length).toBeGreaterThan(1500);
    expect(rejected).toBeGreaterThan(400);
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

  it("reports v12's first error where v12 did, and its model messages word for word", async () => {
    const oracle = await loadOracle();
    const problems: string[] = [];
    const kinds = new Map<string, number>();
    const offsetListed: string[] = [];
    const seen = new Set<RegExp>();
    for (const item of await usecaseGateCorpus()) {
      const v12 = await oracle.parse(item.source);
      if (v12.accepted) continue;
      const error = readV12Error(item.source, v12.error);
      if (!error) continue;
      kinds.set(error.kind, (kinds.get(error.kind) ?? 0) + 1);
      for (const re of THROWN)
        if (error.message !== undefined && re.test(error.message)) seen.add(re);
      const problem = firstErrorProblem(error, parseUsecase(item.source).diagnostics);
      if (!problem) continue;
      if (item.id.startsWith(OFFSET_LISTED)) offsetListed.push(item.id);
      else problems.push(`${item.id}: ${problem}`);
    }
    expect(problems.slice(0, 10)).toEqual([]);
    // The listed ones still differ (else the list goes).
    expect(offsetListed.length).toBe(5);
    expect(kinds.get('parser')).toBeGreaterThan(300);
    expect(kinds.get('model')).toBeGreaterThan(100);
    expect(kinds.get('lexer')).toBeGreaterThan(20);
    expect(kinds.get('json')).toBeGreaterThan(0);
    expect(THROWN.filter((re) => !seen.has(re)).map((re) => re.source)).toEqual([]);
  }, 300_000);
});
