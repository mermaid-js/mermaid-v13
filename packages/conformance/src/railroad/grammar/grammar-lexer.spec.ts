import { describe, expect, it } from 'vitest';
import { loadLangiumLexerOracle } from '../../langium-lexer.ts';
import type { LangiumToken } from '../../langium-lexer.ts';
import { notationOf, railroadGateCorpus } from '../corpus.ts';
import { grammarTokens, NOTATIONS, railroadGrammar } from './railroad-grammar.ts';

/**
 * Lexer section first (parser-method §2), per notation: the `@lexer` section of each grammar
 * file (`grammar/railroad{,-ebnf,-abnf,-peg}.ebnf`, D512) emits exactly
 * `@mermaid-js/parser@2.0.1`'s Chevrotain tokens for that notation (names and images,
 * unnormalised, and the hidden ones) on the text v12's parser received, over the lexer gates'
 * corpus routed to the notation. On a lexer error both are compared up to it, and it must be at
 * the same offset (D220).
 */
describe.each(NOTATIONS)('railroad grammar lexer (%s)', (notation) => {
  it('builds the lexer input v12 lexed', async () => {
    const oracle = await loadLangiumLexerOracle(notation);
    const diffs: string[] = [];
    let compared = 0;
    for (const item of await railroadGateCorpus()) {
      if (notationOf(item.source) !== notation) continue;
      const v12 = await oracle.input(item.source);
      if (v12 === undefined) continue;
      compared++;
      const ours = grammarTokens(notation, item.source).input.text;
      if (ours !== v12)
        diffs.push(`${item.id}\n  v12 ${JSON.stringify(v12)}\n  ours ${JSON.stringify(ours)}`);
    }
    expect(compared).toBeGreaterThan(150);
    // Unclosed directives: core's, and v12's regex differ (the lexer gates exclude them).
    expect(diffs.filter((d) => !/unclosed-directive|directive-in-line-unclosed/.test(d))).toEqual(
      []
    );
  }, 120_000);

  it('emits the Chevrotain token stream', async () => {
    const oracle = await loadLangiumLexerOracle(notation);
    const { names, hidden: hiddenNames } = railroadGrammar(notation);
    const diffs: string[] = [];
    let compared = 0;
    for (const item of await railroadGateCorpus()) {
      if (notationOf(item.source) !== notation) continue;
      const input = await oracle.input(item.source);
      if (input === undefined) continue;
      compared++;
      const v12 = oracle.lexText(input);
      const ours = grammarTokens(notation, item.source);
      const tokens: LangiumToken[] = [];
      const hidden: LangiumToken[] = [];
      for (const t of ours.tokens) {
        if (t.name === 'EOF') continue;
        const pair: LangiumToken = [names[t.name] ?? t.name, t.text];
        (hiddenNames.has(t.name) ? hidden : tokens).push(pair);
      }
      const same =
        JSON.stringify([tokens, hidden, ours.error]) ===
        JSON.stringify([v12.tokens, v12.hidden, v12.errorAt]);
      if (!same) {
        diffs.push(
          `${item.id}\n  v12  ${JSON.stringify([v12.tokens, v12.hidden, v12.errorAt])}\n  ours ${JSON.stringify([tokens, hidden, ours.error])}`
        );
      }
    }
    expect(compared).toBeGreaterThan(150);
    expect(diffs.slice(0, 20)).toEqual([]);
  }, 120_000);
});
