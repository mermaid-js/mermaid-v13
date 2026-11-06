import { describe, expect, it } from 'vitest';
import { LEXICAL_ERROR, loadJisonLexerOracle } from '../../jison/oracle.ts';
import { quadrantGateCorpus } from '../corpus.ts';
import { asJison, grammarTokens } from './quadrant-grammar.ts';

/**
 * Lexer modes first (parser-method.md §2): the `@lexer` section of `grammar/quadrant.ebnf` emits
 * exactly mermaid\@12's jison token stream (names and images, unnormalised) on the text v12's
 * lexer received, over the lexer gate's corpus.
 */
describe('quadrant grammar lexer', () => {
  it('builds the lexer input v12 lexed', async () => {
    const oracle = await loadJisonLexerOracle('quadrant');
    const diffs: string[] = [];
    for (const item of await quadrantGateCorpus()) {
      const v12 = await oracle.lexedText(item.source);
      if (v12 === undefined) continue;
      const ours = grammarTokens(item.source).input.text;
      if (ours !== v12)
        diffs.push(`${item.id}\n  v12 ${JSON.stringify(v12)}\n  ours ${JSON.stringify(ours)}`);
    }
    expect(diffs).toEqual([]);
  }, 120_000);

  it('emits the jison token stream', async () => {
    const oracle = await loadJisonLexerOracle('quadrant');
    const diffs: string[] = [];
    let compared = 0;
    for (const item of await quadrantGateCorpus()) {
      const v12 = (await oracle.tokens(item.source, { keepAppendedNewline: true }))?.map(
        ([n, i]): [string, string] => [n === LEXICAL_ERROR ? 'INVALID' : n, i]
      );
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
    expect(compared).toBeGreaterThan(400);
    expect(diffs.slice(0, 20)).toEqual([]);
  }, 120_000);
});
