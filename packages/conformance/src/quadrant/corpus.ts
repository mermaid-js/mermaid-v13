// cspell:words quadrantchart
/**
 * The quadrant gate corpus (#300, #301): the 14 e2e fixtures, the strings harvested from v12's
 * `quadrant.jison.spec.ts` and syntax page (`corpus/quadrant-v12-specs.json`), those headed
 * `QuadRantChart` again with a header v12 detects, the parser cases of
 * `corpus/quadrant-cases.json`, the style lists of `quadrantDb.spec.ts` put into point and
 * classDef statements (that spec has no diagram sources), the named lexer quirks
 * ({@link QUIRKS}), hand-written lexer cases, line-separator and CRLF cases; and every one of
 * those again with comment lines added (v12 removed them before lexing, pitfall 3). The lexer
 * gate, the grammar lexer gate and the grammar differential run over it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { corpusFromDir, REPO_ROOT } from '../corpus.ts';
import type { CorpusItem } from '../types.ts';
import { LEXICAL_ERROR } from '../jison/oracle.ts';
import type { JisonToken } from '../jison/oracle.ts';

const H = 'quadrantChart\n';

/**
 * One named case per lexer quirk of v12 the port reproduces: the seven of spec #289 §Parser and
 * the six the exploration found (GAPS.md, #300). `has` is a run of v12 tokens the stream must
 * contain (checked on the oracle's stream, so the case pins v12's behaviour, and on v13's).
 */
interface Quirk {
  id: string;
  source: string;
  has: JisonToken[];
}
const E: JisonToken = [LEXICAL_ERROR, ''];
export const QUIRKS: Quirk[] = [
  // Spec §Parser.
  {
    id: 'comment rule eats the character before %%',
    source: H + 'quadrant-1 A%% c',
    has: [
      ['QUADRANT_1', 'quadrant-1 '],
      ['NEWLINE', '\n'],
    ],
  },
  {
    id: 'padded keywords match mid-line',
    source: H + 'a x-axis b: [0.5, 0.5]',
    has: [
      ['ALPHA', 'a'],
      ['X-AXIS', ' x-axis '],
      ['ALPHA', 'b'],
    ],
  },
  {
    id: 'title takes the rest of the line, ; and --> included',
    source: H + 'title a; b --> c',
    has: [
      ['title', 'title'],
      ['title_value', ' a; b --> c'],
    ],
  },
  ...['(', ')', '<', '>', '[', ']', '{', '}', '@', '^', '~', '|'].map(
    (c): Quirk => ({
      id: `unquoted ${c} is a lexical error`,
      source: `${H}quadrant-1 a${c}b`,
      has: [['ALPHA', 'a'], E],
    })
  ),
  {
    id: 'coordinate 0x5 lexes (the . is unescaped)',
    source: H + 'P: [0x5, 0.5]',
    has: [
      ['point_x', '0x5'],
      ['point_y', '0.5'],
    ],
  },
  ...['1.0', '.5', '1.5', '-0.5', '2'].map(
    (x): Quirk => ({
      id: `coordinate ${x} is a lexical error`,
      source: `${H}P: [${x}, 0.5]`,
      has: x.startsWith('1') ? [['point_x', '1'], E] : [['point_start', ': ['], E],
    })
  ),
  {
    id: '::: must be followed directly by a word',
    source: H + 'P::: c: [0.1, 0.2]',
    has: [['ALPHA', 'P'], E],
  },
  {
    id: '::: then a word is a class name',
    source: H + 'P:::c: [0.1, 0.2]',
    has: [
      ['class_name', 'c'],
      ['point_start', ': ['],
    ],
  },
  {
    id: 'classDef takes one SPACE token per blank',
    source: H + 'classDef  c color: #ff0000',
    has: [
      ['CLASSDEF', 'classDef'],
      ['SPACE', ' '],
      ['SPACE', ' '],
      ['ALPHA', 'c'],
    ],
  },
  // GAPS.md #300.
  {
    id: 'a trailing %% stays in title text',
    source: H + 'title T %% c',
    has: [['title_value', ' T %% c']],
  },
  {
    id: 'a trailing %% stays in accTitle text',
    source: H + 'accTitle: T %% c',
    has: [['acc_title_value', 'T %% c']],
  },
  {
    id: 'a trailing %% stays in accDescr text',
    source: H + 'accDescr: T %% c',
    has: [['acc_descr_value', 'T %% c']],
  },
  {
    id: 'an empty quoted label gives no STR',
    source: H + 'quadrant-1 ""',
    has: [
      ['QUADRANT_1', 'quadrant-1 '],
      ['NEWLINE', '\n'],
    ],
  },
  {
    id: 'a quoted label spans line breaks',
    source: H + 'quadrant-1 "a\nb"',
    has: [['STR', 'a\nb']],
  },
  {
    id: ': in unquoted text is a COLON',
    source: H + 'quadrant-1 Q: x',
    has: [
      ['ALPHA', 'Q'],
      ['COLON', ':'],
    ],
  },
  {
    id: 'point_start crosses a line break',
    source: H + 'P:\n[0.1,\n0.2]',
    has: [
      ['point_start', ':\n['],
      ['point_x', '0.1'],
      ['point_y', '0.2'],
    ],
  },
  {
    id: 'header and statement on one line',
    source: 'quadrantChart x-axis A',
    has: [
      ['QUADRANT', 'quadrantChart '],
      ['X-AXIS', 'x-axis '],
    ],
  },
  {
    id: 'classDef names split at _',
    source: H + 'classDef a_b color: #ff0000',
    has: [
      ['ALPHA', 'a'],
      ['UNDERSCORE', '_'],
      ['ALPHA', 'b'],
    ],
  },
  {
    id: '::: class names take _',
    source: H + 'P:::a_b: [0.1, 0.2]',
    has: [['class_name', 'a_b']],
  },
  {
    id: 'bare keywords end in \\b (titleCase is a point)',
    source: H + 'titleCase: [0.1, 0.2]',
    has: [
      ['ALPHA', 'titleCase'],
      ['point_start', ': ['],
    ],
  },
];

/** `quadrantDb.spec.ts`'s style lists (it parses none), as point and classDef styles. */
const DB_STYLES: CorpusItem[] = [
  'radius: 10, color: #ff0000, stroke-color: #ff00ff, stroke-width: 10px',
  'test_name: value',
  'radius: f',
  'color: ffaa',
  'stroke-color: #f677779',
  'stroke-width: 30',
].flatMap((styles, k) => [
  { id: `db styles ${k} (point)`, source: `${H}P: [0.1, 0.2] ${styles}` },
  { id: `db styles ${k} (classDef)`, source: `${H}classDef c ${styles}` },
]);

/** Every jison rule and state edge, plus preprocessing shapes. */
const LEXER_CASES: CorpusItem[] = [
  H + 'x-axis a ---> b\ny-axis  c  --  d',
  // A failed `-->` at a lone dash: the space after it starts a new one (review of #300).
  H + 'x-axis Low - --> High',
  H + 'x-axis Low -- --> High',
  H + 'y-axis a - -->b',
  H + 'x-axis a -   --> b',
  // A lexical error inside an entity placeholder, and a comment after the last line break.
  H + 'P:::#12;x',
  H + 'quadrant-1 a\n%% c',
  H + 'X-AXIS A\nY-Axis B\nQUADRANT-2 C\nquadrant-3 D\nQuadrant-4 E\nTITLE T',
  H + 'quadrant-5 x\nquadrant- y\nx-axisy-axis',
  H + 'accTitle : t\naccDescr:d\naccDescr {\n  two\n  lines\n}\nquadrant-1 a',
  H + 'accDescr {',
  H + 'accDescr {\nopen',
  H + 'accTitle',
  H + 'accTitle:',
  H + 'title',
  H + 'title\n',
  H + 'quadrant-1 "open',
  H + 'quadrant-1 "`md **b**`"\nquadrant-2 "`open',
  H + 'quadrant-1 "`a"',
  H + 'quadrant-1 "`a`b`"',
  H + 'P:::',
  H + 'P:::\n',
  H + 'P: [',
  H + 'P: [0.1',
  H + 'P: [0.1,',
  H + 'P: [0.1, 0.2',
  H + 'P: [0.1 , 0.2 ]   \nQ :  [ 1 ,1 ]',
  H + 'P: [1, 1] radius: 10, color: #ff0000, stroke-color: #00ff00, stroke-width: 2px',
  H + 'P:::cls: [0, 0]\nclassDef cls color:#fff, radius : 3',
  H + "a + b, c = d == e * f # g _ h . i & j - k 12 ; l ! m $ n % o ' p ` q ? r \\ s / t",
  H + 'é 中文 😀 Ünïcödé x\u00a0y\u3000z',
  H + 'é%% c\nA',
  H + 'A\n%%\nB',
  H + 'A %%{-\nB',
  H + 'A}%% c\nB',
  H + 'A}%%{-\nB',
  H + 'A\u007fB',
  H + 'A\u0001B',
  H + 'x-axis a #quot; b --> c#9829;é\nquadrant-1 "#amp; #35;"\ntitle #y; t',
  H + 'P#y;: [0.1, 0.2]\nclassDef c color: #ff0000;\nquadrant-2 x;y;',
  H + 'quadrant-1 <b class="x">y</b>',
  '%%{init: {"quadrantChart": {"chartWidth": 400}}}%%\n' + H + 'quadrant-1 a',
  '---\ntitle: front\n---\n' + H + 'quadrant-1 a',
  '\n\n   ' + H + 'quadrant-1 a',
  'quadrantChart',
  'quadrantChart ',
  'quadrantChart\tx',
  'quadrantChartx-axis a',
  H + 'quadrantChart\nquadrantChart',
  H + '\t\v\f x',
  H + ';;\n\n;',
].map((source, i) => ({ id: `lexer case ${i}`, source }));

// U+2028 and U+2029: a regex `.` stops at them and `\s` takes them. CR and CRLF read as LF.
const LINE_SEPARATORS: CorpusItem[] = [
  H + 'title a\u2028b',
  H + 'P: [0\u20285, 0.1]',
  H + 'P:\u2028[0.1,\u20290.2]',
  H + 'quadrant-1 a\u2028b',
  H + 'accTitle: a\u2029b',
  'quadrantChart\r\nx-axis a --> b\r\nP: [0.1,\r\n0.2]\r\n%%\r\nB\r',
  'quadrantChart\rtitle t\rquadrant-1 "a\r\nb"\r',
  'quadrantChart\r\nquadrant-1 a\r\n%% c\r\n%%\r\nb',
].map((source, i) => ({ id: `line separators ${i}`, source }));

/** The parser cases (`corpus/quadrant-cases.json`), also in the parity suite. */
export function quadrantCases(): CorpusItem[] {
  return JSON.parse(
    readFileSync(join(REPO_ROOT, 'packages/conformance/corpus/quadrant-cases.json'), 'utf8')
  ) as CorpusItem[];
}

/** The e2e fixtures and the v12 spec strings. */
export async function quadrantCorpus(): Promise<CorpusItem[]> {
  const items: CorpusItem[] = [];
  for await (const item of corpusFromDir(join(REPO_ROOT, 'e2e/diagrams/quadrant-chart'), 'e2e')) {
    items.push(item);
  }
  const specs = JSON.parse(
    readFileSync(join(REPO_ROOT, 'packages/conformance/corpus/quadrant-v12-specs.json'), 'utf8')
  ) as CorpusItem[];
  return [...items, ...specs];
}

/**
 * Cases left out of the gate: v12's directive regex removes an unclosed `%%{` and everything
 * after it, core's preprocess keeps the text (a listed parity divergence, `divergences.json`).
 */
const PREPROCESS_DIFFERS = new Set(['quadrant-cases/unclosed-directive']);

/** The whole gate corpus, each source also with comment lines added. */
export async function quadrantGateCorpus(): Promise<CorpusItem[]> {
  const base = await quadrantCorpus();
  // The spec strings headed `QuadRantChart` again, with a header v12 detects.
  const headed = base
    .filter((item) => /^\s*QuadRantChart/.test(item.source))
    .map((item) => ({
      id: `${item.id} (header quadrantChart)`,
      source: item.source.replace('QuadRantChart', 'quadrantChart'),
    }));
  const all = [
    ...base,
    ...headed,
    ...quadrantCases().filter((c) => !PREPROCESS_DIFFERS.has(c.id)),
    ...QUIRKS.map(({ id, source }) => ({ id: `quirk: ${id}`, source })),
    ...DB_STYLES,
    ...LEXER_CASES,
    ...LINE_SEPARATORS,
  ];
  return [
    ...all,
    ...all.map((item) => ({ id: `${item.id} (commented)`, source: commented(item.source) })),
  ];
}

/**
 * `src` with nine comment lines after every line of the body; for a body of one or two lines,
 * one comment line through the middle of the second line, or before a one-line body. The header
 * line is never cut, so v12 still detects the chart. v12 removed the comment lines before
 * lexing, so tokens must match across them.
 */
function commented(src: string): string {
  const head = /^---[\s\S]*?\n---[^\S\n]*\n/.exec(src)?.[0] ?? '';
  const body = src.slice(head.length);
  const lines = body.split('\n');
  if (lines.length > 2) return head + lines.join('\n' + '  %% c\n'.repeat(9));
  const nl = body.indexOf('\n');
  if (nl < 0) return head + '%% cut\n' + body;
  const mid = nl + 1 + Math.floor((body.length - nl - 1) / 2);
  return head + body.slice(0, mid) + '\n%% cut\n' + body.slice(mid);
}

/** The ids of {@link NOT_DETECTED}, with the reason each is not compared. */
const DETECTION_EXCLUSIONS: readonly (readonly [string, string])[] = [
  ['v12-specs/parser/quadrant.jison.spec.ts#1', 'no header (the v12 spec expects a throw)'],
  ...[14, 15, 17, 18, 20, 21, 23, 24, 26, 27, 29, 30, 31].map(
    (n) =>
      [
        `v12-specs/parser/quadrant.jison.spec.ts#${n}`,
        'header `QuadRantChart`: compared as `(header quadrantChart)` instead',
      ] as const
  ),
];

/**
 * Sources v12 does not detect as a quadrant chart, so its lexer never ran and there is nothing
 * to compare: v12's detector (`/^\s*quadrantChart/`) is case-sensitive, though its lexer is not.
 * Any other source v12 does not detect fails the gate.
 */
export const NOT_DETECTED: ReadonlyMap<string, string> = new Map(
  DETECTION_EXCLUSIONS.flatMap(([id, why]) => [
    [id, why],
    [`${id} (commented)`, why],
  ])
);
