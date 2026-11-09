import { describe, expect, it } from 'vitest';
import { loadJisonLexerOracle } from '../../jison/oracle.ts';
import { vennSyntaxCorpus } from '../corpus.ts';
import { asJison, grammarTokens } from './venn-grammar.ts';

/**
 * Lexer modes first (parser-method §2): the `@lexer` section of `grammar/venn.ebnf` emits
 * exactly mermaid\@12's jison token stream (names and images, as `asJison` reads them) on the
 * text v12's lexer received, over the lexer gate's corpus. Its modes carry v12's indent mode
 * (`on`, `onBol`: after a `set` or `union`), which v12's parser fed back to its lexer; the
 * oracle emulates that feedback (`vennYy`, #486). The unclosed directives are left out, as in
 * the lexer gate.
 */
describe('venn grammar lexer', () => {
  it('builds the lexer input v12 lexed', async () => {
    const oracle = await loadJisonLexerOracle('venn');
    const diffs: string[] = [];
    for (const item of await vennSyntaxCorpus()) {
      const v12 = await oracle.lexedText(item.source);
      if (v12 === undefined) continue;
      const ours = grammarTokens(item.source).input.text;
      if (ours !== v12)
        diffs.push(`${item.id}\n  v12 ${JSON.stringify(v12)}\n  ours ${JSON.stringify(ours)}`);
    }
    expect(diffs.slice(0, 10)).toEqual([]);
  }, 120_000);

  it('emits the jison token stream', async () => {
    const oracle = await loadJisonLexerOracle('venn');
    const diffs: string[] = [];
    let compared = 0;
    for (const item of await vennSyntaxCorpus()) {
      const v12 = await oracle.tokens(item.source);
      if (!v12) continue;
      compared++;
      const ours = asJison(grammarTokens(item.source));
      if (JSON.stringify(ours) === JSON.stringify(v12)) continue;
      let at = 0;
      while (JSON.stringify(ours[at]) === JSON.stringify(v12[at])) at++;
      const show = (x: [string, string][]) =>
        x
          .slice(Math.max(0, at - 2), at + 3)
          .map(([n, i]) => `${n}:${JSON.stringify(i)}`)
          .join(' ');
      diffs.push(`${item.id} @${at}\n  v12  ${show(v12)}\n  ours ${show(ours)}`);
    }
    expect(compared).toBeGreaterThan(1500);
    expect(diffs.slice(0, 10)).toEqual([]);
  }, 120_000);
});
