// cspell:words titlex
import { describe, expect, it } from 'vitest';
import { language } from '@mermaid-js/diagram-railroad/language';
import { loadOracle } from '../oracle.ts';
import { railroadGateCorpus } from './corpus.ts';
import { railroadV12Snapshot } from './v12.ts';

/**
 * D513's hints (#616) say what mermaid\@12 does, so the oracle checks them:
 * - `RAILROAD_TITLE_PREFIX` at `titleW`: v12 has no rule `titleW`, and reads `W` as a rule's
 *   name where the rest is a rule; where no hint is given for a name glued to `title`, v12
 *   rejects the text (its lexer has no name starting there);
 * - `RAILROAD_TITLE_RULE`: v12 has no rule named `title`;
 * - `RAILROAD_SEMI_COMMENT`: v12 rejects the text (the `;` it swallowed ended no rule), and a
 *   deliberate end-of-line comment inside a rule, with no hint, is accepted.
 * Over hand-written cases per notation and over the railroad gate corpus.
 */
const oracle = await loadOracle();
const hintsOf = (source: string) =>
  language
    .parse(source, { keepTokens: true })
    .diagnostics.filter((d) => d.code.startsWith('RAILROAD_') && d.severity === 'info');

/** Every disagreement between `source`'s hints and what v12 does with it. */
async function problems(id: string, source: string): Promise<string[]> {
  const v12 = await oracle.parse(source);
  const rules =
    v12.accepted && v12.diagramType.startsWith('railroad')
      ? railroadV12Snapshot(v12.db).rules.map((r) => r.name)
      : [];
  const out: string[] = [];
  for (const h of hintsOf(source)) {
    const word = source.slice(h.range.start, h.range.end);
    if (h.code === 'RAILROAD_TITLE_PREFIX' && rules.includes(word))
      out.push(`${id}: v12 has a rule ${word}`);
    if (h.code === 'RAILROAD_TITLE_RULE' && rules.includes('title'))
      out.push(`${id}: v12 has a rule title`);
    if (h.code === 'RAILROAD_SEMI_COMMENT' && v12.accepted)
      out.push(`${id}: v12 accepts the text the \`;\` hint says fails`);
  }
  return out;
}

const CASES: readonly (readonly [header: string, body: string, hints: string[], v12: boolean])[] = [
  ['railroad-beta', 'titleCase = terminal("x") ;', ['RAILROAD_TITLE_PREFIX'], true],
  ['railroad-beta', 'title_x = terminal("x") ;', ['RAILROAD_TITLE_PREFIX'], true],
  ['railroad-beta', 'title-x = terminal("x") ;', [], false],
  ['railroad-beta', 'title=terminal("x") ;', ['RAILROAD_TITLE_RULE'], false],
  ['railroad-beta', 'title = terminal("x") ;', ['RAILROAD_TITLE_RULE'], true],
  ['railroad-ebnf-beta', 'title_x = "x" ;', ['RAILROAD_TITLE_PREFIX'], true],
  ['railroad-ebnf-beta', 'title::="x" ;', ['RAILROAD_TITLE_RULE'], false],
  ['railroad-abnf-beta', 'titlex = "x" ;', ['RAILROAD_TITLE_PREFIX'], true],
  ['railroad-abnf-beta', 'title_x = "x" ;', [], false],
  ['railroad-abnf-beta', 'title-x = "x" ;', [], false],
  ['railroad-abnf-beta', 'title="x" ;', ['RAILROAD_TITLE_RULE'], false],
  ['railroad-peg-beta', 'titleX <- "x" ;', ['RAILROAD_TITLE_PREFIX'], true],
  ['railroad-peg-beta', 'title-x <- "x" ;', [], false],
  ['railroad-peg-beta', 'title<-"x" ;', ['RAILROAD_TITLE_RULE'], false],
  ['railroad-abnf-beta', 'a = "x" ; b = "y" ;\nc = "z" ;', ['RAILROAD_SEMI_COMMENT'], false],
  ['railroad-abnf-beta', 'a = "x" ;  \nb = "y" ;', ['RAILROAD_SEMI_COMMENT'], false],
  ['railroad-abnf-beta', 'a = "x" ; last', ['RAILROAD_SEMI_COMMENT'], false],
  ['railroad-abnf-beta', 'a = "x"   ; first\n  / "y" ;', [], true],
  ['railroad-abnf-beta', '; a comment\na = "x" ;', [], true],
];

describe('railroad D513 hints say what mermaid@12 does', () => {
  it.each(CASES)('%s %j', async (header, body, hints, accepted) => {
    const source = `${header}\n${body}\n`;
    expect(hintsOf(source).map((h) => h.code)).toEqual(hints);
    expect((await oracle.parse(source)).accepted).toBe(accepted);
    expect(await problems(body, source)).toEqual([]);
  });

  it('over the gate corpus', async () => {
    const found: string[] = [];
    let hinted = 0;
    for (const { id, source } of await railroadGateCorpus()) {
      if (hintsOf(source).length === 0) continue;
      hinted++;
      found.push(...(await problems(id, source)));
    }
    expect(hinted).toBeGreaterThan(10);
    expect(found).toEqual([]);
  }, 300_000);
});
