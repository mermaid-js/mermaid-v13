import { describe, expect, it } from 'vitest';
import { LineIndex } from '@mermaid-js/core/parser-kit';
import { parseGitGraph } from './parser.ts';
import { LANGIUM_NAMES } from './tokens.ts';

/**
 * Recovery set (R-PARSE-4): texts with N independent errors give N error diagnostics, each on
 * the line where it was planted, and the commits around them still reach the model. No message
 * names a token or a grammar rule (R-ERR-5).
 */
interface Case {
  name: string;
  lines: string[];
  /** `[code, 1-based line]` of every expected error, in order. */
  errors: [string, number][];
  /** Commit ids that must still be in the model. */
  keeps?: string[];
}

const CASES: Case[] = [
  {
    name: 'a direction without its colon',
    lines: ['gitGraph TB', 'commit id:"a"'],
    errors: [['UNEXPECTED', 1]],
    keeps: ['a'],
  },
  {
    name: 'no gitGraph at the start',
    lines: ['commit id:"a"', 'commit id:"b"'],
    errors: [['UNEXPECTED', 1]],
    keeps: ['b'],
  },
  {
    name: 'an unknown commit option',
    lines: ['gitGraph', 'commit id:"a" oops:"x"', 'commit id:"b"'],
    errors: [['UNEXPECTED', 2]],
    keeps: ['b'],
  },
  {
    name: 'an option without its colon',
    lines: ['gitGraph', 'commit id "a"', 'commit id:"b"'],
    errors: [['UNEXPECTED', 2]],
    keeps: ['b'],
  },
  {
    name: 'an unquoted id',
    lines: ['gitGraph', 'commit id:a', 'commit id:"b"'],
    errors: [['UNEXPECTED', 2]],
    keeps: ['b'],
  },
  {
    name: 'an unknown commit type',
    lines: ['gitGraph', 'commit type:OTHER', 'commit id:"b"'],
    errors: [['UNEXPECTED', 2]],
    keeps: ['b'],
  },
  {
    name: 'two statements on a line',
    lines: ['gitGraph', 'commit id:"a" commit id:"x"', 'commit id:"b"'],
    errors: [['UNEXPECTED', 2]],
    keeps: ['b'],
  },
  {
    name: 'a semicolon after a statement',
    lines: ['gitGraph', 'commit id:"a";', 'commit id:"b"'],
    errors: [['UNEXPECTED_CHARACTER', 2]],
    keeps: ['b'],
  },
  {
    name: 'an unclosed string',
    lines: ['gitGraph', 'commit id:"b"', 'commit msg:"never closed'],
    errors: [['UNCLOSED_STRING', 3]],
    keeps: ['b'],
  },
  {
    name: 'a branch without a name',
    lines: ['gitGraph', 'commit id:"a"', 'branch', 'commit id:"b"'],
    errors: [['UNEXPECTED', 3]],
    keeps: ['a', 'b'],
  },
  {
    name: 'a name that starts with title (D269)',
    lines: ['gitGraph', 'commit id:"a"', 'branch titled', 'commit id:"b"'],
    errors: [['UNEXPECTED', 3]],
    keeps: ['a', 'b'],
  },
  {
    name: 'a name of digits',
    lines: ['gitGraph', 'commit id:"a"', 'branch 123', 'commit id:"b"'],
    errors: [['UNEXPECTED', 3]],
    keeps: ['a', 'b'],
  },
  {
    name: 'an order that is not a whole number',
    lines: ['gitGraph', 'commit id:"a"', 'branch x order: 1.5', 'commit id:"b"'],
    errors: [['UNEXPECTED', 3]],
    keeps: ['a', 'b'],
  },
  {
    name: 'a stray character',
    lines: ['gitGraph', 'commit id:"a"', '@', 'commit id:"b"'],
    errors: [['UNEXPECTED_CHARACTER', 3]],
    keeps: ['a', 'b'],
  },
  {
    name: 'an upper-case keyword',
    lines: ['gitGraph', 'COMMIT', 'commit id:"b"'],
    errors: [['UNEXPECTED', 2]],
    keeps: ['b'],
  },
  {
    name: 'accTitle without a colon',
    lines: ['gitGraph', 'accTitle x', 'commit id:"b"'],
    errors: [['UNEXPECTED', 2]],
    keeps: ['b'],
  },
  {
    name: 'an unclosed accDescr block',
    lines: ['gitGraph', 'commit id:"b"', 'accDescr { x'],
    errors: [['UNEXPECTED', 3]],
    keeps: ['b'],
  },
  {
    name: 'a second gitGraph',
    lines: ['gitGraph', 'gitGraph', 'commit id:"b"'],
    errors: [['UNEXPECTED', 2]],
    keeps: ['b'],
  },
  {
    name: 'an existing branch, then commits on the current one',
    lines: ['gitGraph', 'commit id:"a"', 'branch main', 'commit id:"b"'],
    errors: [['GIT_BRANCH_EXISTS', 3]],
    keeps: ['a', 'b'],
  },
  {
    name: 'three DB errors and a syntax error',
    lines: [
      'gitGraph',
      'commit id:"a"',
      'checkout nope',
      'merge nope',
      'cherry-pick id:"zz"',
      'branch b order:x',
      'commit id:"b"',
    ],
    errors: [
      ['GIT_UNKNOWN_BRANCH', 3],
      ['GIT_MERGE_UNKNOWN_BRANCH', 4],
      ['GIT_CHERRY_PICK_UNKNOWN_COMMIT', 5],
      ['UNEXPECTED', 6],
    ],
    keeps: ['a', 'b'],
  },
  {
    name: 'a merge id already used, then the merge without it',
    lines: [
      'gitGraph',
      'commit id:"a"',
      'branch x',
      'commit id:"x1"',
      'checkout main',
      'merge x id:"a"',
      'merge x id:"m"',
    ],
    errors: [['GIT_MERGE_DUPLICATE_ID', 6]],
    keeps: ['a', 'x1', 'm'],
  },
];

/** Token type names (`REFERENCE`, …) and grammar rule names, which no message may name. */
const INTERNAL = [
  // `NORMAL`, `REVERSE` and `HIGHLIGHT` are what an author writes.
  ...Object.values(LANGIUM_NAMES).filter(
    (n) => /^[A-Z_]{3,}$/.test(n) && !['NORMAL', 'REVERSE', 'HIGHLIGHT'].includes(n)
  ),
  'CherryPicking',
  'TitleAndAccessibilities',
  'Statement',
  'EOL',
];

describe('gitGraph recovery (R-PARSE-4)', () => {
  it('has at least 20 cases', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(20);
  });

  for (const c of CASES) {
    it(c.name, () => {
      const src = c.lines.join('\n');
      const { model, diagnostics } = parseGitGraph(src);
      const lines = new LineIndex(src);
      const errors = diagnostics
        .filter((d) => d.severity === 'error')
        .map((d) => [d.code, lines.position(d.range.start).line + 1]);
      expect(errors).toEqual(c.errors);
      const ids = model.commits.map((x) => x.id);
      for (const k of c.keeps ?? []) expect(ids).toContain(k);
      for (const d of diagnostics) {
        for (const name of INTERNAL) expect(d.message, d.message).not.toContain(name);
      }
    });
  }
});
