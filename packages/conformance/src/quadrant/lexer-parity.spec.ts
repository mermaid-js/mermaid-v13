// cspell:words quadrantchart
import { describe, expect, it } from 'vitest';
import { JISON_NAMES, lexQuadrant } from '@mermaid-js/diagram-quadrant';
import { decodeEntities } from '../flowchart/v12.ts';
import { LEXICAL_ERROR, loadJisonLexerOracle } from '../jison/oracle.ts';
import type { JisonToken } from '../jison/oracle.ts';
import { QUIRKS, quadrantGateCorpus } from './corpus.ts';

/**
 * Lexer-parity gate (#300, parser-method §1, D212): the v13 quadrant lexer emits the same
 * terminals, with the same images, as mermaid 12.2.0's `quadrant.jison` lexer on the text v12
 * lexed (`loadJisonLexerOracle('quadrant')`).
 *
 * Corpus: the 14 e2e fixtures, the strings harvested from v12's `quadrant.jison.spec.ts` and
 * syntax page (`corpus/quadrant-v12-specs.json`), the style lists of `quadrantDb.spec.ts` put
 * into point and classDef statements (that spec has no diagram sources), the named quirk cases
 * ({@link QUIRKS}), hand-written lexer cases, line-separator and CRLF cases; and every one of
 * those again with comment lines added (v12 removed them before lexing, pitfall 3).
 *
 * Images are compared as v12's lexer matched them, entity placeholders decoded, including the
 * `\n` v12 appended (v13 lexes it too; `quadrantTokens` clips it off for consumers). The text
 * v13 rebuilt is also checked against the exact text the oracle saw.
 *
 * Exclusions (v13 tokens with no jison terminal, left out of the comparison):
 * - comments and directives v12 removed before lexing, and the `%%` comments jison's rules
 *   skip (`%%…`, and `x%%…` with the character before), are v13 trivia tokens;
 * - the openers and closers jison matches without returning a token: `"`, the quote-backtick pair
 *   opening a markdown string and the backtick-quote pair closing it,
 *   `:::`, `accDescr {` and its `}`, the `,` between coordinates and the closing `]`;
 * - sources v12 does not detect as a quadrant chart (its detector is case-sensitive, so the
 *   spec strings headed `QuadRantChart`, and the header-less `quadrant-1 do`): v12 never ran
 *   the lexer on them, so there is nothing to compare.
 * After a lexical error jison stops, so both streams are cut at the first `LEXICAL_ERROR`; v13
 * writes an error token and carries on (for recovery). Empty-image tokens (`EOF`, `STR ""` at an
 * unclosed string, an empty `title_value`) are emitted by v13 too and compared as they are.
 */
function cut(tokens: JisonToken[]): JisonToken[] {
  const i = tokens.findIndex(([n]) => n === LEXICAL_ERROR);
  return i < 0 ? tokens : [...tokens.slice(0, i), [LEXICAL_ERROR, '']];
}

/** v13's stream as jison names and images (the span of v12's text each token matched). */
function v13Tokens(source: string): JisonToken[] {
  const l = lexQuadrant(source);
  const out: JisonToken[] = [];
  for (let i = 0; i < l.tokens.length - 1; i++) {
    const name = JISON_NAMES[l.tokens.kind[i] ?? -1];
    const s = l.textStart[i] ?? -1;
    if (!name || s < 0) continue;
    out.push([name, decodeEntities(l.v12.text.slice(s, l.textEnd[i] ?? s))]);
  }
  return cut(out);
}

const show = (t: JisonToken[]) => t.map(([n, i]) => `${n}:${JSON.stringify(i)}`).join(' ');

/** Whether `run` occurs in `tokens` as consecutive tokens. */
function contains(tokens: JisonToken[], run: JisonToken[]): boolean {
  const key = (t: JisonToken[]) => t.map((x) => JSON.stringify(x)).join(',');
  return key(tokens).includes(key(run));
}

describe('quadrant lexer parity with mermaid@12 (jison)', () => {
  it('emits the same tokens over the e2e fixtures, the v12 spec strings and the cases', async () => {
    const oracle = await loadJisonLexerOracle('quadrant');
    const items = await quadrantGateCorpus();
    const diffs: string[] = [];
    let compared = 0;
    let e2e = 0;
    for (const item of items) {
      const v12 = await oracle.tokens(item.source, { keepAppendedNewline: true });
      if (!v12) continue;
      compared++;
      if (item.id.startsWith('e2e/') && !item.id.endsWith('(commented)')) e2e++;
      const input = await oracle.lexedText(item.source);
      if (input !== lexQuadrant(item.source).v12.text) {
        diffs.push(`${item.id} (lexed text)\n  v12 ${JSON.stringify(input)}`);
        continue;
      }
      const expected = cut(v12.map(([n, i]): JisonToken => [n, decodeEntities(i)]));
      const actual = v13Tokens(item.source);
      if (JSON.stringify(expected) === JSON.stringify(actual)) continue;
      let at = 0;
      while (JSON.stringify(expected[at]) === JSON.stringify(actual[at])) at++;
      const around = (t: JisonToken[]) => show(t.slice(Math.max(0, at - 2), at + 3));
      diffs.push(`${item.id} @${at}\n  v12 ${around(expected)}\n  v13 ${around(actual)}`);
    }
    process.stdout.write(`quadrant lexer parity: ${compared} of ${items.length} sources lexed\n`);
    // Every e2e fixture reaches the quadrant lexer.
    expect(e2e).toBe(14);
    expect(compared).toBeGreaterThan(270);
    expect(diffs).toEqual([]);
  }, 120_000);

  it.each(QUIRKS)('quirk: $id', async ({ source, has }) => {
    const oracle = await loadJisonLexerOracle('quadrant');
    const v12 = cut(
      ((await oracle.tokens(source, { keepAppendedNewline: true })) ?? []).map(
        ([n, i]): JisonToken => [n, decodeEntities(i)]
      )
    );
    expect(contains(v12, has), show(v12)).toBe(true);
    expect(v13Tokens(source)).toEqual(v12);
  });

  it('fires every reachable jison rule over the corpus', async () => {
    const fired = new Set<number>();
    for (const item of await quadrantGateCorpus())
      lexQuadrant(item.source, (rule) => fired.add(rule));
    const never = Array.from({ length: 53 }, (_, k) => k).filter((k) => !fired.has(k));
    expect(never).toEqual(UNREACHABLE);
  }, 60_000);
});

/**
 * jison rules (numbered from 0 in `quadrant.jison` order) no input can fire: 41 (`\=`) is a
 * duplicate of 40 (`"="`). Rule 3 (`%%[^\n]*`) fires only after a lexical error (`}%%{`: `}` is
 * an error, then neither rule 0 nor rule 1 takes `%%{`), so v12 never reached it, but v13 lexes
 * on for recovery.
 */
const UNREACHABLE = [41];
