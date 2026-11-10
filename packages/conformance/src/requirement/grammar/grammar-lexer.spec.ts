import { describe, expect, it } from 'vitest';
import { loadJisonLexerOracle } from '../../jison/oracle.ts';
import type { JisonToken } from '../../jison/oracle.ts';
import { DECIDED_RULES, requirementGateCorpus } from '../corpus.ts';
import { asJison, grammarTokens } from './requirement-grammar.ts';

/**
 * Lexer modes first (parser-method §2): the `@lexer` section of `grammar/requirement.ebnf`
 * emits exactly mermaid\@12's jison token stream (names and images, as `asJison` reads them) on
 * the text v12's lexer received, over the lexer gate's corpus, with D431's and D432's rules in
 * v12's lexer (`DECIDED_RULES`, as the hand-written lexer's gate). Both streams stop at the
 * first lexical error.
 */
const cut = (tokens: readonly JisonToken[]): JisonToken[] => {
  const at = tokens.findIndex(([n]) => n === 'LEXICAL_ERROR');
  return at < 0 ? [...tokens] : tokens.slice(0, at + 1);
};

describe('requirement grammar lexer', () => {
  it('builds the lexer input v12 lexed', async () => {
    const oracle = await loadJisonLexerOracle('requirement');
    const diffs: string[] = [];
    let compared = 0;
    for (const item of await requirementGateCorpus()) {
      const v12 = await oracle.lexedText(item.source);
      if (v12 === undefined) continue;
      compared++;
      const ours = grammarTokens(item.source).input.text;
      if (ours !== v12)
        diffs.push(`${item.id}\n  v12 ${JSON.stringify(v12)}\n  ours ${JSON.stringify(ours)}`);
    }
    expect(compared).toBeGreaterThan(3000);
    expect(diffs.slice(0, 10)).toEqual([]);
  }, 120_000);

  it('emits the jison token stream (v12 with D431 and D432)', async () => {
    const oracle = await loadJisonLexerOracle('requirement');
    const diffs: string[] = [];
    let compared = 0;
    for (const item of await requirementGateCorpus()) {
      const tokens = await oracle.tokens(item.source, { rules: DECIDED_RULES });
      if (!tokens) continue;
      compared++;
      const v12 = cut(tokens);
      const ours = cut(asJison(grammarTokens(item.source)));
      if (JSON.stringify(ours) === JSON.stringify(v12)) continue;
      let at = 0;
      while (JSON.stringify(ours[at]) === JSON.stringify(v12[at])) at++;
      const show = (x: JisonToken[]) =>
        x
          .slice(Math.max(0, at - 2), at + 3)
          .map(([n, i]) => `${n}:${JSON.stringify(i)}`)
          .join(' ');
      diffs.push(`${item.id} @${at}\n  v12  ${show(v12)}\n  ours ${show(ours)}`);
    }
    expect(compared).toBeGreaterThan(3000);
    expect(diffs.slice(0, 10)).toEqual([]);
  }, 120_000);
});
