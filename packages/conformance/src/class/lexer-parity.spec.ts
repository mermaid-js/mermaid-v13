import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { JISON_NAMES, lexClass } from '@mermaid-js/diagram-class';
import { corpusFromDir, REPO_ROOT } from '../corpus.ts';
import type { CorpusItem } from '../types.ts';
import { decodeEntities } from '../flowchart/v12.ts';
import { LEXICAL_ERROR, loadJisonLexerOracle } from '../jison/oracle.ts';
import type { JisonToken } from '../jison/oracle.ts';

/**
 * Lexer-parity gate (#153, parser-method.md §1): the v13 class lexer emits the same terminals,
 * with the same images, as mermaid 12's `classDiagram.jison` lexer on the text v12 lexed.
 * Corpus: the e2e class fixtures, the strings harvested from the v12 class specs
 * (`corpus/class-v12-specs.json`, `src/cli/harvest-class.ts`), the line-separator and lexer
 * cases of `corpus/class-cases.json`, and every one of those again with comment lines added (v12 removed them before lexing).
 *
 * Images are compared as v12's parser read them, entity placeholders decoded, including the
 * `\n` v12 appended (v13 lexes it too; `tokenValue` clips it off for consumers).
 *
 * Exclusions (v13 tokens with no jison terminal, left out of the comparison):
 * - comments and directives v12 removed before lexing are v13 trivia tokens;
 * - `%%` comments the jison lexer itself skips (after text on a line) are v13 trivia tokens.
 * After a lexical error jison stops, so both streams are cut at the first `INVALID`; v13
 * emits an error token and carries on (for recovery). Nothing else is excluded: empty-image
 * tokens (`STR ""` at an unclosed string, `CALLBACK_NAME ""`, `EOF`) are emitted by v13 too.
 */
function cut(tokens: JisonToken[]): JisonToken[] {
  const i = tokens.findIndex(([n]) => n === 'INVALID');
  return i < 0 ? tokens : [...tokens.slice(0, i), ['INVALID', '']];
}

/**
 * v13's stream as jison names and images. Images are the token's span of v12's text as the v13
 * lexer rebuilt it, appended `\n` included, so both sides are compared exactly.
 */
function v13Tokens(source: string): JisonToken[] {
  const l = lexClass(source);
  const out: JisonToken[] = [];
  for (let i = 0; i < l.tokens.length - 1; i++) {
    const name = JISON_NAMES[l.tokens.kind[i] ?? -1];
    const s = l.textStart[i] ?? -1;
    if (!name || s < 0) continue;
    out.push([name, decodeEntities(l.v12.text.slice(s, l.textEnd[i] ?? s))]);
  }
  return cut(out);
}

async function corpus(): Promise<CorpusItem[]> {
  const items: CorpusItem[] = [];
  for await (const item of corpusFromDir(join(REPO_ROOT, 'e2e/diagrams/class-diagram'), 'e2e')) {
    items.push(item);
  }
  const specs = JSON.parse(
    readFileSync(join(REPO_ROOT, 'packages/conformance/corpus/class-v12-specs.json'), 'utf8')
  ) as CorpusItem[];
  const cases = JSON.parse(
    readFileSync(join(REPO_ROOT, 'packages/conformance/corpus/class-cases.json'), 'utf8')
  ) as CorpusItem[];
  const all = [...items, ...specs, ...cases];
  return [
    ...all,
    ...all.map((item) => ({ id: `${item.id} (commented)`, source: commented(item.source) })),
  ];
}

/**
 * `src` with nine comment lines after every line of the body, or one through the middle of a
 * one-line body. v12 removed them before lexing, so tokens must match across them. Comment
 * lines right after a line ending in `%%{` are included: v12 then kept the directive as text,
 * and core's preprocess does too since #208.
 */
function commented(src: string): string {
  const head = /^---[\s\S]*?\n---[^\S\n]*\n/.exec(src)?.[0] ?? '';
  const body = src.slice(head.length);
  const lines = body.split('\n');
  if (lines.length <= 2) {
    const mid = Math.floor(body.length / 2);
    return head + body.slice(0, mid) + '\n%% cut\n' + body.slice(mid);
  }
  const comments = '\n' + '  %% c\n'.repeat(9);
  return (
    head +
    lines.reduce((out, line, i) => {
      if (i === 0) return line;
      return out + comments + line;
    }, '')
  );
}

describe('class lexer parity with mermaid@12 (jison)', () => {
  it('emits the same tokens over the e2e fixtures and the v12 spec strings', async () => {
    const oracle = await loadJisonLexerOracle('class');
    const items = await corpus();
    const diffs: { id: string; at: number; v12: JisonToken[]; v13: JisonToken[] }[] = [];
    let compared = 0;
    for (const item of items) {
      const v12 = (await oracle.tokens(item.source, { keepAppendedNewline: true }))?.map(
        ([n, i]): [string, string] => [n === LEXICAL_ERROR ? 'INVALID' : n, i]
      );
      if (!v12) continue;
      compared++;
      const input = await oracle.lexedText(item.source);
      if (input !== lexClass(item.source).v12.text) {
        diffs.push({ id: `${item.id} (lexed text)`, at: 0, v12: [['TEXT', input ?? '']], v13: [] });
        continue;
      }
      const expected = cut(v12.map(([n, i]): JisonToken => [n, decodeEntities(i)]));
      const actual = v13Tokens(item.source);
      if (JSON.stringify(expected) === JSON.stringify(actual)) continue;
      let at = 0;
      while (JSON.stringify(expected[at]) === JSON.stringify(actual[at])) at++;
      diffs.push({
        id: item.id,
        at,
        v12: expected.slice(Math.max(0, at - 2), at + 3),
        v13: actual.slice(Math.max(0, at - 2), at + 3),
      });
    }
    process.stdout.write(`class lexer parity: ${compared} of ${items.length} sources lexed\n`);
    expect(compared).toBeGreaterThan(1400);
    const show = (t: JisonToken[]) => t.map(([n, i]) => `${n}:${JSON.stringify(i)}`).join(' ');
    expect(
      diffs.map((d) => `${d.id} @${d.at}\n  v12 ${show(d.v12)}\n  v13 ${show(d.v13)}`)
    ).toEqual([]);
  }, 300_000);

  it('fires every reachable jison rule over the corpus', async () => {
    const fired = new Set<number>();
    for (const item of await corpus()) lexClass(item.source, (rule) => fired.add(rule));
    const never = Array.from({ length: 99 }, (_, k) => k).filter((k) => !fired.has(k));
    expect(never).toEqual(UNREACHABLE);
  }, 120_000);
});

/**
 * jison rules no input can fire: an earlier rule of every state they are in always matches
 * first. 5: rule 4 (`%%[^\n]*\n*`) matches all it would. 86 and 89: duplicates of 85 (`#`) and
 * 88 (`=`). 94 (`[0-9]+`): `\w+` (90) comes first. 96 and 97 (`\s`): in every state an earlier
 * rule consumes blanks (the `\s+` / newline rules, or the state's value rule).
 */
const UNREACHABLE = [5, 86, 89, 94, 96, 97];
