import { describe, expect, it } from 'vitest';
import { loadLangiumLexerOracle } from '../../langium-lexer.ts';
import type { LangiumToken } from '../../langium-lexer.ts';
import { radarGateCorpus } from '../corpus.ts';
import { grammarTokens, HIDDEN, LANGIUM_NAME } from './radar-grammar.ts';

/**
 * Lexer section first (parser-method §2): the `@lexer` section of `grammar/radar.ebnf` emits
 * exactly `@mermaid-js/parser@2.0.1`'s Chevrotain tokens (names and images, unnormalised, and
 * the hidden ones) on the text v12's parser received, over the lexer gate's corpus. On a lexer
 * error both are compared up to it, and it must be at the same offset (D220).
 */
describe('radar grammar lexer', () => {
  it('builds the lexer input v12 lexed', async () => {
    const oracle = await loadLangiumLexerOracle('radar');
    const diffs: string[] = [];
    let compared = 0;
    for (const item of await radarGateCorpus()) {
      const v12 = await oracle.input(item.source);
      if (v12 === undefined) continue;
      compared++;
      const ours = grammarTokens(item.source).input.text;
      if (ours !== v12)
        diffs.push(`${item.id}\n  v12 ${JSON.stringify(v12)}\n  ours ${JSON.stringify(ours)}`);
    }
    expect(compared).toBeGreaterThan(700);
    expect(diffs.slice(0, 20)).toEqual([]);
  }, 120_000);

  it('emits the Chevrotain token stream', async () => {
    const oracle = await loadLangiumLexerOracle('radar');
    const diffs: string[] = [];
    let compared = 0;
    for (const item of await radarGateCorpus()) {
      const input = await oracle.input(item.source);
      if (input === undefined) continue;
      compared++;
      const v12 = oracle.lexText(input);
      const ours = grammarTokens(item.source);
      const tokens: LangiumToken[] = [];
      const hidden: LangiumToken[] = [];
      for (const t of ours.tokens) {
        if (t.name === 'EOF') continue;
        const pair: LangiumToken = [LANGIUM_NAME[t.name] ?? t.name, t.text];
        (HIDDEN.has(t.name) ? hidden : tokens).push(pair);
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
    expect(compared).toBeGreaterThan(700);
    expect(diffs.slice(0, 20)).toEqual([]);
  }, 120_000);
});
