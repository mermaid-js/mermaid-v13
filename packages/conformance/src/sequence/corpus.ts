/**
 * The sequence corpora: the e2e fixtures and harvested v12 spec strings, and the lexer gate's
 * set, which adds line-separator and edge cases and a commented copy of every source.
 */
// cspell:words SEQUENCEDIAGRAM
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { corpusFromDir, REPO_ROOT } from '../corpus.ts';
import type { CorpusItem } from '../types.ts';

// U+2028 and U+2029: `\s` and a regex `.` treat them as line terminators, `[^\n]` does not;
// v12's comment removal (`^`, multiline) starts a line after them.
export const LINE_SEPARATORS: CorpusItem[] = [
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
export const EDGE_CASES: CorpusItem[] = [
  'sequenceDiagram\r\nA->>B: x\r\n\r\nB-->>A: y\r\n',
  'sequenceDiagram\rA->>B: x\r\rB-->>A: y',
  'sequenceDiagram\r\nparticipant A as Alice\r\nloop L\r\nA->>B: x\r\nend',
  'sequenceDiagram\r\naccDescr {\r\na\r\nb\r\n}\r\nA->>B: x',
  'sequenceDiagram\r\ntitle\r\nfoo\r\ntitle:\r\nbar\r\nA->>B: x',
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

// Directives that start partway through a line (#185). v12 removed directives first, then line
// comments from what was left, then dropped `style`/`classDef` semicolons from that.
export const MID_LINE_DIRECTIVES: CorpusItem[] = [
  'sequenceDiagram\nA->>B: x %%{init: {\n  %%x "a": 1}}%%\nB->>A: y',
  'sequenceDiagram\nA->>B: x %%{init: {"a":"style"}}%% :#y;\nB->>A: z',
  'sequenceDiagram\nNote over A: x %%{init: {"a":"style"}}%% :#y; z\nA->>B: w',
  'sequenceDiagram\nA->>B: x\n%% c %%{init:\n{}}%% d\nB->>A: y',
  'sequenceDiagram\nA->>B: x\n%%%%{init: {}}%%\nB->>A: y',
  'sequenceDiagram\nA->>B: sty%%{init: {}}%%le A fill:#f00;\nB->>A: y',
].map((source, k) => ({ id: `mid-line directive ${k}`, source }));

/** The e2e fixtures, the v12 spec strings, the cases above, and each of them commented. */
export async function sequenceGateCorpus(): Promise<CorpusItem[]> {
  const all = [
    ...(await sequenceCorpus()),
    ...LINE_SEPARATORS,
    ...EDGE_CASES,
    ...MID_LINE_DIRECTIVES,
  ];
  return [
    ...all,
    ...all.map((item) => ({ id: `${item.id} (commented)`, source: commented(item.source) })),
  ];
}

/** The sequence corpus: the e2e fixtures and the v12 spec strings. */
export async function sequenceCorpus(): Promise<CorpusItem[]> {
  const items: CorpusItem[] = [];
  for await (const item of corpusFromDir(join(REPO_ROOT, 'e2e/diagrams/sequence'), 'e2e')) {
    items.push(item);
  }
  const specs = JSON.parse(
    readFileSync(join(REPO_ROOT, 'packages/conformance/corpus/sequence-v12-specs.json'), 'utf8')
  ) as CorpusItem[];
  return [...items, ...specs];
}

/**
 * `src` with nine comment lines after every line of the body, or one through the middle of a
 * one-line body. v12 removed them before lexing, so tokens must match across them.
 */
export function commented(src: string): string {
  const head = /^---[\s\S]*?\n---[^\S\n]*\n/.exec(src)?.[0] ?? '';
  const body = src.slice(head.length);
  const lines = body.split('\n');
  const cut = Math.floor(body.length / 2);
  const split = body.slice(0, cut) + '\n%% cut\n' + body.slice(cut);
  return head + (lines.length > 2 ? lines.join('\n' + '  %% c\n'.repeat(9)) : split);
}
