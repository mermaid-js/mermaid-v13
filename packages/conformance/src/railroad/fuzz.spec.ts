import { describe, expect, it } from 'vitest';
import { preprocess } from '@mermaid-js/core/preprocess';
import { runParity } from '../runner.ts';
import { hasUnknownEntityName } from '../v12-entities.ts';
import type { CorpusItem } from '../types.ts';
import { railroadCorpus } from './corpus.ts';
import { FUZZ_NOTATIONS, fuzzCorpus, fuzzInputs } from './fuzz.ts';
import { RAILROAD_ADAPTERS } from './v13.ts';

/** Inputs per notation; `RAILROAD_FUZZ` sets another count, `RAILROAD_FUZZ_SEED` the seed. */
const COUNT = Number(process.env.RAILROAD_FUZZ ?? 1500);
const SEED = Number(process.env.RAILROAD_FUZZ_SEED ?? 7);

/** v12's `directiveRegex` (`mermaid@12.2.0` `diagram-api/regexes.ts`), which `removeDirectives` cut. */
// eslint-disable-next-line mermaid/no-nested-quantifier -- v12's released directiveRegex is the oracle; small inputs only
const DIRECTIVE = /%{2}{\s*(?:(\w+)\s*:|(\w+))\s*(?:(\w+)|((?:(?!}%{2}).|\r?\n)*))?\s*(?:}%{2})?/gi;

/**
 * Whether `source` reaches a difference in core's preprocess, which every type shares and the
 * parity suite leaves out (as `cynefin/fuzz.spec.ts`): a directive that v12's `directiveRegex`
 * and core read differently (unclosed, over lines, or cut short by v12), or a front matter
 * block that v12 and core read differently (an empty one, listed in `divergences/railroad.json`; an
 * indented one, which core reads and v12 did not, as radar's divergences list; YAML that core's
 * reader refuses). So does a `#name;` core cannot decode, which v13 keeps as written and v12 made
 * `&name;` (D561).
 */
function coreDifference(source: string): boolean {
  // Core's own errors: an unclosed front matter or directive, front matter its YAML reader
  // refuses (v12's js-yaml took a `? key` entry).
  if (preprocess(source).diagnostics.some((d) => d.severity === 'error')) return true;
  for (let at = source.indexOf('%%{'); at >= 0; at = source.indexOf('%%{', at + 3)) {
    const close = source.indexOf('}%%', at + 3);
    if (close < 0 || /[\n\r]/.test(source.slice(at, close))) return true;
  }
  for (const m of source.matchAll(DIRECTIVE)) {
    const close = source.indexOf('}%%', m.index + 3);
    if (m.index + m[0].length !== close + 3) return true;
  }
  return /^\s*---\s*\r?\n---/.test(source) || hasUnknownEntityName(source);
}

/**
 * Pele's AST-equality fuzz, adopted as a parity property (spec #526 T2, D325): per notation,
 * {@link COUNT} generated inputs (`fuzz.ts`: mutated corpus inputs, random token pieces,
 * well-formed grammars of random shape, and those mutated) go through mermaid\@12 and v13. Pele
 * compared its own trees with `@mermaid-js/parser`'s; here the comparison is the parity
 * adapters': accept/reject, and the model v12's parsers built from those trees (rules in order,
 * each definition as the seven-kind tree, title, accTitle, accDescr). Inputs that reach a
 * difference in core's preprocess ({@link coreDifference}) are left out, and the run prints how
 * many. Both outcomes must be common, or the comparison says little.
 */
describe.each(FUZZ_NOTATIONS)('railroad fuzz parity ($notation)', (n) => {
  it('agrees with mermaid@12 on mutated and generated inputs', async () => {
    const all = (await railroadCorpus()).map((c) => c.source);
    const inputs = fuzzInputs(n, fuzzCorpus(n, all), COUNT, SEED);
    const items: CorpusItem[] = [];
    let core = 0;
    for (const [i, input] of inputs.entries()) {
      if (coreDifference(input.source)) core++;
      else items.push({ id: `fuzz/${n.notation}/${SEED}/${i}`, source: input.source });
    }
    const report = await runParity({ adapters: RAILROAD_ADAPTERS, corpus: items });
    const accepted = report.results.filter((r) => r.oracleAccepted).length;
    const show = (id: string) => JSON.stringify(items.find((i) => i.id === id)?.source);
    const diverging = report.unlisted.map((d) => `${d.id} ${d.kind}: ${show(d.id)} (${d.detail})`);
    process.stdout.write(
      `railroad ${n.notation} fuzz: ${items.length} inputs, ${accepted} accepted by v12, ${core} left out (core's preprocess and entity names)\n`
    );
    expect(diverging.slice(0, 10)).toEqual([]);
    expect(core).toBeLessThan(COUNT / 10);
    expect(accepted).toBeGreaterThan(items.length / 8);
    expect(accepted).toBeLessThan(items.length * 0.8);
  }, 600_000);
});
