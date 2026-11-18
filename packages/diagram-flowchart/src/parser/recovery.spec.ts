import { describe, expect, it } from 'vitest';
import { LineIndex } from '@mermaid-js/core/parser-kit';
import { parseFlowchart } from '../index.ts';

/**
 * Recovery set (R-PARSE-4): documents with N independent errors give N error diagnostics,
 * each on the line where the error was planted, and the statements around them still reach
 * the model.
 */
interface Case {
  name: string;
  lines: string[];
  /** `[code, 1-based line]` of every expected error, in order. */
  errors: [string, number][];
  /** Vertices that must still be in the model. */
  keeps?: string[];
}

const CASES: Case[] = [
  {
    name: 'two bad arrows',
    lines: ['flowchart TD', 'A -> B', 'C --> D', 'E => F', 'G --> H'],
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED_CHARACTER', 4],
    ],
    keeps: ['C', 'D', 'G', 'H'],
  },
  {
    name: 'unclosed labels of each bracket kind',
    lines: ['flowchart TD', 'A[one', 'B --> C', 'D(two', 'E --> F'],
    errors: [
      ['UNCLOSED', 2],
      ['UNCLOSED', 4],
    ],
    keeps: ['B', 'C', 'E', 'F'],
  },
  {
    name: 'unclosed diamond and circle',
    lines: ['flowchart TD', 'A{x', 'B --> C', 'D((y', 'E --> F'],
    errors: [
      ['UNCLOSED', 2],
      ['UNCLOSED', 4],
    ],
    keeps: ['B', 'C', 'E', 'F'],
  },
  {
    name: 'unclosed edge label and node label',
    lines: ['flowchart TD', 'A -->|x B', 'C(open', 'D --> E'],
    errors: [
      ['UNCLOSED', 2],
      ['UNCLOSED', 3],
    ],
    keeps: ['D', 'E'],
  },
  {
    name: 'stray end and unclosed string',
    lines: ['flowchart TD', 'end', 'A["unclosed', 'B --> C'],
    errors: [
      ['UNEXPECTED_END', 2],
      ['UNCLOSED_STRING', 3],
    ],
  },
  {
    name: 'unknown direction then a dangling link',
    lines: ['graph XY', 'A-->B', 'C-->'],
    errors: [
      ['UNKNOWN_DIRECTION', 1],
      ['UNEXPECTED', 3],
    ],
    keeps: ['A', 'B'],
  },
  {
    name: 'two unknown shapes',
    lines: ['flowchart TD', 'A@{ shape: blob }', 'B@{ shape: Rect }', 'C --> D'],
    errors: [
      ['UNKNOWN_SHAPE', 2],
      ['UNKNOWN_SHAPE', 3],
    ],
    keeps: ['C', 'D'],
  },
  {
    name: 'style without styles and classDef without a name',
    lines: ['flowchart TD', 'A --> B', 'style A', 'classDef', 'C --> D'],
    errors: [
      ['UNEXPECTED', 3],
      ['UNEXPECTED', 4],
    ],
    keeps: ['C', 'D'],
  },
  {
    name: 'linkStyle out of range twice',
    lines: ['flowchart TD', 'A --> B', 'linkStyle 5 stroke:red', 'linkStyle 7 stroke:blue', 'C'],
    errors: [
      ['LINK_STYLE_INDEX', 3],
      ['LINK_STYLE_INDEX', 4],
    ],
    keeps: ['C'],
  },
  {
    name: 'brackets inside unquoted labels',
    lines: ['flowchart TD', 'A[a(b] --> C', 'D[c{d] --> E', 'F --> G'],
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED', 3],
    ],
    keeps: ['F', 'G'],
  },
  {
    name: 'bad YAML in shape data twice',
    lines: ['flowchart TD', 'A@{ shape: [rect }', 'B@{ label: "x" , , }', 'C'],
    errors: [
      ['SHAPE_DATA', 2],
      ['SHAPE_DATA', 3],
    ],
    keeps: ['C'],
  },
  {
    name: 'click without a target, twice',
    lines: ['flowchart TD', 'A --> B', 'click A', '', 'C --> D', 'click B', '', 'E'],
    errors: [
      ['UNEXPECTED', 4],
      ['UNEXPECTED', 7],
    ],
    keeps: ['C', 'D', 'E'],
  },
  {
    name: 'class without a class name',
    lines: ['flowchart TD', 'A --> B', 'class A', 'class B ', 'C --> D'],
    errors: [
      ['UNEXPECTED', 3],
      ['UNEXPECTED', 4],
    ],
    keeps: ['C', 'D'],
  },
  {
    name: 'errors inside a subgraph keep the subgraph',
    lines: ['flowchart TD', 'subgraph S', 'A -> B', 'C --> D', 'E => F', 'end', 'G'],
    errors: [
      ['UNEXPECTED', 3],
      ['UNEXPECTED_CHARACTER', 5],
    ],
    keeps: ['C', 'D', 'G'],
  },
  {
    name: 'missing end of nested subgraphs',
    lines: ['flowchart TD', 'subgraph one', 'subgraph two', 'A', 'B -> C'],
    errors: [
      ['UNEXPECTED', 5],
      ['UNCLOSED_SUBGRAPH', 3],
      ['UNCLOSED_SUBGRAPH', 2],
    ],
    keeps: ['A'],
  },
  {
    name: 'statements separated by semicolons',
    lines: ['flowchart TD', 'A -> B; C --> D; E => F; G'],
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED_CHARACTER', 2],
    ],
    keeps: ['C', 'D', 'G'],
  },
  {
    name: 'entities outside labels',
    lines: ['flowchart TD', 'A#quot; --> B', 'C --> D', 'E#35; --> F'],
    errors: [
      ['ENTITY_OUTSIDE_LABEL', 2],
      ['ENTITY_OUTSIDE_LABEL', 4],
    ],
    keeps: ['C', 'D'],
  },
  {
    // D621: blanks after shape data may lead to an edge id; an edge id has no brackets.
    name: 'edge ids with brackets between edge ids after shape data',
    lines: [
      'flowchart TD',
      'A e[1]@--> B',
      'C@{ shape: rect } e1@--> D',
      'E@{ shape: rect } ;',
      'F e|2|@--> G',
    ],
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED', 5],
    ],
    keeps: ['C', 'D', 'E'],
  },
  {
    name: 'a missing header',
    lines: ['hello', 'A --> B', 'C -> D'],
    errors: [
      ['UNEXPECTED', 1],
      ['UNEXPECTED', 3],
    ],
    keeps: ['A', 'B'],
  },
  {
    name: 'three bad lines in a row',
    lines: ['flowchart LR', 'A -> B', 'C -> D', 'E -> F', 'G --> H'],
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED', 3],
      ['UNEXPECTED', 4],
    ],
    keeps: ['G', 'H'],
  },
  {
    name: 'bad YAML then a missing separator in the same statement',
    lines: ['flowchart TD', 'A@{ shape: [rect } B', 'C --> D'],
    errors: [
      ['SHAPE_DATA', 2],
      ['UNEXPECTED', 2],
    ],
    keeps: ['C', 'D'],
  },
  {
    name: 'bad YAML on both nodes of an & group',
    lines: ['flowchart TD', 'A@{ shape: [rect } & B@{ x: , , }', 'C'],
    errors: [
      ['SHAPE_DATA', 2],
      ['SHAPE_DATA', 2],
    ],
    keeps: ['C'],
  },
  {
    name: 'linkStyle index then a stray character in the same statement',
    lines: [
      'flowchart TD',
      'A --> B',
      'linkStyle 5 stroke:red )',
      'linkStyle 6 interpolate basis stroke:red )',
      'C',
    ],
    errors: [
      ['LINK_STYLE_INDEX', 3],
      ['UNEXPECTED_CHARACTER', 3],
      ['LINK_STYLE_INDEX', 4],
      ['UNEXPECTED_CHARACTER', 4],
    ],
    keeps: ['C'],
  },
  {
    name: 'a mixed bag',
    lines: [
      'flowchart TD',
      'A[Start] --> B{Decide}',
      'B -->|yes C',
      'style D fill',
      'X --> Y',
      'linkStyle 9 stroke:red',
      'Z@{ shape: nope }',
    ],
    errors: [
      ['UNCLOSED', 3],
      ['LINK_STYLE_INDEX', 6],
      ['UNKNOWN_SHAPE', 7],
    ],
    keeps: ['A', 'B', 'D', 'X', 'Y'],
  },
];

describe('flowchart recovery (R-PARSE-4)', () => {
  it('has at least 20 multi-error documents', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(20);
  });

  it.each(CASES)('$name', ({ lines, errors, keeps }) => {
    const src = lines.join('\n');
    const r = parseFlowchart(src);
    const at = new LineIndex(src);
    const got = r.diagnostics
      .filter((d) => d.severity === 'error')
      .map((d) => [d.code, at.position(d.range.start).line + 1]);
    expect(got).toEqual(errors);
    const ids = r.model.vertices.map((v) => v.id);
    if (lines.includes('subgraph S')) expect(r.model.subgraphs.map((g) => g.id)).toEqual(['S']);
    for (const id of keeps ?? []) expect(ids).toContain(id);
  });
});
