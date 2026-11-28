import { describe, expect, it } from 'vitest';
import { LineIndex } from '@mermaid-js/core/parser-kit';
import * as codes from '../codes.ts';
import { parseC4 } from './index.ts';
import { JISON_NAMES, KEYWORDS, T } from './tokens.ts';

/**
 * Recovery set (R-PARSE-4): diagrams with N independent errors give N error diagnostics, each on
 * the line where the error was planted, and the elements around them still reach the model. No
 * message names a token or a grammar rule (R-ERR-5).
 */
interface Case {
  name: string;
  lines: string[];
  /** `[code, 1-based line]` of every expected error, in order. */
  errors: [string, number][];
  /** Aliases that must still be in the model (elements or boundaries). */
  keeps?: string[];
}

const P = (alias: string) => `Person(${alias}, "${alias.toUpperCase()}")`;

const CASES: Case[] = [
  {
    name: 'a blank before `(`, then a `;` after a statement',
    lines: ['C4Context', 'Person (a, "A")', `${P('b')};`, P('c')],
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED', 3],
    ],
    keeps: ['b', 'c'],
  },
  {
    name: 'arguments left open at the line end, then an unclosed string at the end',
    lines: ['C4Context', 'Person(a, "A"', P('b'), 'Person(c, "C'],
    errors: [
      ['UNCLOSED_ARGUMENTS', 2],
      ['UNCLOSED_STRING', 4],
    ],
    keeps: ['b'],
  },
  {
    name: 'no header',
    lines: [P('a'), P('b')],
    errors: [['UNEXPECTED', 1]],
    keeps: ['b'],
  },
  {
    name: 'a second header, and two statements on one line',
    lines: ['C4Context', P('a'), 'C4Container', `${P('b')} ${P('c')}`, P('d')],
    errors: [
      ['UNEXPECTED', 3],
      ['UNEXPECTED', 4],
    ],
    keeps: ['a', 'b', 'd'],
  },
  {
    name: 'a direction with text after it, and a bad value',
    lines: ['C4Context', 'direction LR then more', P('a'), 'direction XY', P('b')],
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED', 4],
    ],
    keeps: ['a', 'b'],
  },
  {
    name: 'a direction on the header line',
    lines: ['C4Context direction TB', P('a')],
    errors: [['UNEXPECTED', 1]],
    keeps: ['a'],
  },
  {
    name: 'an empty boundary, and one starting with its title',
    lines: ['C4Context', 'Boundary(b, "B") {', '}', 'Boundary(c, "C") {', 'title X', P('a'), '}'],
    errors: [
      ['UNEXPECTED', 3],
      ['UNEXPECTED', 5],
    ],
    keeps: ['b', 'c', 'a'],
  },
  {
    name: 'a boundary on one line',
    lines: ['C4Context', `Boundary(b, "B") { ${P('a')} }`, P('c')],
    errors: [['UNEXPECTED', 2]],
    keeps: ['b', 'c'],
  },
  {
    name: 'boundary arguments running into its `{`: the `}` still closes it',
    lines: ['C4Context', 'Boundary(b, "B" {', `  ${P('a')}`, '}', P('c')],
    errors: [['UNCLOSED_ARGUMENTS', 2]],
    keeps: ['a', 'c'],
  },
  {
    name: 'a failed boundary with its `{` on the next line',
    lines: ['C4Context', 'Boundary(b "B"', '{', P('a'), '}', P('c')],
    errors: [['UNCLOSED_ARGUMENTS', 2]],
    keeps: ['a', 'c'],
  },
  {
    name: 'a boundary missing its `{`',
    lines: ['C4Context', 'Boundary(b, "B")', P('a'), P('c')],
    // At the line break where the `{` belongs.
    errors: [['UNEXPECTED', 2]],
    keeps: ['b', 'c'],
  },
  {
    name: 'three boundaries left open',
    lines: ['C4Context', 'Boundary(a, "A") {', 'Boundary(b, "B") {', 'Boundary(c, "C") {', P('p')],
    errors: [
      ['UNCLOSED_BLOCK', 2],
      ['UNCLOSED_BLOCK', 3],
      ['UNCLOSED_BLOCK', 4],
    ],
    keeps: ['a', 'b', 'c', 'p'],
  },
  {
    name: 'a `}` closing nothing, and a `{` opening nothing',
    lines: ['C4Context', P('a'), '}', '{', P('b'), '}', P('c')],
    errors: [
      ['UNEXPECTED', 3],
      ['UNEXPECTED', 4],
    ],
    keeps: ['a', 'b', 'c'],
  },
  {
    name: 'empty arguments, an empty named value and an unquoted one',
    lines: ['C4Context', 'Person()', 'Person(a, $k="")', 'Person(b, $k=x)', P('c')],
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED', 3],
      ['UNEXPECTED', 4],
    ],
    keeps: ['c'],
  },
  {
    name: 'a line break after a macro name',
    lines: ['C4Context', 'Person', '(a, "A")', P('b')],
    errors: [['UNEXPECTED', 2]],
    keeps: ['b'],
  },
  {
    name: '`$__proto__` (a warning, as the reference implementation keeps it), then a relation to an alias nobody defines',
    lines: ['C4Context', 'Person(a, "A", $__proto__="x")', 'Rel(a, nobody, "x")', P('c')],
    errors: [[codes.C4_UNKNOWN_END, 3]],
    keeps: ['a', 'c'],
  },
  {
    name: 'an alias a failed statement may have defined is not reported unknown',
    lines: ['C4Context', 'Person(a, "A";', 'Rel(a, b, "x")', P('b')],
    errors: [['UNCLOSED_ARGUMENTS', 2]],
    keeps: ['b'],
  },
  {
    name: 'an unclosed `accDescr {`',
    lines: ['C4Context', P('a'), 'accDescr {', '  x'],
    errors: [['UNCLOSED_ACC_DESCR', 3]],
    keeps: ['a'],
  },
  {
    name: '`accTitle:` with nothing after it at the end',
    lines: ['C4Context', P('a'), 'accTitle:'],
    errors: [['UNEXPECTED', 3]],
    keeps: ['a'],
  },
  {
    name: 'stray characters at a statement start',
    lines: ['C4Context', `@${P('a')}`, P('b'), '#x'],
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED', 4],
    ],
    keeps: ['b'],
  },
  {
    name: 'a misspelt macro, then a word after a `}`',
    lines: ['C4Context', 'Persn(a, "A")', 'Boundary(b, "B") {', P('c'), '} x', P('d')],
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED', 5],
    ],
    keeps: ['b', 'c', 'd'],
  },
  {
    name: 'a header with nothing after it',
    lines: ['C4Context'],
    errors: [['UNEXPECTED', 1]],
  },
  {
    name: 'warnings are not errors: a bad offset and a moved named argument, then an open relation',
    lines: [
      'C4Context',
      P('a'),
      'Rel(a, a, "x", $offsetX="q")',
      'Person(b, $descr="d")',
      'Rel(a, a, "y"',
    ],
    errors: [['UNCLOSED_ARGUMENTS', 5]],
    keeps: ['a', 'b'],
  },
  {
    name: 'an unclosed string, then statements (#681): it stops before the next one',
    lines: ['C4Context', 'Person(a, "A)', P('b'), P('c')],
    errors: [['UNCLOSED_STRING', 2]],
    keeps: ['b', 'c'],
  },
  {
    name: 'an unclosed named value, then a boundary (#681)',
    lines: ['C4Context', 'Person(a, "A", $descr="d)', '  Boundary(b, "B") {', P('c'), '}'],
    errors: [['UNCLOSED_STRING', 2]],
    keeps: ['b', 'c'],
  },
  {
    name: 'an open named value runs to the end',
    lines: ['C4Context', P('a'), 'Person(b, "B", $k="v'],
    errors: [['UNCLOSED_STRING', 3]],
    keeps: ['a'],
  },
];

// Token names: jison terminals and v13 kind names that are compounds (`ArgsOpen`), but not the
// macros as written (`SystemDb`), and the grammar's compound rule names.
const BANNED = new RegExp(
  `\\b(?:${[
    ...Object.values(JISON_NAMES).filter((n) => /_|^[A-Z]{2,}$/.test(n)),
    ...Object.keys(T).filter((n) => /^[A-Z][a-z]+[A-Z]/.test(n) && !KEYWORDS.has(n)),
    'diagramStatements',
    'diagramStatement',
    'otherStatement',
  ].join('|')})\\b`
);

describe('c4 recovery', () => {
  it('has at least 20 cases', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(20);
  });

  it.each(CASES)('$name', ({ lines, errors, keeps }) => {
    const src = lines.join('\n');
    const r = parseC4(src);
    const index = new LineIndex(src);
    const got = r.diagnostics
      .filter((d) => d.severity === 'error')
      .map((d): [string, number] => [d.code, index.position(d.range.start).line + 1]);
    expect(got).toEqual(errors);
    for (const d of r.diagnostics) expect(d.message).not.toMatch(BANNED);
    const aliases = [...r.model.elements, ...r.model.boundaries].map((e) => e.alias);
    for (const k of keeps ?? []) expect(aliases).toContain(k);
  });
});
