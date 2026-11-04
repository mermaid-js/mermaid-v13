import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { JISON_NAMES, sequenceTokens } from '@mermaid-js/diagram-sequence';
import { corpusFromDir, REPO_ROOT } from '../corpus.ts';
import type { CorpusItem } from '../types.ts';
import { decodeEntities } from '../flowchart/v12.ts';
import { LEXICAL_ERROR, loadSequenceLexerOracle } from './jison-lexer.ts';
import type { JisonToken } from './jison-lexer.ts';

/**
 * Lexer-parity gate (parser-method §1): the v13 sequence lexer emits the same terminals, with
 * the same images, as v12's jison lexer on the text v12 lexed.
 *
 * Normalisation, both sides:
 * - images are compared as v12's parser read them: entity placeholders decoded, CRLF as LF;
 * - v12 appended a `\n` before lexing; v13 lexes a sentinel line break there whose image is
 *   clipped to the source, so the oracle takes that `\n` off the token that matched it;
 * - after a lexical error jison stops, so both streams are cut at the first `LEXICAL_ERROR`
 *   (v13 writes an `Error` token there and carries on).
 *
 * Every source is also lexed with comment lines added, which v12 removed before lexing, and
 * a set of line-separator cases.
 *
 * Exclusions (v13 kinds with no jison name, left out of the v13 stream):
 * - the `accDescr {` opener and its closing `}`: jison matches them and returns no token;
 * - comments (`%%` lines, and the `#…`, `%…` and `x%%…` comments jison's rules skip) and
 *   directives, which v13 writes as trivia.
 * Empty-image tokens are not excluded: v13 writes them as zero-width tokens of their own kinds
 * (`AliasEnd` for the alias state's empty match, `Eof` for `<<EOF>>`, and empty `restOfLine`
 * and accessibility values), so they compare as they are.
 */
function v13Tokens(source: string): JisonToken[] {
  const out: JisonToken[] = [];
  for (const t of sequenceTokens(source)) {
    const name = JISON_NAMES[t.kind];
    if (!name) continue;
    if (name === LEXICAL_ERROR) {
      out.push([LEXICAL_ERROR, '']);
      break;
    }
    out.push([name, t.text]);
  }
  return out;
}

// U+2028 and U+2029: `\s` and a regex `.` treat them as line terminators, `[^\n]` does not;
// v12's comment removal (`^`, multiline) starts a line after them.
const LINE_SEPARATORS: CorpusItem[] = [
  { id: 'line separators 0', source: 'sequenceDiagram\nA->>B: x y\nB->>A: z' },
  { id: 'line separators 1', source: 'sequenceDiagram\nparticipant A as B\nA->>B: z' },
  { id: 'line separators 2', source: 'sequenceDiagram\naccTitle: hi there\nA->>B: x' },
  { id: 'line separators 3', source: 'sequenceDiagram\naccDescr: hi there\nA->>B: x' },
  { id: 'line separators 4', source: 'sequenceDiagram\nA->>B: x\n%% c B->>A: y\nC' },
  { id: 'line separators 5', source: 'sequenceDiagram\nA->>B: x\n %% c\nB->>A: y' },
  { id: 'line separators 6', source: 'sequenceDiagram\nA->>B: x %% c\nB->>A: y' },
  { id: 'line separators 7', source: 'sequenceDiagram\nA ->>B: x   %% c B' },
  { id: 'line separators 8', source: 'sequenceDiagram\nloop every minute\nA->>B: x\nend' },
  { id: 'line separators 9', source: 'sequenceDiagram\nparticipant A #c d\nA->>B: x' },
  { id: 'line separators 10', source: 'sequenceDiagram\ntitle T\nA->>B: x' },
  { id: 'line separators 11', source: 'sequenceDiagram\nNote over A: a b\nA->>B: x' },
  { id: 'line separators 12', source: 'sequenceDiagram\nautonumber 1  2\nA->>B: x' },
  { id: 'line separators 13', source: 'sequenceDiagram A->>B: x' },
  { id: 'line separators 14', source: 'sequenceDiagram\nparticipant A \nA->>B: x' },
  { id: 'line separators 15', source: 'sequenceDiagram\nA - >> B: x' },
];

// Cases the corpus misses: CRs, entities, comments the jison rules skip, the ID and alias
// states' lookaheads, case-insensitive keywords, and lexical errors.
const EDGE_CASES: CorpusItem[] = [
  'sequenceDiagram\r\nA->>B: x\r\n\r\nB-->>A: y\r\n',
  'sequenceDiagram\rA->>B: x\r\rB-->>A: y',
  'sequenceDiagram\r\nparticipant A as Alice\r\nloop L\r\nA->>B: x\r\nend',
  'sequenceDiagram\r\naccDescr {\r\na\r\nb\r\n}\r\nA->>B: x',
  'sequenceDiagram\nA->>B: #quot;hi#59; #9829; #x;\nNote over A: #amp;',
  'sequenceDiagram\n#end;->>B: x\nparticipant #a;b\nloop #lt;l\nend',
  'sequenceDiagram\nA->>B: style x:#f00;\nclassDef y:#f00; z\nA->>B: x',
  'sequenceDiagram\nA->>B: <b class="x">hi</b>\nNote over A: <span style="c">t</span>',
  'sequenceDiagram\nA%%x->>B: y\nA->>B: 50% # c\n%B\nC->>D: x # c\n',
  'sequenceDiagram\nparticipant A # c\nparticipant B #x, y\nparticipant C;D',
  'sequenceDiagram\nparticipant A\nas B\nparticipant C\n@{ "type": "x" }',
  'sequenceDiagram\nparticipant A@{ "type" : "database" } as Alias\nactor B @{ "type": "x" }',
  'sequenceDiagram\nparticipant A@{ "type" : "database" }\nA->>B: x',
  'sequenceDiagram\nparticipant A<b>\nparticipant B,C\nparticipant D:E',
  'sequenceDiagram\nparticipant\nA->>B: x',
  'sequenceDiagram\nparticipant A as\nB->>A: x',
  'SEQUENCEDIAGRAM\nPARTICIPANT A AS B\nLOOP x\nEND\nNOTE OVER A: x\nA-X B: y\nA--X B: z',
  'sequenceDiagram\nend->>B: x\nendpoint->>B: y\npar_over x\nand y\nend',
  'sequenceDiagram\nlink A: x @ y\nlinks A: {}\nlink->>B: x\nproperties\ndetails A: x',
  'sequenceDiagram\ntitle\nT\ntitle: T2\ntitle:T3\ntitle  \nA->>B: x',
  'sequenceDiagram\nautonumber 10 10\nautonumber 1.5 .25\nautonumber off\n1->>2: x\n1.234 ->> 2: y',
  'sequenceDiagram\nA-B->>C: x\nA(x)->>B: y\nA()->>B: z\nA->>()B: w\nA-)B: v\nA--)B: u',
  'sequenceDiagram\nA-|\\B: x\nA--|/B: y\nA/|-B: z\nA\\\\--B: w\nA<<->>B: v\nA<<-->>B: u',
  'sequenceDiagram\nA->>+B: x\nB-->>-A: y\nA->B\nA-->B\nA->>B:wrap: z\nA->>B: x; B->>A: y',
  'sequenceDiagram\naccTitle:\n\nT\naccDescr : D\naccDescr{x}\naccDescr\n{\n y \n}',
  'sequenceDiagram\nbox Aqua G\nparticipant A\nend\nbox\nend\nrect rgb(0,0,0)\nend',
  'sequenceDiagram\ncreate participant A\ndestroy A\nactivate A\ndeactivate A\nA->>B: x',
  'sequenceDiagram\nNote left of A: x\nNote right of A: x\nnote over A,B: x\nleft  of',
  'sequenceDiagram\nA->>B: x\n   \n\n  \nB->>A: y   \nloop   \nend  ',
  'sequenceDiagram\n<\n>\n{}\n|\n~\nA->>B: x',
  'sequenceDiagram\naccDescr {\nnever closed',
  'sequenceDiagram\nparticipant A@{ never closed',
  'sequenceDiagram\nloop',
  'sequenceDiagram\nparticipant A as',
  'sequenceDiagram\naccTitle: ',
].map((source, k) => ({ id: `edge case ${k}`, source }));

async function corpus(): Promise<CorpusItem[]> {
  const items: CorpusItem[] = [];
  for await (const item of corpusFromDir(join(REPO_ROOT, 'e2e/diagrams/sequence'), 'e2e')) {
    items.push(item);
  }
  const specs = JSON.parse(
    readFileSync(join(REPO_ROOT, 'packages/conformance/corpus/sequence-v12-specs.json'), 'utf8')
  ) as CorpusItem[];
  const all = [...items, ...specs, ...LINE_SEPARATORS, ...EDGE_CASES];
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

describe('sequence lexer parity with mermaid@12 (jison)', () => {
  it('emits the same tokens over the e2e fixtures and the v12 spec strings', async () => {
    const oracle = await loadSequenceLexerOracle();
    const items = await corpus();
    const diffs: { id: string; at: number; v12: JisonToken[]; v13: JisonToken[] }[] = [];
    let compared = 0;
    let e2e = 0;
    for (const item of items) {
      const v12 = await oracle.tokens(item.source);
      if (!v12) continue;
      compared++;
      if (item.id.startsWith('e2e') && !item.id.endsWith('(commented)')) e2e++;
      const expected = v12.map(([n, i]): JisonToken => [n, decodeEntities(i)]);
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
    // Every e2e fixture reaches the sequence lexer.
    expect(e2e).toBe(193);
    expect(compared).toBeGreaterThan(800);
    const show = (t: JisonToken[]) => t.map(([n, i]) => `${n}:${JSON.stringify(i)}`).join(' ');
    expect(
      diffs.map((d) => `${d.id} @${d.at}\n  v12 ${show(d.v12)}\n  v13 ${show(d.v13)}`)
    ).toEqual([]);
  }, 120_000);
});
