import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { classTokens, JISON_NAMES } from '@mermaid-js/diagram-class';
import { corpusFromDir, REPO_ROOT } from '../corpus.ts';
import type { CorpusItem } from '../types.ts';
import { decodeEntities } from '../flowchart/v12.ts';
import { loadClassLexerOracle } from './jison-lexer.ts';
import type { JisonToken } from './jison-lexer.ts';

/**
 * Lexer-parity gate (#153, parser-method.md §1): the v13 class lexer emits the same terminals,
 * with the same images, as mermaid 12's `classDiagram.jison` lexer on the text v12 lexed.
 * Corpus: the e2e class fixtures, the strings harvested from the v12 class specs
 * (`corpus/class-v12-specs.json`, `src/cli/harvest-class.ts`), generated line-separator cases,
 * and every one of those again with comment lines added (v12 removed them before lexing).
 *
 * Normalisation, both sides:
 * - images are compared as v12's parser read them, entity placeholders decoded;
 * - v12 appended a `\n` before lexing; v13 lexes that sentinel line break too but clips its
 *   image to the source, so that last character is taken off v12's last non-empty token.
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

/** The last non-empty image of a stream that lexed to the end held v12's appended `\n`. */
function dropAppendedNewline(tokens: JisonToken[]): void {
  if (tokens[tokens.length - 1]?.[0] === 'INVALID') return;
  for (let k = tokens.length - 1; k >= 0; k--) {
    const t = tokens[k];
    if (!t || t[1] === '') continue;
    if (t[1].endsWith('\n')) t[1] = t[1].slice(0, -1);
    return;
  }
}

function v13Tokens(source: string): JisonToken[] {
  return cut(
    classTokens(source).flatMap((t): JisonToken[] => {
      const name = JISON_NAMES[t.kind];
      return name ? [[name, t.text]] : [];
    })
  );
}

// U+2028 and U+2029: a regex `.` stops at them and `^` follows them, as LF does.
const LINE_SEPARATORS: CorpusItem[] = [
  'classDiagram\nA direction TB\nB',
  'classDiagram\nclass A {\n+x y\n}',
  'classDiagram\naccTitle: hi there\nA',
  'classDiagram\naccDescr: hi there\nA',
  'classDiagram\nA\n%% c B\nC',
  'classDiagram\nA\n %% c\nB',
  'classDiagram\nA %% c\nB',
  'classDiagram\nA : x y',
  'classDiagram\nnamespace N {\nclass A\n}',
  'classDiagram\nnote "a b"',
  'classDiagram\nA <|-- B',
  'classDiagram direction LR\nA',
  'classDiagram\r\nclass A {\r\n  +int x\r\n}\r\nA --> B\r',
  'classDiagram\nclass A["<b class="x">y</b>"]\nstyle A fill:#f00;\nA : #35; x',
].map((source, i) => ({ id: `line separators ${i}`, source }));

async function corpus(): Promise<CorpusItem[]> {
  const items: CorpusItem[] = [];
  for await (const item of corpusFromDir(join(REPO_ROOT, 'e2e/diagrams/class-diagram'), 'e2e')) {
    items.push(item);
  }
  const specs = JSON.parse(
    readFileSync(join(REPO_ROOT, 'packages/conformance/corpus/class-v12-specs.json'), 'utf8')
  ) as CorpusItem[];
  const all = [...items, ...specs, ...LINE_SEPARATORS];
  return [
    ...all,
    ...all.map((item) => ({ id: `${item.id} (commented)`, source: commented(item.source) })),
  ];
}

/**
 * `src` with nine comment lines after every line of the body, or one through the middle of a
 * one-line body. v12 removed them before lexing, so tokens must match across them.
 *
 * Exclusion: no comment lines go inside a multi-line `%%{ … }%%` directive. v12's directive
 * regex needs a word right after `%%{`, so a comment line there made v12 keep the directive as
 * text, while core's preprocess still reads it as a directive. That is a preprocess
 * difference (core, D67), not a lexer one.
 */
function commented(src: string): string {
  const head = /^---[\s\S]*?\n---[^\S\n]*\n/.exec(src)?.[0] ?? '';
  const body = src.slice(head.length);
  const lines = body.split('\n');
  if (lines.length <= 2) {
    const mid = Math.floor(body.length / 2);
    return head + body.slice(0, mid) + '\n%% cut\n' + body.slice(mid);
  }
  let inDirective = false;
  const out: string[] = [];
  for (const line of lines) {
    if (out.length > 0 && !inDirective) out.push('  %% c\n'.repeat(9).slice(0, -1));
    out.push(line);
    const open = line.lastIndexOf('%%{');
    if (open >= 0 && !line.includes('}%%', open)) inDirective = true;
    else if (line.includes('}%%')) inDirective = false;
  }
  return head + out.join('\n');
}

describe('class lexer parity with mermaid@12 (jison)', () => {
  it('emits the same tokens over the e2e fixtures and the v12 spec strings', async () => {
    const oracle = await loadClassLexerOracle();
    const items = await corpus();
    const diffs: { id: string; at: number; v12: JisonToken[]; v13: JisonToken[] }[] = [];
    let compared = 0;
    for (const item of items) {
      const v12 = await oracle.tokens(item.source);
      if (!v12) continue;
      compared++;
      const expected = cut(v12.map(([n, i]): JisonToken => [n, decodeEntities(i)]));
      dropAppendedNewline(expected);
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
    expect(compared).toBeGreaterThan(1300);
    const show = (t: JisonToken[]) => t.map(([n, i]) => `${n}:${JSON.stringify(i)}`).join(' ');
    expect(
      diffs.map((d) => `${d.id} @${d.at}\n  v12 ${show(d.v12)}\n  v13 ${show(d.v13)}`)
    ).toEqual([]);
  }, 300_000);
});
