import { describe, expect, it } from 'vitest';
import { LEXICAL_ERROR, loadJisonLexerOracle } from '../../jison/oracle.ts';
import { stateCorpus } from './corpus.ts';
import { asJison, grammarTokens } from './state-grammar.ts';

/**
 * Lexer modes first (parser-method §2): the `@lexer` section of `grammar/state.ebnf` emits
 * mermaid v12's jison token stream (names, and images after jison's trimming actions) on the
 * text v12's lexer received, over the e2e fixtures and the v12 spec strings.
 */
describe('state grammar lexer', () => {
  it('builds the lexer input v12 lexed', async () => {
    const oracle = await loadJisonLexerOracle('state');
    const diffs: string[] = [];
    for (const item of await stateCorpus()) {
      const v12 = await oracle.lexedText(item.source);
      if (v12 === undefined) continue;
      const ours = grammarTokens(item.source).input.text;
      if (ours !== v12)
        diffs.push(`${item.id}\n  v12 ${JSON.stringify(v12)}\n  ours ${JSON.stringify(ours)}`);
    }
    expect(diffs).toEqual([]);
  }, 120_000);

  it('emits the jison token stream', async () => {
    const oracle = await loadJisonLexerOracle('state');
    const diffs: string[] = [];
    let compared = 0;
    for (const item of await stateCorpus()) {
      const v12 = (await oracle.tokens(item.source))?.map(([n, i]): [string, string] => [
        n === LEXICAL_ERROR ? 'ERROR' : n,
        i,
      ]);
      if (!v12) continue;
      compared++;
      const ours = asJison(grammarTokens(item.source));
      if (JSON.stringify(ours) === JSON.stringify(v12)) continue;
      let at = 0;
      while (JSON.stringify(ours[at]) === JSON.stringify(v12[at])) at++;
      const show = (t: [string, string][]) =>
        t
          .slice(Math.max(0, at - 2), at + 3)
          .map(([n, i]) => `${n}:${JSON.stringify(i)}`)
          .join(' ');
      diffs.push(`${item.id} @${at}\n  v12  ${show(v12)}\n  ours ${show(ours)}`);
    }
    expect(compared).toBeGreaterThan(250);
    expect(diffs).toEqual([]);
  }, 120_000);
});
