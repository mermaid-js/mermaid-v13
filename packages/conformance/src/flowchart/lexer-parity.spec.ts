import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { flowchartTokens, FlowTokenKind, JISON_NAMES } from '@mermaid-js/diagram-flowchart';
import { corpusFromDir, REPO_ROOT } from '../corpus.ts';
import type { CorpusItem } from '../types.ts';
import { decodeEntities } from './v12.ts';
import { loadFlowLexerOracle } from './jison-lexer.ts';
import type { JisonToken } from './jison-lexer.ts';

/**
 * Lexer-parity gate (notes/07): the v13 flowchart lexer emits the same terminals, with the same
 * images, as mermaid@12's jison lexer on the text v12 lexed.
 *
 * Normalisation, both sides:
 * - runs of `TEXT`, `EDGE_TEXT`, `STR` and `MD_STR` are merged (jison splits some per
 *   character; v13 splits strings where a removed comment line was);
 * - images are compared as v12's parser read them: entity placeholders decoded (after the
 *   merge, as a placeholder can span split tokens), CRLF as LF;
 * - v12 appended a `\n` before lexing; v13 lexes a sentinel line break there whose image is
 *   clipped to the source, so that last character is taken off v12's last token.
 *
 * Every source is also lexed with comment lines added, which v12 removed before lexing.
 *
 * Deliberate differences: the `@{` opener keeps its image in v13 (jison clears it); v13 also emits the closing `}` of shape data (jison drops it), and
 * comments and directives as trivia; both are left out. After a lexical error jison stops, so
 * both streams are cut at the first `INVALID`.
 */
const MERGED = new Set(['TEXT', 'EDGE_TEXT', 'STR', 'MD_STR']);

function normalise(tokens: JisonToken[]): JisonToken[] {
  const out: JisonToken[] = [];
  for (const [name, image] of tokens) {
    const last = out[out.length - 1];
    if (last && last[0] === name && MERGED.has(name)) last[1] += image;
    else out.push([name, image]);
    if (name === 'INVALID') {
      out[out.length - 1] = ['INVALID', ''];
      break;
    }
  }
  return out;
}

function v13Tokens(source: string): JisonToken[] {
  let quoted = false;
  return normalise(
    flowchartTokens(source).flatMap((t): JisonToken[] => {
      const name = JISON_NAMES[t.kind];
      if (!name) return [];
      if (t.kind !== FlowTokenKind.ShapeData) return [[name, t.text]];
      // jison clears the image of the `@{` opener, and folds line breaks inside a quoted
      // shape-data value into `<br/>`; v13 keeps the source text (the parser folds).
      if (t.text === '@{') return [[name, '']];
      if (t.text === '"') quoted = !quoted;
      else if (quoted) {
        // At the end of the text v12's appended line break folded in too (and is taken off).
        const atEnd = t.range.end === source.length;
        const folded = (atEnd ? t.text + '\n' : t.text).replace(/\n\s*/g, '<br/>');
        return [[name, atEnd ? folded.replace(/<br\/>$/, '') : folded]];
      }
      return [[name, t.text]];
    })
  );
}

/** jison lexes the `ﬂ` of an entity placeholder outside labels, then fails on `°`. */
function cutEntityError(tokens: JisonToken[]): JisonToken[] {
  const i = tokens.findIndex(
    ([n, img], k) => n === 'UNICODE_TEXT' && img === 'ﬂ' && tokens[k + 1]?.[0] === 'INVALID'
  );
  return i < 0 ? tokens : [...tokens.slice(0, i), ['INVALID', '']];
}

/** The last non-empty image of a stream that lexed to the end held v12's appended `\n`. */
function dropAppendedNewline(tokens: JisonToken[]): void {
  if (tokens[tokens.length - 1]?.[0] === 'INVALID') return;
  for (let k = tokens.length - 1; k >= 0 && k >= tokens.length - 3; k--) {
    const t = tokens[k];
    if (!t || t[1] === '') continue;
    if (t[1].endsWith('\n')) t[1] = t[1].slice(0, -1);
    // Inside an unclosed quoted shape-data value it was folded into `<br/>`.
    else if (t[0] === 'SHAPE_DATA' && t[1].endsWith('<br/>')) t[1] = t[1].slice(0, -5);
    return;
  }
}

// U+2028 and U+2029: a regex `.` stops at them and `^` follows them, as LF does.
const LINE_SEPARATORS: CorpusItem[] = [
  { id: 'line separators 0', source: 'flowchart LR\nA\u2028direction TB\nB' },
  { id: 'line separators 1', source: 'flowchart LR\nsubgraph S\nx\u2028direction TB\nA\nend' },
  { id: 'line separators 2', source: 'flowchart LR\naccTitle: hi\u2028there\nA' },
  { id: 'line separators 3', source: 'flowchart LR\naccDescr: hi\u2029there\nA' },
  { id: 'line separators 4', source: 'flowchart LR\nA\n%% c\u2028B\nC' },
  { id: 'line separators 5', source: 'flowchart LR\nA\n\u2028%% c\nB' },
  { id: 'line separators 6', source: 'flowchart LR\nA\u2028%% c\nB' },
  { id: 'line separators 7', source: 'flowchart LR\nA\u2028  %% c\u2028B\nC' },
  { id: 'line separators 8', source: 'flowchart LR\nA\nclick A\u2028call f()\n' },
  { id: 'line separators 9', source: 'flowchart LR\nA-->B\u2028C' },
  { id: 'line separators 10', source: 'flowchart LR\nA[a\u2028b]' },
  { id: 'line separators 11', source: 'flowchart LR\nstyle A fill:#f00;\u2028B;\n' },
  { id: 'line separators 12', source: 'flowchart LR\nclassDef x fill:#f00;\u2029A;\n' },
  { id: 'line separators 13', source: 'graph\u2028TD\nA' },
  { id: 'line separators 14', source: 'graph TD\u2028\nA' },
  { id: 'line separators 15', source: 'flowchart LR\nA -- x\u2028--> B' },
];

// Directives that start partway through a line (#185). v12 removed directives first, then line
// comments from what was left, then dropped `style`/`classDef` semicolons from that.
const MID_LINE_DIRECTIVES: CorpusItem[] = [
  { id: 'mid-line directive 0', source: 'flowchart LR\nA %%{init: {\n  %%x "a": 1}}%%\nB' },
  {
    id: 'mid-line directive 1',
    source: 'flowchart LR\nA["x %%{init: {"a":"style"}}%% :#y; z"]\nB',
  },
  { id: 'mid-line directive 2', source: 'flowchart LR\nA %%{init: {"a":"style"}}%% :#y;\nB' },
  { id: 'mid-line directive 3', source: 'flowchart LR\nA\n%% c %%{init:\n{}}%% d\nB' },
  { id: 'mid-line directive 4', source: 'flowchart LR\nA\n%%%%{init: {}}%%\nB' },
  { id: 'mid-line directive 5', source: 'flowchart LR\nsty%%{init: {}}%%le A fill:#f00;\nB' },
];

// Entities in edge text (#208): jison splits EDGE_TEXT per character, so v12's placeholders
// (`ﬂ°°`, `¶ß`) only decode once the run is merged.
const EDGE_TEXT_ENTITIES: CorpusItem[] = [
  { id: 'edge text entity 0', source: 'flowchart LR\nA -- x:#y; --> B' },
  { id: 'edge text entity 1', source: 'flowchart LR\nA -- #quot;q#quot; and #9829; --> B' },
  { id: 'edge text entity 2', source: 'flowchart LR\nA == #35; ==> B' },
  { id: 'edge text entity 3', source: 'flowchart LR\nA -. #amp; .-> B' },
];

async function corpus(): Promise<CorpusItem[]> {
  const items: CorpusItem[] = [];
  for await (const item of corpusFromDir(join(REPO_ROOT, 'e2e/diagrams/flowchart'), 'e2e')) {
    items.push(item);
  }
  const specs = JSON.parse(
    readFileSync(join(REPO_ROOT, 'packages/conformance/corpus/flowchart-v12-specs.json'), 'utf8')
  ) as CorpusItem[];
  const all = [
    ...items,
    ...specs,
    ...LINE_SEPARATORS,
    ...MID_LINE_DIRECTIVES,
    ...EDGE_TEXT_ENTITIES,
  ];
  return [
    ...all,
    ...all.map((item) => ({ id: `${item.id} (commented)`, source: commented(item.source) })),
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
  const cut = Math.floor(body.length / 2);
  const split = body.slice(0, cut) + '\n%% cut\n' + body.slice(cut);
  return head + (lines.length > 2 ? lines.join('\n' + '  %% c\n'.repeat(9)) : split);
}

describe('flowchart lexer parity with mermaid@12 (jison)', () => {
  it('emits the same tokens over the e2e fixtures and the v12 spec strings', async () => {
    const oracle = await loadFlowLexerOracle();
    const items = await corpus();
    const diffs: { id: string; at: number; v12: JisonToken[]; v13: JisonToken[] }[] = [];
    let compared = 0;
    for (const item of items) {
      const v12 = await oracle.tokens(item.source);
      if (!v12) continue;
      compared++;
      // Merged first: a placeholder split over per-character tokens decodes only when whole.
      const expected = normalise(cutEntityError(v12)).map(
        ([n, i]): JisonToken => [n, decodeEntities(i)]
      );
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
    process.stdout.write(`lexer parity: ${compared} of ${items.length} sources lexed by v12\n`);
    expect(compared).toBeGreaterThan(700);
    const show = (t: JisonToken[]) => t.map(([n, i]) => `${n}:${JSON.stringify(i)}`).join(' ');
    expect(
      diffs.map((d) => `${d.id} @${d.at}\n  v12 ${show(d.v12)}\n  v13 ${show(d.v13)}`)
    ).toEqual([]);
  }, 120_000);
});
