import { describe, expect, it } from 'vitest';
import { LEXICAL_ERROR, loadJisonLexerOracle } from '../../jison/oracle.ts';
import { agentflowCases, agentflowCorpus } from '../corpus.ts';
import { asJison, grammarTokens } from './agentflow-grammar.ts';

/** D463: the cases with a lone `%` in a label, which mermaid\@12.2.0 failed to lex. */
const LONE_PERCENT = [
  'diamond',
  'pipe',
  'round',
  'text',
  'text-end',
  'text-start',
  'trap',
  'two',
].map((c) => `agentflow-cases/percent-${c}`);

/**
 * Lexer modes first (notes/07): the `@lexer` section of `grammar/agentflow.ebnf` emits exactly
 * mermaid\@12's jison token stream (names and images, unnormalised) on the text v12's lexer
 * received, over the e2e fixtures, the v12 spec strings and the cases, but for D463's lone `%`
 * in a label (12.2.0 stops there with a lexical error; the grammar reads it as label text).
 */
describe('agentflow grammar lexer', () => {
  it('builds the lexer input v12 lexed', async () => {
    const oracle = await loadJisonLexerOracle('agentflow');
    const diffs: string[] = [];
    for (const item of [...(await agentflowCorpus()), ...agentflowCases()]) {
      const v12 = await oracle.lexedText(item.source);
      if (v12 === undefined) continue;
      const ours = grammarTokens(item.source).input.text;
      if (ours !== v12)
        diffs.push(`${item.id}\n  v12 ${JSON.stringify(v12)}\n  ours ${JSON.stringify(ours)}`);
    }
    expect(diffs).toEqual([]);
  }, 120_000);

  it('emits the jison token stream', async () => {
    const oracle = await loadJisonLexerOracle('agentflow');
    const diffs: string[] = [];
    const percent: string[] = [];
    let compared = 0;
    for (const item of [...(await agentflowCorpus()), ...agentflowCases()]) {
      const v12 = (await oracle.tokens(item.source, { keepAppendedNewline: true }))?.map(
        ([n, i]): [string, string] => [n === LEXICAL_ERROR ? 'INVALID' : n, i]
      );
      if (!v12) continue;
      compared++;
      const ours = asJison(grammarTokens(item.source));
      if (JSON.stringify(ours) === JSON.stringify(v12)) continue;
      if (LONE_PERCENT.includes(item.id) && v12.at(-1)?.[0] === 'INVALID') {
        percent.push(item.id);
        continue;
      }
      let at = 0;
      while (JSON.stringify(ours[at]) === JSON.stringify(v12[at])) at++;
      const show = (t: [string, string][]) =>
        t
          .slice(Math.max(0, at - 2), at + 3)
          .map(([n, i]) => `${n}:${JSON.stringify(i)}`)
          .join(' ');
      diffs.push(`${item.id} @${at}\n  v12  ${show(v12)}\n  ours ${show(ours)}`);
    }
    expect(compared).toBeGreaterThan(390);
    expect(diffs).toEqual([]);
    expect(percent.sort()).toEqual(LONE_PERCENT);
  }, 120_000);
});
