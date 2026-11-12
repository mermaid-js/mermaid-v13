import { describe, expect, it } from 'vitest';
import { decodeEntities } from '../../flowchart/v12.ts';
import { loadJisonLexerOracle } from '../../jison/oracle.ts';
import type { JisonToken } from '../../jison/oracle.ts';
import { c4GateCorpus } from '../corpus.ts';
import { lexingExclusion, v13Tokens } from '../d452.ts';
import type { Exclusion } from '../d452.ts';
import { asJison, grammarTokens } from './c4-grammar.ts';

/**
 * Lexer modes first (parser-method §2): the `@lexer` section of `grammar/c4.ebnf` emits
 * mermaid\@12's jison token stream (names and images, as `asJison` reads them, entity
 * placeholders decoded) on the text v12's lexer received, over the lexer gate's corpus, except
 * D452's three lexing changes, which the grammar describes as v13 lexes them. Where the lexer
 * gate excludes a source (`d452.ts` `lexingExclusion`: v13's stream differs from jison's by one
 * of them), the grammar's stream is compared with v13's instead (`c4Tokens` through
 * `JISON_NAMES`, cut at its first lexical error). So every source is compared with one stream
 * exactly.
 */
describe('c4 grammar lexer', () => {
  it('builds the lexer input v12 lexed', async () => {
    const oracle = await loadJisonLexerOracle('c4');
    const diffs: string[] = [];
    for (const item of await c4GateCorpus()) {
      const v12 = await oracle.lexedText(item.source);
      if (v12 === undefined) continue;
      const ours = grammarTokens(item.source).input.text;
      if (ours !== v12)
        diffs.push(`${item.id}\n  v12 ${JSON.stringify(v12)}\n  ours ${JSON.stringify(ours)}`);
    }
    expect(diffs.slice(0, 10)).toEqual([]);
  }, 120_000);

  it("emits the jison token stream, and v13's where D452 changes it", async () => {
    const oracle = await loadJisonLexerOracle('c4');
    const diffs: string[] = [];
    const against: Record<Exclusion | 'jison', number> = {
      jison: 0,
      unquoted: 0,
      comment: 0,
      title: 0,
    };
    for (const item of await c4GateCorpus()) {
      const v12 = await oracle.tokens(item.source);
      if (!v12) continue;
      const why = await lexingExclusion(oracle, item.source);
      against[why ?? 'jison']++;
      const expected = why
        ? v13Tokens(item.source).tokens
        : v12.map(([n, i]): JisonToken => [n, decodeEntities(i)]);
      const ours = asJison(grammarTokens(item.source)).map(
        ([n, i]): JisonToken => [n, decodeEntities(i)]
      );
      if (JSON.stringify(ours) === JSON.stringify(expected)) continue;
      let at = 0;
      while (JSON.stringify(ours[at]) === JSON.stringify(expected[at])) at++;
      const show = (x: JisonToken[]) =>
        x
          .slice(Math.max(0, at - 2), at + 3)
          .map(([n, i]) => `${n}:${JSON.stringify(i)}`)
          .join(' ');
      diffs.push(
        `${item.id} @${at} (${why ?? 'jison'})\n  want ${show(expected)}\n  ours ${show(ours)}`
      );
    }
    process.stdout.write(
      `c4 grammar lexer: ${against.jison} against jison, ${against.unquoted + against.comment + against.title} against v13 (D452)\n`
    );
    expect(diffs.slice(0, 10)).toEqual([]);
    expect(against.jison).toBeGreaterThan(2000);
    expect(against).toEqual({ jison: 2369, unquoted: 386, comment: 43, title: 23 });
  }, 300_000);
});
