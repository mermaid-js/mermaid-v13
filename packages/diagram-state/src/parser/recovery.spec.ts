import { describe, expect, it } from 'vitest';
import { LineIndex } from '@mermaid-js/core/parser-kit';
import { parseState } from '../index.ts';

/**
 * Recovery set (R-PARSE-4): documents with N independent errors give N error diagnostics, each
 * on the line where the error was planted, and the statements around them still reach the
 * model. Inside a composite state, where v12 has no line-break tokens, recovery resumes at the
 * next line too.
 */
interface Case {
  name: string;
  lines: string[];
  /** `[code, 1-based line]` of every expected error, in order. */
  errors: [string, number][];
  /** States that must still be in the model. */
  keeps?: string[];
}

const CASES: Case[] = [
  {
    name: 'two dangling arrows',
    lines: ['stateDiagram-v2', 'A -->', 'B --> C', 'D -->', 'E --> F'],
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED', 4],
    ],
    keeps: ['B', 'C', 'E', 'F'],
  },
  {
    name: 'arrow without a source, twice',
    lines: ['stateDiagram-v2', '--> A', 'B', '--> C', 'D'],
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED', 4],
    ],
    keeps: ['B', 'D'],
  },
  {
    name: 'single-dash arrows',
    lines: ['stateDiagram-v2', 'A -> B', 'C --> D', 'E -> F'],
    errors: [
      ['UNEXPECTED_CHARACTER', 2],
      ['UNEXPECTED_CHARACTER', 4],
    ],
    keeps: ['C', 'D'],
  },
  {
    name: 'a description with no state',
    lines: ['stateDiagram-v2', ': lost', 'A --> B', ': again'],
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED', 4],
    ],
    keeps: ['A', 'B'],
  },
  {
    name: 'multi-word state names',
    lines: ['stateDiagram-v2', 'state a b {', 'c', '}', 'X --> Y', 'state d e {', 'f', '}'],
    errors: [
      ['MULTI_WORD_STATE', 2],
      ['MULTI_WORD_STATE', 6],
    ],
    keeps: ['X', 'Y'],
  },
  {
    name: 'classDef default, twice',
    lines: ['stateDiagram-v2', 'classDef default fill:red', 'A', 'classDef default x', 'B'],
    errors: [
      ['CLASSDEF_DEFAULT', 2],
      ['CLASSDEF_DEFAULT', 4],
    ],
    keeps: ['A'],
  },
  {
    name: 'style and class without state ids',
    lines: ['stateDiagram-v2', 'style "x"', 'B --> C', 'class "y"'],
    errors: [
      ['UNEXPECTED_CHARACTER', 2],
      ['UNEXPECTED_CHARACTER', 4],
    ],
    keeps: ['B', 'C'],
  },
  {
    name: 'described state without as',
    lines: ['stateDiagram-v2', 'state "x"', 'A', 'state "y" B', 'C'],
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED', 4],
    ],
    keeps: ['A', 'C'],
  },
  {
    // The text of a multi-line note runs to `end note`, here to the end of the text.
    name: 'note without a side, and a note with no `end note`',
    lines: ['stateDiagram-v2', 'note A : x', 'A --> B', 'note left of', 'C'],
    errors: [
      ['UNEXPECTED_CHARACTER', 2],
      ['UNCLOSED_NOTE', 4],
    ],
    keeps: ['A', 'B'],
  },
  {
    name: 'two errors inside one composite state',
    lines: ['stateDiagram-v2', 'state X {', '  A -->', '  B --> C', '  : x', '  D', '}', 'E'],
    errors: [
      ['UNEXPECTED', 4],
      ['UNEXPECTED', 5],
    ],
    // No line breaks inside a composite (as in v12): `A -->` takes the `B` of the next line.
    keeps: ['X', 'A', 'B', 'D', 'E'],
  },
  {
    name: 'errors in nested composites',
    lines: [
      'stateDiagram-v2',
      'state X {',
      '  state Y {',
      '    -> P',
      '    Q',
      '  }',
      '  R -> S',
      '}',
      'T',
    ],
    errors: [
      ['UNEXPECTED_CHARACTER', 4],
      ['UNEXPECTED_CHARACTER', 7],
    ],
    keeps: ['X', 'Y', 'Q', 'T'],
  },
  {
    name: 'unclosed composite state',
    lines: ['stateDiagram-v2', 'A --> B', 'state X {', '  C'],
    errors: [['UNCLOSED_COMPOSITE', 3]],
    keeps: ['A', 'B', 'X', 'C'],
  },
  {
    name: 'an error before an unclosed composite',
    lines: ['stateDiagram-v2', 'A ->', 'state X {', '  C'],
    errors: [
      ['UNEXPECTED_CHARACTER', 2],
      ['UNCLOSED_COMPOSITE', 3],
    ],
    keeps: ['X', 'C'],
  },
  {
    name: 'missing header, then an error',
    lines: ['A --> B', 'stateDiagram-v2', 'C -->', 'D'],
    // The header comes late: one error, then the parse goes on after it.
    errors: [
      ['UNEXPECTED', 1],
      ['UNEXPECTED', 3],
    ],
    keeps: ['D'],
  },
  {
    name: 'click without a url, twice',
    lines: ['stateDiagram-v2', 'A', 'click A', 'B', 'click B "u" "t" C', 'D'],
    errors: [
      ['UNEXPECTED', 3],
      ['UNEXPECTED', 5],
    ],
    keeps: ['A', 'B', 'D'],
  },
  {
    name: 'click statements with text after them',
    lines: ['stateDiagram-v2', 'A', 'click A "u" "t" B', 'C', 'click C href "v" D', 'E'],
    errors: [
      ['UNEXPECTED', 3],
      ['UNEXPECTED', 5],
    ],
    keeps: ['A', 'C', 'E'],
  },
  {
    name: 'scale without width, and stray text after a state name',
    lines: ['stateDiagram-v2', 'A', 'scale 300', 'B', 'scale width', 'C'],
    errors: [
      ['UNEXPECTED_CHARACTER', 3],
      ['UNEXPECTED_CHARACTER', 5],
    ],
    keeps: ['A', 'B', 'C'],
  },
  {
    name: 'stray quoted strings',
    lines: ['stateDiagram-v2', '"loose"', 'A', '"loose"', 'B'],
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED', 4],
    ],
    keeps: ['A', 'B'],
  },
  {
    name: 'default and href as statements',
    lines: ['stateDiagram-v2', 'default', 'A --> B', 'href', 'C'],
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED', 4],
    ],
    keeps: ['A', 'B', 'C'],
  },
  {
    name: 'composite with two descriptions and a syntax error',
    lines: ['stateDiagram-v2', 'state "a" as X {', 'Y', '}', 'X : b', 'Z -->'],
    errors: [
      ['UNEXPECTED', 6],
      ['COMPOSITE_DESCRIPTION', 2],
    ],
  },
  {
    name: 'three mistakes',
    lines: ['stateDiagram-v2', 'A -> B', 'state c d {', '}', 'E -->', 'F --> G'],
    errors: [
      ['UNEXPECTED_CHARACTER', 2],
      ['MULTI_WORD_STATE', 3],
      ['UNEXPECTED', 5],
    ],
    keeps: ['F', 'G'],
  },
];

describe('state recovery set', () => {
  it('has at least 20 cases', () => expect(CASES.length).toBeGreaterThanOrEqual(20));

  it.each(CASES)('$name: one diagnostic per error', ({ lines, errors, keeps }) => {
    const src = lines.join('\n');
    const r = parseState(src);
    const index = new LineIndex(src);
    const got = r.diagnostics
      .filter((d) => d.severity === 'error')
      .map((d) => [d.code, index.position(d.range.start).line + 1]);
    expect(got).toEqual(errors);
    const ids = new Set(r.model.states.map((s) => s.id));
    for (const k of keeps ?? []) expect(ids, k).toContain(k);
  });
});
