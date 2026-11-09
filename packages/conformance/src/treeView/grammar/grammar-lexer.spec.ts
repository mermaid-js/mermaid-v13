import { describe, expect, it } from 'vitest';
import { loadLangiumLexerOracle } from '../../langium-lexer.ts';
import type { LangiumToken } from '../../langium-lexer.ts';
import { treeViewGateCorpus } from '../corpus.ts';
import { grammarTokens, HIDDEN, LANGIUM_NAME } from './treeview-grammar.ts';

/**
 * Lexer section first (parser-method §2): the `@lexer` section of `grammar/treeview.ebnf` emits
 * exactly `@mermaid-js/parser@2.0.1`'s Chevrotain tokens (names and images, unnormalised, and
 * the hidden ones) on the text v12's Langium lexer read (after its box-drawing pass), over the
 * lexer gate's corpus. On a lexer error both are compared up to it, and it must be at the same
 * offset (D220). Where v12's box pass threw, the reference pass throws the same message.
 */
describe('treeView grammar lexer', () => {
  it('builds the lexer input v12 lexed', async () => {
    const oracle = await loadLangiumLexerOracle('treeView');
    const diffs: string[] = [];
    let compared = 0;
    let boxed = 0;
    let thrown = 0;
    for (const item of await treeViewGateCorpus()) {
      const trace = await oracle.trace(item.source);
      if (trace.parsed === undefined) continue;
      const ours = grammarTokens(item.source);
      if (trace.lexed === undefined) {
        thrown++;
        if (ours.boxError === undefined || !trace.error?.includes(ours.boxError)) {
          diffs.push(`${item.id}: v12 ${trace.error}, ours ${ours.boxError}`);
        }
        continue;
      }
      compared++;
      if (ours.boxed) boxed++;
      if (ours.input.text !== trace.lexed) {
        diffs.push(
          `${item.id}\n  v12 ${JSON.stringify(trace.lexed)}\n  ours ${JSON.stringify(ours.input.text)}`
        );
      }
    }
    process.stdout.write(
      `treeView grammar lexer input: ${compared} compared (${boxed} after a box rewrite), ${thrown} box errors\n`
    );
    expect(compared).toBeGreaterThan(900);
    expect(boxed).toBeGreaterThan(200);
    expect(thrown).toBeGreaterThan(30);
    expect(diffs.slice(0, 20)).toEqual([]);
  }, 120_000);

  it('emits the Chevrotain token stream', async () => {
    const oracle = await loadLangiumLexerOracle('treeView');
    const diffs: string[] = [];
    let compared = 0;
    for (const item of await treeViewGateCorpus()) {
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
    expect(compared).toBeGreaterThan(900);
    expect(diffs.slice(0, 20)).toEqual([]);
  }, 120_000);
});
