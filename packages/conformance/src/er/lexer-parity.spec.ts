import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { erTokens, jisonName } from '@mermaid-js/diagram-er';
import { corpusFromDir, REPO_ROOT } from '../corpus.ts';
import type { CorpusItem } from '../types.ts';
import { LEXICAL_ERROR, loadJisonLexerOracle } from '../jison/oracle.ts';
import type { JisonToken } from '../jison/oracle.ts';

/**
 * Lexer-parity gate (port-diagram/parser-method.md §1): the v13 ER lexer emits the same
 * terminals, with the same images, as v12's `erDiagram.jison` lexer on the text v12
 * lexed. Tokens are compared one for one; no runs are merged.
 *
 * Normalisation, both sides:
 * - images are compared with v12's entity placeholders decoded (`ﬂ°amp¶ß` is `&amp;`), as
 *   v12's renderer read them;
 * - after a lexical error jison stops, so both streams are cut at the first `INVALID`.
 *
 * Exclusions (left out of the v13 stream, which keeps them as tokens):
 * - comments and directives: v12 removed them before lexing; v13 emits them as trivia;
 * - the stream's final `Kind.EOF`: jison's `$end` (dropped by the oracle). jison's own `EOF`
 *   terminal is not excluded: v13 emits it, zero-width, wherever jison did.
 *
 * Not exclusions, but worth knowing: v12 appended a `\n` to the text before lexing. v13 lexes
 * that line break too (its range is clipped to the end of the source), so the last `NEWLINE`
 * image holds it on both sides. The empty-image tokens jison emits at the end of the text
 * (`EOF`, and a value token when the text ends in an `accTitle:`/`accDescr` state) are emitted
 * by v13 as zero-width tokens at the end of the source.
 *
 * Every source is also lexed with comment lines added, which v12 removed before lexing, and
 * with CRLF line breaks, which v12 turned into LF.
 */
const decode = (s: string) => s.replace(/ﬂ°°/g, '&#').replace(/ﬂ°/g, '&').replace(/¶ß/g, ';');

function cut(tokens: JisonToken[]): JisonToken[] {
  const i = tokens.findIndex(([n]) => n === 'INVALID');
  return i < 0 ? tokens : [...tokens.slice(0, i), ['INVALID', '']];
}

function v13Tokens(source: string): JisonToken[] {
  return cut(erTokens(source).map((t): JisonToken => [jisonName(t.kind, t.text), t.text]));
}

// U+2028 and U+2029: a regex `.` stops at them and `^` follows them; `[^\n]` does not stop.
const LINE_SEPARATORS: CorpusItem[] = [
  'erDiagram\nA\u2028direction TB\nB',
  'erDiagram\nA ||--o{ B : has\u2028direction LR',
  'erDiagram\naccTitle: hi\u2028there\nA',
  'erDiagram\naccDescr: hi\u2029there\nA',
  'erDiagram\nA\n%% c\u2028B\nC',
  'erDiagram\nA\n\u2028%% c\nB',
  'erDiagram\nA\u2028%% c\nB',
  'erDiagram\nA\u2028  %% c\u2028B\nC',
  'erDiagram\nA {\nstring a~b\u2028c~ x\n}',
  'erDiagram\nA {\nstring a\u2028b\n}',
  'erDiagram\nstyle A fill:#f00;\u2028B;\n',
  'erDiagram\nclassDef x fill:#f00;\u2029A;\n',
  'erDiagram\u2028A',
  'erDiagram\nA ||--|| B : "x\u2028y"',
].map((source, k) => ({ id: `line separators ${k}`, source }));

// What v12's preprocessing and `encodeEntities` did to the text before its lexer saw it.
const PREPROCESSING: CorpusItem[] = [
  'erDiagram\nA ||--o{ B : "a #amp; b"',
  'erDiagram\n"A#35;B" ||--o{ B : x',
  'erDiagram\nA#amp;B\nA {\nstring x#amp;y\n}',
  'erDiagram\nstyle A fill:#f00;',
  'erDiagram\nstyle A fill:#f00;stroke:#00f;\nB',
  'erDiagram\nclassDef c fill:#f00;;\nB',
  'erDiagram\nclassDef c fill:#f00,color:#fff;\nclass A c',
  'erDiagram\nclassDef c fill:#f00; style x:#0;y;\nB',
  'erDiagram\nA ||--o{ B : "<b class="x">y</b>"',
  'erDiagram\n%%{init: {"theme": "dark"}}%%\nA',
  'erDiagram\nA %%{init: {}}%% ||--o{ B : x',
  '%%{init: {}}%%\n\n  %% c\n\n erDiagram\nA',
  '---\ntitle: T\n---\nerDiagram\nA',
  'erDiagram\n%%\nA\n%%%\nB',
  'erDiagram\nA\n  \n\t%% c\nB',
  'erDiagram\r\nA\rB\r\n',
  'erDiagram\naccTitle:',
  'erDiagram\naccDescr {\nunclosed',
  'erDiagram\nA {\nstring x',
  'erDiagram\nA {\n`unclosed',
  'erDiagram\nstyle A fill:rgb(1,2,3)\nB',
  'erDiagram\nA ||--o{ B : "direction TB"',
  'erDiagram\nA { string x "direction LR" }\nB direction RL x',
  // Directives that start mid-line (#186): a `%%` line inside one, and `"style"` before a `;`.
  'erDiagram\nA %%{init: {\n  %%x "a": 1}}%%\nB',
  'erDiagram\nA %%{init: {\n%% c\n"theme": "dark"}}%% ||--o{ B : x',
  'erDiagram\nA %%{init: {"style": "x;y"}}%%\nB',
  'erDiagram\nA %%{init: {"x": "style A fill:#f00;"}}%% ||--o{ B : x;\nC',
].map((source, k) => ({ id: `preprocessing ${k}`, source }));

/**
 * Every UTF-16 code unit in each character-class position: in the initial state, at the start
 * and in the middle of a block word, and (ASCII, one source each, as jison stops at the first
 * error) after `style`. `{`, `}`, `"` and the backtick are left out: they open or close states
 * and would swallow the rest; the corpus covers them.
 */
function everyCodeUnit(): CorpusItem[] {
  const units: string[] = [];
  for (let c = 0; c < 0x10000; c++) {
    const ch = String.fromCharCode(c);
    if (!'{}"`'.includes(ch)) units.push(ch);
  }
  const style = units
    .filter((ch) => ch.charCodeAt(0) < 128)
    .map((ch, k) => ({
      id: `code units: style ${k}`,
      source: `erDiagram\nstyle A ${ch}x:#f00\nB`,
    }));
  return [
    { id: 'code units: initial', source: 'erDiagram\n' + units.map((ch) => `a${ch}b`).join('\n') },
    { id: 'code units: block start', source: 'erDiagram\nA {\n' + units.join('x\n') + '\n}' },
    {
      id: 'code units: block word',
      source: 'erDiagram\nA {\n' + units.map((ch) => `x${ch}y`).join('\n') + '\n}',
    },
    ...style,
  ];
}

async function corpus(): Promise<CorpusItem[]> {
  const items: CorpusItem[] = [];
  for await (const item of corpusFromDir(join(REPO_ROOT, 'e2e/diagrams/er-diagram'), 'e2e')) {
    items.push(item);
  }
  const specs = JSON.parse(
    readFileSync(join(REPO_ROOT, 'packages/conformance/corpus/er-v12-specs.json'), 'utf8')
  ) as CorpusItem[];
  const all = [...items, ...specs, ...LINE_SEPARATORS, ...PREPROCESSING];
  return [
    ...all,
    ...all.map((item) => ({ id: `${item.id} (commented)`, source: commented(item.source) })),
    ...all.map((item) => ({ id: `${item.id} (CRLF)`, source: item.source.replace(/\n/g, '\r\n') })),
    ...everyCodeUnit(),
  ];
}

/**
 * `src` with nine comment lines after every line of the body, or one through the middle of a
 * one-line body. v12 removed them before lexing, so tokens must match across them.
 */
function commented(src: string): string {
  const head = /^---[\s\S]*?\n---[^\S\n]*\n/.exec(src)?.[0] ?? '';
  const body = src.slice(head.length);
  const lines = body.split('\n');
  const mid = Math.floor(body.length / 2);
  const split = body.slice(0, mid) + '\n%% cut\n' + body.slice(mid);
  return head + (lines.length > 2 ? lines.join('\n' + '  %% c\n'.repeat(9)) : split);
}

describe('ER lexer parity with mermaid@12 (jison)', () => {
  it('emits the same tokens over the e2e fixtures and the v12 spec strings', async () => {
    const oracle = await loadJisonLexerOracle('er');
    const items = await corpus();
    const diffs: { id: string; at: number; v12: JisonToken[]; v13: JisonToken[] }[] = [];
    const skipped: string[] = [];
    let compared = 0;
    for (const item of items) {
      const v12 = (await oracle.tokens(item.source, { keepAppendedNewline: true }))?.map(
        ([n, i]): [string, string] => [n === LEXICAL_ERROR ? 'INVALID' : n, i]
      );
      if (!v12) {
        skipped.push(item.id);
        continue;
      }
      compared++;
      const expected = cut(v12.map(([n, i]): JisonToken => [n, decode(i)]));
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
    process.stdout.write(
      `ER lexer parity: ${compared} of ${items.length} sources lexed by v12; not: ${skipped.join(', ')}\n`
    );
    // 206 fixtures + 581 spec strings + the cases above, three variants each, + code units.
    expect(compared).toBeGreaterThan(2400);
    const show = (t: JisonToken[]) => t.map(([n, i]) => `${n}:${JSON.stringify(i)}`).join(' ');
    expect(
      diffs.map((d) => `${d.id} @${d.at}\n  v12 ${show(d.v12)}\n  v13 ${show(d.v13)}`)
    ).toEqual([]);
  }, 240_000);
});
