// cspell:words compl complexity acctitle accdescr
import { describe, expect, it } from 'vitest';
import { preprocess } from '@mermaid-js/core/preprocess';
import { loadOracle } from '../oracle.ts';
import { runParity } from '../runner.ts';
import { hasUnknownEntityName } from '../v12-entities.ts';
import type { CorpusItem } from '../types.ts';
import { cynefinCases, cynefinCorpus } from './corpus.ts';
import { cynefinAdapter } from './v13.ts';

/**
 * Fuzzing (spec #423 "Testing", #465): the corpus and the quirk cases, mutated with fragments of
 * the syntax and its traps, through mermaid\@12 and v13. Accept/reject and the normalised model
 * must agree on every mutant.
 *
 * Each mutant inserts one fragment at an offset of the body (front matter is core's), replaces
 * a character with it, or cuts a span, from a seeded generator, so a failure names a
 * reproducible mutant. A mutant no adapter claims (the header cut) must be one v12 does not
 * detect either. The reference implementation's 51 fragments are
 * not on this machine (GAPS.md); {@link FRAGMENTS} is built from the spec's quirks instead.
 *
 * The known differences are core's directive reading, which every type shares (the parity
 * suite excludes unclosed directives for the same reason), and only these
 * ({@link coreDirective}; the run prints how many mutants they exempt, and asserts it is few):
 * - a `%%{` with no `}%%` before its line end, or with its `}%%` on a later line: v12's
 *   `directiveRegex` cut it with the rest of the line (or of the text, when a word follows the
 *   `{`) and parsed on; core reports `UNCLOSED_DIRECTIVE`, reads a bare `%%{` as a comment, or
 *   runs the directive to its `}%%` over line breaks;
 * - a closed one-line directive that v12's `directiveRegex` (`diagram-api/regexes.ts`) cuts
 *   short: a word right after `%%{name:` or after a bare `%%{name` ends its match, so
 *   `%%{init: x{}}%%` lost only `%%{init: x` and the rest reached v12's lexer; core removes the
 *   whole `%%{…}%%`.
 * Any other directive, a closed one on one line included (the "mid-line directive eats its
 * newline" quirk), is compared.
 *
 * A mutant that holds a `#name;` core cannot decode is exempt too: v13 keeps the name as written
 * where v12 made it `&name;` (D561, `hasUnknownEntityName`).
 */
/** v12's `directiveRegex` (`mermaid@12.2.0` `diagram-api/regexes.ts`), which `removeDirectives` cut. */
// eslint-disable-next-line mermaid/no-nested-quantifier -- v12's released directiveRegex is the oracle; small inputs only
const DIRECTIVE = /%{2}{\s*(?:(\w+)\s*:|(\w+))\s*(?:(\w+)|((?:(?!}%{2}).|\r?\n)*))?\s*(?:}%{2})?/gi;

/** Whether `source` has a directive that v12 and core read differently (see above). */
function coreDirective(source: string): boolean {
  for (let at = source.indexOf('%%{'); at >= 0; at = source.indexOf('%%{', at + 3)) {
    const close = source.indexOf('}%%', at + 3);
    if (close < 0 || /[\n\r]/.test(source.slice(at, close))) return true;
  }
  for (const m of source.matchAll(DIRECTIVE)) {
    const close = source.indexOf('}%%', m.index + 3);
    if (m.index + m[0].length !== close + 3) return true;
  }
  return false;
}

const FRAGMENTS = [
  'compl',
  'complex',
  'complexity',
  'complicated',
  'clear',
  'clearly',
  'chaotic',
  'confusion',
  'Clear',
  'COMPLEX',
  'cynefin-beta',
  'cynefin-beta:',
  '-->',
  '--->',
  '->',
  '--',
  ':',
  ': "x"',
  '"',
  "'",
  '""',
  '"a"',
  "'b'",
  '"a\nb"',
  '\\',
  '\\"',
  '%%',
  '%% c',
  '%%{',
  '%%{init: {}}%%',
  '}%%',
  'title',
  'title ',
  'title x',
  'accTitle',
  'accTitle:',
  'accTitle: t',
  'accDescr',
  'accDescr {',
  'accDescr { d }',
  'accDescr: d',
  '{',
  '}',
  '---',
  '---\n',
  '\n',
  '\n\n',
  '\r',
  '\r\n',
  '\t',
  ' ',
  ';',
  '@',
  '#',
  'é',
  '😀',
  '#35;',
  '#quot;',
  '&amp;',
  '<br>',
  ' ',
  ' ',
  ' ',
];

/** mulberry32: small, seeded and the same everywhere. */
function rng(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MUTANTS = 3000;

function mutants(sources: readonly CorpusItem[]): CorpusItem[] {
  const out: CorpusItem[] = [];
  const r = rng(465);
  const pick = <V>(xs: readonly V[]): V => xs[Math.floor(r() * xs.length)] as V;
  for (let n = 1; n <= MUTANTS; n++) {
    const { id, source } = pick(sources);
    // In the body: front matter is core's, and broken YAML is rejected before cynefin.
    const from = preprocess(source).bodyStart;
    const at = from + Math.floor(r() * (source.length - from + 1));
    const fragment = pick(FRAGMENTS);
    const op = r();
    let to = at;
    let put = fragment;
    let how = `insert ${JSON.stringify(fragment)} at ${at}`;
    if (op >= 0.85) {
      to = at + 1 + Math.floor(r() * 8);
      put = '';
      how = `cut ${at}…${to}`;
    } else if (op >= 0.6) {
      to = at + 1;
      how = `replace ${at} with ${JSON.stringify(fragment)}`;
    }
    const text = source.slice(0, at) + put + source.slice(to);
    out.push({ id: `mutant ${n}: ${id}, ${how}`, source: text });
  }
  return out;
}

describe('cynefin fuzzing against mermaid@12', () => {
  it('agrees on accept/reject and the model for every mutant', async () => {
    const sources = [...(await cynefinCorpus()), ...cynefinCases()];
    const items = mutants(sources);
    const report = await runParity({ adapters: [cynefinAdapter], corpus: items, divergences: [] });
    const byId = new Map(items.map((i) => [i.id, i]));
    const core = (id: string) => {
      const source = byId.get(id)?.source ?? '';
      return coreDirective(source) || hasUnknownEntityName(source);
    };
    const unexpected = report.unlisted.filter((d) => !core(d.id));
    const compared = report.results.filter((r) => r.status !== 'skipped');
    const accepted = compared.filter((r) => r.oracleAccepted).length;
    process.stdout.write(
      `cynefin fuzz: ${items.length} mutants, ${compared.length} compared, ${accepted} accepted by v12, ${report.unlisted.length - unexpected.length} exempt (core: directive reading, unknown entity names)\n`
    );
    // A source no adapter claims is skipped: v12 and v13 must agree it is not cynefin. A body
    // that starts with `---` is a front-matter error in v12 before any detector runs.
    const oracle = await loadOracle();
    const detection: string[] = [];
    for (const r of report.results.filter((x) => x.status === 'skipped')) {
      const source = byId.get(r.id)?.source ?? '';
      const v12 = await oracle.parse(source);
      const v12Detected =
        v12.accepted || !/No diagram type detected|Diagrams beginning with ---/.test(v12.error);
      if (v12Detected !== cynefinAdapter.detect(source)) detection.push(r.id);
    }
    expect(detection.slice(0, 10)).toEqual([]);
    expect(compared.length).toBeGreaterThan(MUTANTS * 0.6);
    expect(accepted).toBeGreaterThan(MUTANTS * 0.15);
    // Closed one-line directives are compared, not exempt.
    const directives = compared.filter((r) => {
      const source = byId.get(r.id)?.source ?? '';
      return source.includes('%%{') && !coreDirective(source);
    });
    expect(directives.length).toBeGreaterThan(50);
    // The exemptions stay a small share of the mutants (most do not touch a directive).
    expect(report.unlisted.length - unexpected.length).toBeLessThan(MUTANTS * 0.03);
    expect(unexpected.slice(0, 10)).toEqual([]);
  }, 300_000);
});
