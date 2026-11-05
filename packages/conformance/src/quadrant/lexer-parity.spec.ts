// cspell:words quadrantchart
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Kind } from '@mermaid-js/core/parser-kit';
import { JISON_NAMES, lexQuadrant } from '@mermaid-js/diagram-quadrant';
import { corpusFromDir, REPO_ROOT } from '../corpus.ts';
import type { CorpusItem } from '../types.ts';
import { decodeEntities } from '../flowchart/v12.ts';
import { LEXICAL_ERROR, loadJisonLexerOracle } from '../jison/oracle.ts';
import type { JisonToken } from '../jison/oracle.ts';

/**
 * Lexer-parity gate (#300, parser-method §1, D212): the v13 quadrant lexer emits the same
 * terminals, with the same images, as mermaid 12.2.0's `quadrant.jison` lexer on the text v12
 * lexed (`loadJisonLexerOracle('quadrant')`).
 *
 * Corpus: the 14 e2e fixtures, the strings harvested from v12's `quadrant.jison.spec.ts` and
 * syntax page (`corpus/quadrant-v12-specs.json`), those headed `QuadRantChart` again with a
 * header v12 detects, the style lists of `quadrantDb.spec.ts` put
 * into point and classDef statements (that spec has no diagram sources), the named quirk cases
 * ({@link QUIRKS}), hand-written lexer cases, line-separator and CRLF cases; and every one of
 * those again with comment lines added (v12 removed them before lexing, pitfall 3).
 *
 * Images are compared as v12's lexer matched them, entity placeholders decoded, including the
 * `\n` v12 appended (v13 lexes it too; `quadrantTokens` clips it off for consumers). The text
 * v13 rebuilt is also checked against the exact text the oracle saw, and every source is
 * compared but the ones listed in {@link NOT_DETECTED}. A separate check holds every token's
 * source range to the contract ({@link rangeViolations}).
 *
 * Exclusions (v13 tokens with no jison terminal, left out of the comparison):
 * - comments and directives v12 removed before lexing, and the `%%` comments jison's rules
 *   skip (`%%…`, and `x%%…` with the character before), are v13 trivia tokens;
 * - the openers and closers jison matches without returning a token: `"`, the quote-backtick pair
 *   opening a markdown string and the backtick-quote pair closing it,
 *   `:::`, `accDescr {` and its `}`, the `,` between coordinates and the closing `]`;
 * - the sources listed in {@link NOT_DETECTED}, which v12 does not detect as a quadrant chart,
 *   so it never ran the lexer on them.
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
const QUIRKS: Quirk[] = [
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

async function corpus(): Promise<CorpusItem[]> {
  const items: CorpusItem[] = [];
  for await (const item of corpusFromDir(join(REPO_ROOT, 'e2e/diagrams/quadrant-chart'), 'e2e')) {
    items.push(item);
  }
  const specs = JSON.parse(
    readFileSync(join(REPO_ROOT, 'packages/conformance/corpus/quadrant-v12-specs.json'), 'utf8')
  ) as CorpusItem[];
  // The spec strings headed `QuadRantChart` again, with a header v12 detects.
  const headed = specs
    .filter((item) => /^\s*QuadRantChart/.test(item.source))
    .map((item) => ({
      id: `${item.id} (header quadrantChart)`,
      source: item.source.replace('QuadRantChart', 'quadrantChart'),
    }));
  const all = [
    ...items,
    ...specs,
    ...headed,
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
const NOT_DETECTED: ReadonlyMap<string, string> = new Map(
  DETECTION_EXCLUSIONS.flatMap(([id, why]) => [
    [id, why],
    [`${id} (commented)`, why],
  ])
);

const show = (t: JisonToken[]) => t.map(([n, i]) => `${n}:${JSON.stringify(i)}`).join(' ');

/** Whether `run` occurs in `tokens` as consecutive tokens. */
function contains(tokens: JisonToken[], run: JisonToken[]): boolean {
  const key = (t: JisonToken[]) => t.map((x) => JSON.stringify(x)).join(',');
  return key(tokens).includes(key(run));
}

describe('quadrant lexer parity with mermaid@12 (jison)', () => {
  it('emits the same tokens over the e2e fixtures, the v12 spec strings and the cases', async () => {
    const oracle = await loadJisonLexerOracle('quadrant');
    const items = await corpus();
    const diffs: string[] = [];
    const undetected: string[] = [];
    let compared = 0;
    let e2e = 0;
    for (const item of items) {
      const v12 = await oracle.tokens(item.source, { keepAppendedNewline: true });
      if (!v12) {
        undetected.push(item.id);
        continue;
      }
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
    // Every source is compared, but the listed ones v12 does not detect.
    expect(undetected.sort()).toEqual([...NOT_DETECTED.keys()].sort());
    expect(compared).toBe(items.length - NOT_DETECTED.size);
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

  it('maps every token to a consistent source range', async () => {
    const bad: string[] = [];
    for (const item of await corpus()) {
      for (const v of rangeViolations(item.source)) bad.push(`${item.id}: ${v}`);
    }
    expect(bad).toEqual([]);
  }, 60_000);

  it('fires every reachable jison rule over the corpus', async () => {
    const fired = new Set<number>();
    for (const item of await corpus()) lexQuadrant(item.source, (rule) => fired.add(rule));
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

/**
 * Where the source ranges of `src`'s tokens break the stream's contract (empty when none):
 * - each character of the text v12 lexed has the range of the source it stands for: one source
 *   character (`'` for a converted tag quote, `ﬂ` for an entity's `#`, `¶` for its `;`), a
 *   CRLF read as LF, or zero-width at the end of the one before (the rest of an entity
 *   placeholder, and the `\n` v12 appended), in source order;
 * - each token of that text (named or not) spans exactly the source of its characters, so the
 *   source at its range re-lexes to its image, character for character;
 * - tokens are in source order and those of v12's text do not overlap; a removed span (trivia)
 *   lies between them, or inside the token right before it (a string over a comment line);
 * - every source character after the leading blanks v12 trimmed is in a token, but the `;`
 *   v12 dropped from `classDef` lines.
 */
/** One source character read as another: an entity's `#` and `;`, a tag quote, a lone CR. */
const READ_AS: ReadonlyMap<string, string> = new Map([
  ['#', 'ﬂ'],
  [';', '¶'],
  ['"', "'"],
  ['\r', '\n'],
]);

function rangeViolations(src: string): string[] {
  const l = lexQuadrant(src);
  const v = l.v12;
  const t = l.tokens;
  const out: string[] = [];
  // The appended `\n` is zero-width at the end of the source.
  const at = (i: number) =>
    i >= v.length ? src.length : v.starts ? (v.starts[i] ?? 0) : v.from + i;
  const to = (i: number) =>
    i >= v.length ? src.length : v.ends ? (v.ends[i] ?? 0) : v.from + i + 1;
  for (let i = 0; i < v.text.length; i++) {
    const a = at(i);
    const b = to(i);
    const c = v.text[i] ?? '';
    const prevEnd = i > 0 ? to(i - 1) : 0;
    let ok = a <= b && b <= src.length && (i === 0 || a >= prevEnd);
    if (b === a + 1) {
      const s = src[a] ?? '';
      ok &&= s === c || READ_AS.get(s) === c;
    } else if (b === a + 2) ok &&= src.slice(a, b) === '\r\n' && c === '\n';
    else if (b === a) ok &&= i >= v.length ? c === '\n' : '°ß'.includes(c) && a === prevEnd;
    else ok = false;
    if (!ok) out.push(`char ${i} ${JSON.stringify(c)} at ${a}-${b}`);
  }
  const covered = new Uint8Array(src.length);
  let lastStart = 0;
  let prev = -1;
  for (let j = 0; j < t.length - 1; j++) {
    const start = t.start[j] ?? 0;
    const end = t.end[j] ?? 0;
    const ts = l.textStart[j] ?? -1;
    const te = l.textEnd[j] ?? -1;
    const name = JISON_NAMES[t.kind[j] ?? -1] ?? String(t.kind[j]);
    const where = `${name}@${start}-${end}`;
    if (start > end || end > src.length || start < lastStart) out.push(`${where} out of order`);
    lastStart = start;
    if (ts < 0) {
      const kind = t.kind[j];
      if (kind !== Kind.Comment && kind !== Kind.Directive) out.push(`${where} has no text`);
      const before = prev < 0 ? 0 : (t.end[prev] ?? 0);
      const inside = prev >= 0 && (t.start[prev] ?? 0) <= start && end <= before;
      if (start < before && !inside) out.push(`${where} overlaps the token before`);
      covered.fill(1, start, end);
      continue;
    }
    const last = Math.min(te, v.length) - 1;
    const wantStart = ts < v.length ? at(ts) : src.length;
    const wantEnd = last >= ts ? Math.max(wantStart, to(last)) : wantStart;
    if (start !== wantStart || end !== wantEnd)
      out.push(`${where}, its text is at ${wantStart}-${wantEnd}`);
    if (prev >= 0 && start < (t.end[prev] ?? 0)) out.push(`${where} overlaps the token before`);
    covered.fill(1, start, end);
    prev = j;
  }
  const first = l.textStart.findIndex((s) => s >= 0);
  const from = first < 0 ? src.length : (t.start[first] ?? 0);
  for (let i = from; i < src.length; i++) {
    if (!covered[i] && src[i] !== ';')
      out.push(`source ${i} ${JSON.stringify(src[i])} in no token`);
  }
  return out;
}
