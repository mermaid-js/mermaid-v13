import { describe, expect, it } from 'vitest';
import { loadJisonLexerOracle } from '../jison/oracle.ts';
import type { JisonToken } from '../jison/oracle.ts';
import { vennGateCorpus } from './corpus.ts';

/**
 * The venn descriptor's `yy` builder (`vennYy` in `../jison/types.ts`) against v12 itself
 * (#486). `venn.jison`'s lexer reads indent mode from `yy` and only v12's parser turns it on
 * (the `set` and `union` actions), so the lexer oracle's stream, which runs the lexer alone on
 * that `yy`, is right only if the builder plays the parser's part. Here every source of the
 * lexer gate is parsed by v12 and the tokens its parser pulled (`oracle.pulledTokens`: the
 * lexer then read v12's own DB) must be the start of the oracle's stream, all of it when v12
 * accepted the source. The parser stops at its first error, so a rejected source is compared
 * up to there.
 *
 * Limit: the builder turns the mode on at the `SET` or `UNION` token, where v12 turns it on when
 * the statement reduces (after its last token, before the next line start, the only place the
 * mode is read). The two differ only on a line whose statement does not reduce, a parse error,
 * after which v12's parser pulls no further tokens; so this check cannot see the difference, and
 * past a parse error the oracle's stream is the lexer's under this emulation, not v12's.
 */
const key = (t: JisonToken[]) => JSON.stringify(t);

describe("venn yy emulation matches v12's parser feedback", () => {
  it("the oracle's stream starts with the parser's own over the gate corpus", async () => {
    const oracle = await loadJisonLexerOracle('venn');
    const items = await vennGateCorpus();
    const diffs: string[] = [];
    let compared = 0;
    let whole = 0;
    let indented = 0;
    for (const item of items) {
      // Core and v12 read an unclosed directive differently (see lexer-parity.spec.ts); the
      // stream itself is still v12's on both sides, so it is compared here too.
      const lexer = await oracle.tokens(item.source);
      const parser = await oracle.pulledTokens(item.source);
      if (!lexer || !parser) {
        expect(lexer).toBe(parser);
        continue;
      }
      compared++;
      if (parser.length === lexer.length) whole++;
      if (parser.some(([name]) => name === 'INDENT_TEXT')) indented++;
      if (key(parser) !== key(lexer.slice(0, parser.length))) {
        let at = 0;
        while (key([parser[at]!]) === key([lexer[at]!])) at++;
        diffs.push(`${item.id} @${at}: parser ${key(parser.slice(at, at + 3))}`);
      }
    }
    process.stdout.write(
      `venn yy emulation: ${compared} sources, ${whole} pulled whole, ${indented} with INDENT_TEXT\n`
    );
    expect(diffs).toEqual([]);
    // Not vacuous: most sources parse to the end, and many use indent mode.
    expect(whole).toBeGreaterThan(compared / 2);
    expect(indented).toBeGreaterThan(250);
  }, 300_000);

  it('gets nothing of the DB left by an earlier parse', async () => {
    const oracle = await loadJisonLexerOracle('venn');
    // A parse that ends with indent mode on, then one whose second line would be INDENT_TEXT
    // if the mode leaked: v12 clears its DB, and the builder's `yy` is fresh per run.
    await oracle.pulledTokens('venn-beta\n  set A');
    const parser = await oracle.pulledTokens('venn-beta\n  text A x');
    const lexer = await oracle.tokens('venn-beta\n  text A x');
    expect(parser?.map(([name]) => name)).toEqual([
      'VENN',
      'NEWLINE',
      'TEXT',
      'IDENTIFIER',
      'IDENTIFIER',
      'NEWLINE',
      'EOF',
    ]);
    expect(lexer).toEqual(parser);
  });
});
