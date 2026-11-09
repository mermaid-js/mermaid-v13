import { describe, expect, it } from 'vitest';
import { loadUsecaseLexerOracle } from '../lexer-oracle.ts';
import type { ChevrotainPair } from '../lexer-oracle.ts';
import { usecaseGateCorpus } from '../corpus.ts';
import { CHEVROTAIN_NAME, grammarTokens } from './usecase-grammar.ts';

/**
 * Lexer section first (parser-method §2): the `@lexer` section of `grammar/usecase.ebnf` emits
 * exactly mermaid\@12's Chevrotain tokens (names and images) on the text v12's lexer received,
 * over the lexer gate's corpus. On a lexer error both are compared up to it, and it must be at
 * the same offset (D220). The grammar's JSON object rule balances five levels of braces; the
 * corpus nests fewer. The lexer gate's exclusions are left out: core's preprocess reads an
 * unclosed `%%{` otherwise (`lexer-parity.spec.ts`), so the lexer input differs there.
 */
const EXCLUDED = 'usecase-cases/directive-unclosed';
describe('usecase grammar lexer', () => {
  it('emits the Chevrotain token stream', async () => {
    const oracle = await loadUsecaseLexerOracle();
    const diffs: string[] = [];
    let compared = 0;
    let excluded = 0;
    for (const item of await usecaseGateCorpus()) {
      const input = await oracle.input(item.source);
      if (input === undefined) continue;
      compared++;
      const v12 = oracle.lexText(input);
      const ours = grammarTokens(item.source);
      if (ours.input.text !== input) {
        if (item.id.startsWith(EXCLUDED)) excluded++;
        else diffs.push(`${item.id}: the lexer input differs`);
        continue;
      }
      const tokens: ChevrotainPair[] = ours.tokens
        .filter((t) => t.name !== 'EOF' && (v12.errorAt === undefined || t.start < v12.errorAt))
        .map((t) => [CHEVROTAIN_NAME[t.name] ?? t.name, t.text]);
      const same =
        JSON.stringify([tokens, ours.error]) === JSON.stringify([v12.tokens, v12.errorAt]);
      if (!same) {
        diffs.push(
          `${item.id}\n  v12  ${JSON.stringify([v12.tokens, v12.errorAt])}\n  ours ${JSON.stringify([tokens, ours.error])}`
        );
      }
    }
    expect(compared).toBeGreaterThan(1500);
    expect(excluded).toBe(9);
    expect(diffs.slice(0, 10)).toEqual([]);
  }, 300_000);
});
