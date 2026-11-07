import { describe, expect, it } from 'vitest';
import { LineIndex } from '@mermaid-js/core/parser-kit';
import { parseMindmap } from '../index.ts';
import { JISON_NAMES, T } from './tokens.ts';

/**
 * Recovery set (R-PARSE-4): mindmaps with N independent errors give N error diagnostics, each
 * on the line where the error was planted, and the nodes around them still reach the model. No
 * message names a token or a grammar rule (R-ERR-5).
 */
interface Case {
  name: string;
  lines: string[];
  /** `[code, 1-based line]` of every expected error, in order. */
  errors: [string, number][];
  /** Node ids that must still be in the model. */
  keeps?: string[];
}

const CASES: Case[] = [
  {
    name: 'two second roots',
    lines: ['mindmap', '  root', '    a', '  b', '    c', '  d', '    e'],
    errors: [
      ['MINDMAP_SECOND_ROOT', 4],
      ['MINDMAP_SECOND_ROOT', 6],
    ],
    keeps: ['root', 'a', 'c', 'e'],
  },
  {
    name: 'an icon on a node line, and two nodes on one line',
    lines: ['mindmap', '  root', '    a[b] ::icon(x)', '    c', '    d[e] f', '    g'],
    errors: [
      ['UNEXPECTED', 3],
      ['UNEXPECTED', 5],
    ],
    keeps: ['root', 'a', 'c', 'd', 'g'],
  },
  {
    name: 'a decoration first, an empty shape, a brace',
    lines: ['mindmap', ':::cls', '  root', '    a[]', '    b', '    c{d}', '    e'],
    errors: [
      ['MINDMAP_DECORATION_BEFORE_NODE', 2],
      ['UNEXPECTED', 4],
      ['UNEXPECTED', 6],
    ],
    keeps: ['root', 'b', 'e'],
  },
  {
    name: 'a second header, and a blank line after the header',
    lines: ['mindmap', '', '  root', '    a', '    mindmap', '    b'],
    errors: [
      ['UNEXPECTED', 3],
      ['UNEXPECTED', 5],
    ],
    keeps: ['root', 'a', 'b'],
  },
  {
    name: 'a header after a missing one is the header',
    lines: ['  %% x', '  root', 'mindmap', '    a'],
    errors: [['UNEXPECTED', 2]],
    keeps: ['root', 'a'],
  },
  {
    name: 'no header, then an unclosed shape',
    lines: ['  root', '    a', '    b(never closed'],
    errors: [
      ['UNEXPECTED', 1],
      ['UNCLOSED_SHAPE', 3],
    ],
    keeps: ['root', 'a'],
  },
  {
    name: 'a bare class marker before a node, then an unclosed icon',
    lines: ['mindmap', '  root', '    a', '  :::', '    b', '    c', '    ::icon(x'],
    errors: [
      ['UNEXPECTED', 5],
      ['UNCLOSED_ICON', 7],
    ],
    keeps: ['root', 'a', 'b', 'c'],
  },
  {
    name: 'two blank runs before a node, then an unclosed string',
    lines: ['mindmap', '  root', '', '%%', '', '    a', '    b', '    c["d'],
    errors: [
      ['UNEXPECTED', 6],
      ['UNCLOSED_STRING', 8],
    ],
    keeps: ['root', 'a', 'b'],
  },
];

// Token names: jison terminals and v13 kind names that are compounds (`NodeDStart`).
const BANNED = new RegExp(
  `\\b(?:${[
    ...Object.values(JISON_NAMES).filter((n) => /_|^[A-Z]{2,}$/.test(n)),
    ...Object.keys(T).filter((n) => /^[A-Z][a-z]+[A-Z]/.test(n)),
    'nodeWithId',
    'nodeWithoutId',
    'spaceLines',
  ].join('|')})\\b`
);

describe('mindmap recovery', () => {
  it.each(CASES)('$name', ({ lines, errors, keeps }) => {
    const src = lines.join('\n');
    const r = parseMindmap(src);
    const index = new LineIndex(src);
    const got = r.diagnostics
      .filter((d) => d.severity === 'error')
      .map((d): [string, number] => [d.code, index.position(d.range.start).line + 1]);
    expect(got).toEqual(errors);
    for (const d of r.diagnostics) expect(d.message).not.toMatch(BANNED);
    const ids = r.model.nodes.map((n) => n.id.trim());
    for (const k of keeps ?? []) expect(ids).toContain(k);
  });
});
