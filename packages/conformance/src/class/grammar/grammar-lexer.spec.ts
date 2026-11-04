import { describe, expect, it } from 'vitest';
import { loadClassLexerOracle } from '../jison-lexer.ts';
import { classCorpus } from './corpus.ts';
import { asJison, grammarTokens } from './class-grammar.ts';

/**
 * Lexer modes first: the `@lexer` section of `grammar/class.ebnf` emits exactly mermaid 12's
 * jison token stream (names and images, unnormalised) on the text v12's lexer received, over
 * the e2e fixtures and the v12 spec strings.
 */
describe('class grammar lexer', () => {
  it('builds the lexer input v12 lexed', async () => {
    const oracle = await loadClassLexerOracle();
    const diffs: string[] = [];
    for (const item of await classCorpus()) {
      const v12 = await oracle.input(item.source);
      if (v12 === undefined) continue;
      const ours = grammarTokens(item.source).input.text;
      if (ours !== v12)
        diffs.push(`${item.id}\n  v12 ${JSON.stringify(v12)}\n  ours ${JSON.stringify(ours)}`);
    }
    expect(diffs).toEqual([]);
  }, 120_000);

  it('emits the jison token stream', async () => {
    const oracle = await loadClassLexerOracle();
    const diffs: string[] = [];
    let compared = 0;
    for (const item of await classCorpus()) {
      const v12 = await oracle.tokens(item.source);
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
    expect(compared).toBeGreaterThan(650);
    expect(diffs).toEqual([]);
  }, 120_000);
});
