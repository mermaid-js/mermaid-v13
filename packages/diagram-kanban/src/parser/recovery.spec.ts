import { describe, expect, it } from 'vitest';
import { LineIndex } from '@mermaid-js/core/parser-kit';
import { parseKanban } from '../index.ts';
import { JISON_NAMES, T } from './tokens.ts';

/**
 * Recovery set (R-PARSE-4): boards with N independent errors give N error diagnostics, each on
 * the line where the error was planted, and the items around them still reach the model. No
 * message names a token or a grammar rule (R-ERR-5).
 */
interface Case {
  name: string;
  lines: string[];
  /** `[code, 1-based line]` of every expected error, in order. */
  errors: [string, number][];
  /** Item ids that must still be in the model. */
  keeps?: string[];
}

const CASES: Case[] = [
  {
    name: 'bad YAML, a bad shape and empty data, each on its own card',
    lines: [
      'kanban',
      '  todo',
      '    a@{ x: [ }',
      '    b@{ shape: Rect }',
      '    c@{',
      '    }',
      '    d',
    ],
    errors: [
      ['SHAPE_DATA', 3],
      ['KANBAN_SHAPE', 4],
      ['KANBAN_DATA_EMPTY', 5],
    ],
    keeps: ['todo', 'a', 'b', 'c', 'd'],
  },
  {
    name: 'bad YAML, then a syntax error in the same statement',
    lines: ['kanban', '  todo', '    a@{ x: [ } extra', '    b'],
    errors: [
      ['SHAPE_DATA', 3],
      ['UNEXPECTED', 3],
    ],
    keeps: ['todo', 'a', 'b'],
  },
  {
    name: 'a decoration first, then two misplaced indents',
    lines: ['kanban', '  :::hot', '    todo', '      a', '  b', '      c', '  d', '      e'],
    errors: [
      ['KANBAN_DECORATION_BEFORE_ITEM', 2],
      ['KANBAN_ITEM_WITHOUT_COLUMN', 5],
      ['KANBAN_ITEM_WITHOUT_COLUMN', 7],
    ],
    keeps: ['todo', 'a', 'b', 'c', 'd', 'e'],
  },
  {
    name: 'data with no item, an item after a closer, and a lone at',
    lines: ['kanban', '  todo', '    @{ ticket: x }', '    a(x)y', '    b@c', '    d'],
    errors: [
      ['UNEXPECTED', 3],
      ['UNEXPECTED', 4],
      ['UNEXPECTED', 5],
    ],
    keeps: ['todo', 'a', 'd'],
  },
  {
    name: 'a second header, and a blank line after the header',
    lines: ['kanban', '', '  todo', '    a', '    kanban', '    b'],
    errors: [
      ['UNEXPECTED', 3],
      ['UNEXPECTED', 5],
    ],
    keeps: ['todo', 'a', 'b'],
  },
  {
    name: 'no header, then unclosed shape data',
    lines: ['  todo', '    a', '    b@{ x: 1'],
    errors: [
      ['UNEXPECTED', 1],
      ['UNCLOSED_SHAPE_DATA', 3],
    ],
    keeps: ['todo', 'a', 'b'],
  },
  {
    name: 'a caret in data, a brace outside a shape, then an unclosed icon',
    lines: ['kanban', '  todo', '    a@{ label: x^y }', '    b{c}', '    d', '    ::icon(x'],
    errors: [
      ['UNEXPECTED', 3],
      ['UNEXPECTED', 4],
      ['UNCLOSED_ICON', 6],
    ],
    keeps: ['todo', 'a', 'b', 'd'],
  },
];

// Token names: jison terminals and v13 kind names that are compounds (`NodeDStart`).
const BANNED = new RegExp(
  `\\b(?:${[
    ...Object.values(JISON_NAMES).filter((n) => /_|^[A-Z]{2,}$/.test(n)),
    ...Object.keys(T).filter((n) => /^[A-Z][a-z]+[A-Z]/.test(n)),
    'mindMap',
    'nodeWithId',
    'nodeWithoutId',
    'spaceLines',
    'shapeData',
  ].join('|')})\\b`
);

describe('kanban recovery', () => {
  it.each(CASES)('$name', ({ lines, errors, keeps }) => {
    const src = lines.join('\n');
    const r = parseKanban(src);
    const index = new LineIndex(src);
    const got = r.diagnostics
      .filter((d) => d.severity === 'error')
      .map((d): [string, number] => [d.code, index.position(d.range.start).line + 1]);
    expect(got).toEqual(errors);
    for (const d of r.diagnostics) expect(d.message).not.toMatch(BANNED);
    const ids = r.model.items.map((n) => n.id.trim());
    for (const k of keeps ?? []) expect(ids).toContain(k);
  });
});
