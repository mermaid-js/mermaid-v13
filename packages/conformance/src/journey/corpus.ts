/**
 * The journey corpora: the e2e fixtures and harvested v12 spec strings, and the lexer gate's
 * set, which adds line-separator, edge, parser (#302) and code-unit cases and a commented and a
 * CRLF copy of every source. The parity, grammar and layout specs of #302 run on it too.
 */
// cspell:words JOURNEY accdescr
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { corpusFromDir, REPO_ROOT } from '../corpus.ts';
import type { CorpusItem } from '../types.ts';

// U+2028 and U+2029: `\s` takes them, `[^\n]` and `[^#:\n;]` do not stop at them; v12's comment
// removal (`^`, multiline) starts a line after them.
const LINE_SEPARATORS: CorpusItem[] = [
  'journey\ntitle a\u2028b\nsection S',
  'journey\nsection a\u2029b\nT: 1',
  'journey\nTask\u2028one: 5: Me',
  'journey\nT: 5: A,\u2028B',
  'journey\naccTitle: hi\u2028there\nT: 1',
  'journey\naccDescr: hi\u2029there\nT: 1',
  'journey\nT: 1\u2028%% c\nU: 2',
  'journey\nT: 1\n\u2028%% c\nU: 2',
  'journey\ntitle\u2028x\nsection\u2029y',
  'journey\u2028title x',
  'journey\nT: 1 \u2028\nU: 2',
  'journey\naccDescr {\na\u2028b\n}',
].map((source, k) => ({ id: `line separators ${k}`, source }));

/**
 * The spec's T1 quirks (#290) and the cases the corpus misses: CRs, entities, comments the
 * jison rules skip, keyword boundaries and case, accessibility states at the end, `;`.
 */
const EDGE_CASES: CorpusItem[] = [
  // `\s` after `title`/`section` matches a line break.
  'journey\ntitle\nfoo\nsection\nbar\nT: 1',
  'journey\ntitle\n\nfoo\nsection\n\nbar',
  'journey\ntitle \nT: 1\nsection \nU: 2',
  'journey\ntitle\nT: 1',
  'journey\ntitle\nsection A',
  // `accTitle:`/`accDescr:` at a line end take the next line.
  'journey\naccTitle:\nsection A\nT: 1',
  'journey\naccDescr:\n\n  T: 1',
  'journey\naccTitle :  \t\nx\naccDescr\t: y',
  // `\s+` takes a line break after blanks.
  'journey\nA: 1  \n  B: 2\nC: 3\t\n\nD: 4',
  'journey  \ntitle x',
  // `%%` is a comment only where a token starts.
  'journey\nT: 5 %% note\nTask:%% x\nU: 1',
  'journey\nMake%% tea: 5\nM%%x: 1\nN %% y: 2',
  'journey\nT: 1;%% c\nU: 2; %% d\nV: 3',
  'journey\nT: 1\n%%\nU: 2\n%%%\nV: 3',
  'journey\nsection A%%x\ntitle t%%y\nW: 1',
  'journey\n%x: 1\n%{y: 2\nT: 1;%z\nU: 50% done: 3\n%\nV: 4',
  'journey\naccDescr {\n%% kept\n}\n}%%x\nT: 1',
  // Keyword lines and their traps.
  'journey planning: 5',
  'journey\ntitle a: b\nsection A: b\nMake tea # c: 5\nT: 1',
  'journey\nTitle X: 5\nSECTION s\nAccTitle : y\naccdescr: z\nJOURNEY: 3',
  'journey\njourney_x: 1\njourney-x: 2\njourneys: 3\njourney: 4\njourney1: 5',
  'journey\ntitles x: 1\nsections y: 2\naccTitleX: 3\naccDescr x: 4\ntitle\tx\nsection\ty',
  'journey\nsection A #c\ntitle t # c\nT: 1 # c\nU # c\n# whole',
  // `taskData` needs a character after the `:`.
  'journey\nT:\nU: 1\nV::\nW: 1:\nX: :',
  'journey\nT: 5: A, B: C: D\n: 5\n:\n::x',
  // `;` is INVALID; entities hide their `#` and `;`.
  'journey\nT: 5;U: 2\n;\nV;W: 1',
  'journey\nT: #59; x\nMake #amp; tea: 5: #lt;b#gt;\nsection #quot;S#quot;\ntitle #35;1',
  'journey\nstyle x:#f00;\nclassDef y:#f00; z\nT: style a:#b;c',
  'journey\nT: <b class="x">y</b>: 1\nsection <span style="c">s</span>',
  // Multi-line descriptions.
  'journey\naccDescr {\n  a\n  b\n}\nT: 1',
  'journey\naccDescr{x}title t\naccDescr\n{\n y \n}',
  'journey\naccDescr {}\nT: 1\naccDescr { }',
  // Accessibility states at the end of the text, and other ends.
  'journey\naccTitle:',
  'journey\naccTitle: ',
  'journey\naccDescr:',
  'journey\naccDescr: x',
  'journey\naccDescr {\nunclosed',
  'journey\naccDescr {',
  'journey\ntitle',
  'journey\nsection',
  'journey\nT:',
  'journey',
  'journey\n',
  // CRs: v12 turned CRLF and CR into LF.
  'journey\r\ntitle\r\nfoo\r\nsection\r\nbar\r\nT: 5\r\n',
  'journey\rtitle x\rT: 1\r\rU: 2',
  'journey\r\naccTitle:\r\nx\r\naccDescr {\r\na\r\nb\r\n}\r\nT: 1',
  'journey\r\nT: 1\r\n%%\r\nU: 2 \r\n V: 3',
  'journey\r\nT: 1;\r\n%%x\r\nU: 2',
  // Directives, front matter and comment lines that v12 removed first.
  '---\ntitle: T\n---\njourney\nT: 1',
  '%%{init: {"theme": "dark"}}%%\njourney\nT: 1',
  'journey\nT: 1 %%{init: {}}%% x\nU: 2',
  'journey\nMake %%{init: {}}%%tea: 5\nT%%{init: {}}%%: 1',
  'journey\n  %% c\ntitle x\n%% c\n\n%% c\nT: 1',
  '%% c\n  journey\n%% d\n  section S',
  // Long blank runs (pitfall 5).
  `journey\nT: 1${' '.repeat(5000)}\n${' \t'.repeat(3000)}U: 2`,
  `journey\naccTitle:${' \n'.repeat(3000)}x\naccDescr {${' '.repeat(5000)}}`,
  `journey\ntitle${'\n'.repeat(3000)}x`,
].map((source, k) => ({ id: `edge case ${k}`, source }));

/**
 * Parser cases (#302): the model conversions of v12's grammar actions and DB (scores, people,
 * sections, titles, accessibility values), statements without separators, and errors, one or
 * more per source. Also in the lexer gate.
 */
const PARSER_CASES: CorpusItem[] = [
  // Scores: `Number()` of the first piece.
  'journey\nA: 0\nB:  \nC: 0x10\nD: 2rem\nE: -2\nF: 2.5\nG: 1e1\nH: Infinity\nI: 0b11\nJ: 5 5',
  'journey\nA: 7: X\nB: +3: Y\nC: .5\nD: 00012\nE: 5 %% c',
  // People: the second piece split on `,` and trimmed; `''` kept; later pieces dropped.
  'journey\nA: 5:\nB: 5: ,\nC: 5: x,,y\nD: 5:  b , a ,b\nE: 5: a: b: c\nF: 5::x',
  'journey\nA: 1: Zed, zed, Äb, 10, 9, _x\nB: 2: zed',
  'journey\nA: 1: x #amp; y, z\nsection #quot;S#quot;\n#lt;b#gt;: 2: y',
  // Sections: every line kept, empty and repeated ones too; tasks before the first.
  'journey\nT0: 1\nsection A\nsection A\nT1: 2\nsection B\nsection A\nT2: 3\nsection C',
  'journey\nsection  A \nT: 1\nsection A\nU: 2',
  'journey\nsection A@2\nsection A\nT: 1\nsection A%>#x\nU: 2',
  // Titles and accessibility values: the last wins; values trimmed.
  'journey\ntitle  a  \ntitle b: c\naccTitle:  x  \naccTitle: y\naccDescr: p  \naccDescr:  q',
  'journey\naccDescr {\n   line one\n     line two\n\n  three  }\nT: 1',
  'journey\naccDescr { one }accDescr: two\naccTitle: t',
  'journey\naccDescr: one\naccDescr {\ntwo\n}',
  // Statements need no separator.
  'journey title t\nT: 1',
  'journey\naccDescr { d }title t\naccDescr {x}section S\naccDescr {y}T: 1: A',
  // Front matter and directives.
  '---\ntitle: Front\n---\njourney\nT: 1',
  '---\ntitle: Front\n---\njourney\ntitle In text\nT: 1',
  '---\nconfig:\n  journey:\n    leftMargin: 10\n---\njourney\nT: 1',
  // Errors (rejected by both), one or several per source.
  'journey\nMake tea',
  'journey\nMake tea:\nGo: 5',
  'journey\nsection A: b\nT: 1',
  'journey\n: 5\nT: 1',
  'journey\nT: 5; U: 4',
  'journey\njourney\nT: 1',
  'journey\nA\nB: 1\nC\n;\nD: 2',
  'journey\ntitle\n',
  'journey\nT: 1\naccTitle:  ',
  'journey\nT: 1\naccDescr:\n\n',
  'journey\nT: 1\naccDescr {\n  never closed',
  'journey\naccDescr {\n%% c\n',
  'journey\nMake tea # c: 5',
  'journey\nTask:%% x\nU: 1',
].map((source, k) => ({ id: `parser case ${k}`, source }));

/**
 * Actors whose names hold `#…;` entities: v12 sorted them by its entity placeholders
 * (`ﬂ°lt¶ß`), v13 by the names as written (a listed divergence, `divergences.json`).
 */
const ENTITY_ACTORS: CorpusItem = {
  id: 'parser case entity actors',
  source: 'journey\nA: 1: #lt;b#gt;, b, #35;1',
};

/**
 * Every UTF-16 code unit at the start and in the middle of a task name, in a task's data, and
 * in a section name. `{`, `}` are left out of the middle of an accessibility description;
 * jison never stops on journey text, so one source per position holds them all.
 */
function everyCodeUnit(): CorpusItem[] {
  const units: string[] = [];
  for (let c = 0; c < 0x10000; c++) units.push(String.fromCharCode(c));
  return [
    {
      id: 'code units: line start',
      source: 'journey\n' + units.map((ch) => `${ch}a: 1`).join('\n'),
    },
    { id: 'code units: name', source: 'journey\n' + units.map((ch) => `a${ch}b: 1`).join('\n') },
    { id: 'code units: data', source: 'journey\n' + units.map((ch) => `a: 1${ch}b`).join('\n') },
    {
      id: 'code units: section',
      source: 'journey\n' + units.map((ch) => `section a${ch}b`).join('\n'),
    },
    {
      id: 'code units: after keyword',
      source:
        'journey\n' + units.map((ch) => `title${ch}x\nsection${ch}y\njourney${ch}z`).join('\n'),
    },
  ];
}

/**
 * `src` with nine comment lines after every line of the body, or, for a body of one or two
 * lines, one through the middle of what follows the header line (so detection still sees
 * `journey`). v12 removed them before lexing, so tokens must match across them.
 */
function commented(src: string): string {
  const head = /^---[\s\S]*?\n---[^\S\n]*\n/.exec(src)?.[0] ?? '';
  const body = src.slice(head.length);
  const lines = body.split('\n');
  if (lines.length > 2) return head + lines.join('\n' + '  %% c\n'.repeat(9));
  const first = (lines[0] ?? '').length + 1;
  const cut = Math.min(body.length, first + Math.floor((body.length - first) / 2));
  return head + body.slice(0, cut) + '\n%% cut\n' + body.slice(cut);
}

/** The journey corpus: the e2e fixtures and the v12 spec strings. */
export async function journeyCorpus(): Promise<CorpusItem[]> {
  const items: CorpusItem[] = [];
  for await (const item of corpusFromDir(join(REPO_ROOT, 'e2e/diagrams/journey'), 'e2e')) {
    items.push(item);
  }
  const specs = JSON.parse(
    readFileSync(join(REPO_ROOT, 'packages/conformance/corpus/journey-v12-specs.json'), 'utf8')
  ) as CorpusItem[];
  return [...items, ...specs];
}

/** The lexer gate's set: the corpus and the cases above, each also commented and with CRLF. */
export async function journeyGateCorpus(): Promise<CorpusItem[]> {
  const all = [
    ...(await journeyCorpus()),
    ...LINE_SEPARATORS,
    ...EDGE_CASES,
    ...PARSER_CASES,
    ENTITY_ACTORS,
  ];
  return [
    ...all,
    ...all.map((item) => ({ id: `${item.id} (commented)`, source: commented(item.source) })),
    ...all.map((item) => ({ id: `${item.id} (CRLF)`, source: item.source.replace(/\n/g, '\r\n') })),
    ...everyCodeUnit(),
  ];
}

/**
 * The gate's set without the every-code-unit sources, for the grammar file's dev-only lexer and
 * reference parser (the hand-written lexer is gated on those, `lexer-parity.spec.ts`).
 */
export async function journeyGrammarCorpus(): Promise<CorpusItem[]> {
  return (await journeyGateCorpus()).filter((item) => !item.id.startsWith('code units'));
}
