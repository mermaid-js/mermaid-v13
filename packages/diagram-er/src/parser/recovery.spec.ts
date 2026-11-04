import { describe, expect, it } from 'vitest';
import { LineIndex } from '@mermaid-js/core/parser-kit';
import { parseEr } from '../index.ts';
import { JISON_NAMES } from './jison-names.ts';
import { T } from './tokens.ts';

/**
 * Recovery set (R-PARSE-4): documents with N independent errors give N error diagnostics,
 * each on the line where the error was planted, and the statements around them still reach
 * the model. No message names a token or a grammar rule (R-ERR-5).
 */
interface Case {
  name: string;
  lines: string[];
  /** `[code, 1-based line]` of every expected error, in order. */
  errors: [string, number][];
  /** Entities that must still be in the model. */
  keeps?: string[];
}

const CASES: Case[] = [
  {
    name: 'relationships without a label or a cardinality',
    lines: ['erDiagram', 'A ||--o{ B', 'C ||--o{ D : x', 'E ||-- F : y', 'G'],
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED', 4],
    ],
    keeps: ['C', 'D', 'G'],
  },
  {
    name: 'an attribute without a name, then an unclosed block',
    lines: ['erDiagram', 'A {', ' string', '}', 'B', 'C { int x', 'D'],
    errors: [
      ['UNEXPECTED', 4],
      ['UNCLOSED_BLOCK', 6],
    ],
    keeps: ['B'],
  },
  {
    name: 'style and classDef without styles or names',
    lines: ['erDiagram', 'A ||--o{ B : x', 'style A', 'style B fill:red', 'classDef', 'C'],
    errors: [
      ['UNEXPECTED', 3],
      ['UNEXPECTED', 5],
    ],
    keeps: ['A', 'B', 'C'],
  },
  {
    name: 'a subgraph without an id still closes at its end; a stray end',
    lines: ['erDiagram', 'subgraph', 'A', 'end', 'B ||..|{ C : y', 'end'],
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED_END', 6],
    ],
    keeps: ['A', 'B', 'C'],
  },
  {
    name: 'an unclosed title and an unclosed subgraph',
    lines: ['erDiagram', 'subgraph G [Title', 'A', 'end', 'subgraph H', 'B'],
    errors: [
      ['UNEXPECTED', 2],
      ['UNCLOSED_SUBGRAPH', 5],
    ],
    keeps: ['A', 'B'],
  },
  {
    name: 'characters that start no statement',
    lines: ['erDiagram', 'A ( B', 'C & D', 'E'],
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED', 3],
    ],
    keeps: ['A', 'C', 'E'],
  },
  {
    name: 'characters styles cannot hold',
    lines: ['erDiagram', 'style A fill:1.5px', 'classDef x stroke:(red)', 'B'],
    errors: [
      ['UNEXPECTED_CHARACTER', 2],
      ['UNEXPECTED_CHARACTER', 3],
    ],
    keeps: ['B'],
  },
  {
    name: 'unclosed aliases',
    lines: ['erDiagram', 'A [B', 'C[D]', 'E[F'],
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED', 4],
    ],
    keeps: ['C'],
  },
  {
    name: 'relationships missing an end',
    lines: ['erDiagram', 'A }|--|{ B : "x"', 'A ||--o{ : y', '||--o{ C : z', 'D'],
    errors: [
      ['UNEXPECTED', 3],
      ['UNEXPECTED', 4],
    ],
    keeps: ['A', 'B', 'D'],
  },
  {
    name: 'a stray `?` and a dangling key separator',
    lines: ['erDiagram', 'A { string? x ? }', 'B { int x PK, }', 'C'],
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED', 3],
    ],
    keeps: ['C'],
  },
  {
    name: '`:::` and `class` without a class',
    lines: ['erDiagram', 'A:::', 'B:::c', 'class A', 'D'],
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED', 4],
    ],
    keeps: ['B', 'D'],
  },
  {
    name: 'a second header and a subgraph without an id at the end',
    lines: ['erDiagram', 'erDiagram', 'A', 'subgraph'],
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED', 4],
    ],
    keeps: ['A'],
  },
  {
    name: 'a bad line in a relationship',
    lines: ['erDiagram', 'A ||--o{ B : x C ||- D : y', 'E ||--|| F : z', 'G }o-o{ H : w'],
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED', 4],
    ],
    keeps: ['A', 'B', 'E', 'F'],
  },
  {
    name: 'an unclosed description',
    lines: ['erDiagram', 'A', 'accDescr { abc', 'B'],
    errors: [['UNCLOSED_DESCRIPTION', 3]],
    keeps: ['A'],
  },
  {
    name: 'errors inside a subgraph',
    lines: ['erDiagram', 'subgraph G', 'A ||--o{ B', 'C', 'D {', 'int', '}', 'end', 'E'],
    errors: [
      ['UNEXPECTED', 3],
      ['UNEXPECTED', 7],
    ],
    keeps: ['C', 'E'],
  },
  {
    name: 'three mistakes',
    lines: ['erDiagram', 'A ||==o{ B : x', 'C', 'D[E', 'F ||--|| G : y', 'style F', 'H'],
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED', 4],
      ['UNEXPECTED', 6],
    ],
    keeps: ['C', 'F', 'G', 'H'],
  },
];

// Token names: jison terminals, and v13 kind names that are compounds (`EntityName`, …);
// plain words such as `end` or `style` are Mermaid syntax.
const RULES = [
  'entityName',
  'relSpec',
  'idList',
  'stylesOpt',
  'styleComponent',
  'attributeType',
  'attributeKeyTypeList',
  'subgraphHeader',
  'subgraphTitle',
  'classDefStatement',
  'styleStatement',
];
const TOKENS = [
  ...Object.values(JISON_NAMES).filter((n) => /_|[A-Z].*[A-Z]/.test(n)),
  ...Object.keys(T).filter((n) => /^[A-Z][a-z]+[A-Z]/.test(n)),
];
const BANNED = new RegExp(`\\b(?:${[...RULES, ...TOKENS].join('|')})\\b`);

describe('ER recovery set', () => {
  it.each(CASES)('$name', ({ lines, errors, keeps }) => {
    const src = lines.join('\n');
    const result = parseEr(src);
    const index = new LineIndex(src);
    const got = result.diagnostics
      .filter((d) => d.severity === 'error')
      .map((d): [string, number] => [d.code, index.position(d.range.start).line + 1]);
    expect(got).toEqual(errors);
    for (const d of result.diagnostics) expect(d.message).not.toMatch(BANNED);
    const names = result.model.entities.map((e) => e.name);
    for (const k of keeps ?? []) expect(names).toContain(k);
  });

  it('has at least 20 errors over the set (R-PARSE-4)', () => {
    expect(CASES.reduce((n, c) => n + c.errors.length, 0)).toBeGreaterThanOrEqual(20);
  });

  it('a clean document has no diagnostics', () => {
    const src = 'erDiagram\n  A ||--o{ B : x\n  A { string id PK }\n  subgraph G\n    B\n  end';
    expect(parseEr(src).diagnostics).toEqual([]);
  });
});
