import { describe, expect, it } from 'vitest';
import { sequenceGateCorpus } from '../corpus.ts';
import { loadSequenceLexerOracle } from '../jison-lexer.ts';
import { asJison, grammarTokens } from './sequence-grammar.ts';

/**
 * Lexer modes first (parser-method §2): the `@lexer` section of `grammar/sequence.ebnf` emits
 * exactly mermaid\@12's jison token stream (names and images; the oracle takes v12's appended
 * `\n` off the token that matched it, so the grammar's image is clipped the same way) on the
 * text v12's lexer received, over the lexer gate's corpus.
 */
describe('sequence grammar lexer', () => {
  it('builds the lexer input v12 lexed', async () => {
    const oracle = await loadSequenceLexerOracle();
    const diffs: string[] = [];
    for (const item of await sequenceGateCorpus()) {
      const v12 = await oracle.input(item.source);
      if (v12 === undefined) continue;
      const ours = grammarTokens(item.source).input.text;
      if (ours !== v12)
        diffs.push(`${item.id}\n  v12 ${JSON.stringify(v12)}\n  ours ${JSON.stringify(ours)}`);
    }
    expect(diffs).toEqual([]);
  }, 120_000);

  it('emits the jison token stream', async () => {
    const oracle = await loadSequenceLexerOracle();
    const diffs: string[] = [];
    let compared = 0;
    for (const item of await sequenceGateCorpus()) {
      const v12 = await oracle.tokens(item.source);
      if (!v12) continue;
      compared++;
      const t = grammarTokens(item.source);
      const ours = asJison(t);
      // The oracle clipped v12's appended `\n` off the token that matched it.
      clip(ours, t.input.text.length, t);
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
    expect(compared).toBeGreaterThan(800);
    expect(diffs).toEqual([]);
  }, 120_000);
});

/** Take the final `\n` off the image of the token that ends at the end of the input. */
function clip(out: [string, string][], length: number, t: ReturnType<typeof grammarTokens>): void {
  for (let k = t.tokens.length - 1; k >= 0; k--) {
    const tok = t.tokens[k];
    if (!tok || tok.end < length) return;
    if (tok.start === tok.end) continue;
    const entry = out[k];
    if (entry?.[1].endsWith('\n')) entry[1] = entry[1].slice(0, -1);
    return;
  }
}
