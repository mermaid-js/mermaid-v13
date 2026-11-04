import { describe, expect, it } from 'vitest';
import { LineIndex } from '@mermaid-js/core/parser-kit';
import { parseClass } from '../index.ts';

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
  /** Classes that must still be in the model. */
  keeps?: string[];
}

const CASES: Case[] = [
  {
    name: 'two bad arrows',
    lines: ['classDiagram', 'A -> B', 'C --> D', 'E => F', 'G --> H'],
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED', 4],
    ],
    keeps: ['C', 'D', 'G', 'H'],
  },
  {
    name: 'dangling relationships',
    lines: ['classDiagram', 'A -->', 'B <|-- C', 'D --', 'E *-- F'],
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED', 4],
    ],
    keeps: ['B', 'C', 'E', 'F'],
  },
  {
    name: 'two statements on a line, twice',
    lines: ['classDiagram', 'class A note "x"', 'C --> D', 'class E callback F', 'F --> G'],
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED', 4],
    ],
    keeps: ['A', 'C', 'D', 'E', 'F', 'G'],
  },
  {
    name: 'unknown characters',
    lines: ['classDiagram', 'A ; B', 'C --> D', 'E @ F', 'class G'],
    errors: [
      ['UNEXPECTED_CHARACTER', 2],
      ['UNEXPECTED_CHARACTER', 4],
    ],
    keeps: ['C', 'D', 'G'],
  },
  {
    name: 'bad class labels',
    lines: ['classDiagram', 'class A[label]', 'class B', 'class C["x"', 'class D'],
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED', 4],
    ],
    keeps: ['A', 'B', 'C', 'D'],
  },
  {
    name: 'bad annotations',
    lines: ['classDiagram', 'class A <<>>', 'class B', 'class C <<two words>>', 'class D'],
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED', 4],
    ],
    keeps: ['A', 'B', 'C', 'D'],
  },
  {
    name: 'annotations for unknown classes',
    lines: ['classDiagram', '<<interface>> A', 'class B', '<<service>> C', 'class D'],
    errors: [
      ['UNKNOWN_CLASS', 2],
      ['UNKNOWN_CLASS', 4],
    ],
    keeps: ['B', 'D'],
  },
  {
    name: 'methods v12 could not read',
    lines: ['classDiagram', 'A : foo)', 'class B {', '  bar)', '  +ok()', '}', 'C --> D'],
    errors: [
      ['INVALID_METHOD', 2],
      ['INVALID_METHOD', 4],
    ],
    keeps: ['A', 'B', 'C', 'D'],
  },
  {
    name: 'braces inside a class body',
    lines: ['classDiagram', 'class A {', '  +x', '  {', '  +y', '  {', '}', 'B --> C'],
    errors: [
      ['UNEXPECTED', 4],
      ['UNEXPECTED', 6],
    ],
    keeps: ['A', 'B', 'C'],
  },
  {
    name: 'empty namespaces',
    lines: ['classDiagram', 'namespace N {', '}', 'class A', 'namespace M {}', 'class B'],
    errors: [
      ['UNEXPECTED', 3],
      ['UNEXPECTED', 5],
    ],
    keeps: ['A', 'B'],
  },
  {
    name: 'relationships inside namespaces',
    lines: [
      'classDiagram',
      'namespace N {',
      '  class A',
      '  A --> B',
      '  class C',
      '  C --> D',
      '}',
      'class E',
    ],
    errors: [
      ['UNEXPECTED', 4],
      ['UNEXPECTED', 6],
    ],
    keeps: ['A', 'C', 'E'],
  },
  {
    name: 'namespace without a name, then one without a brace',
    lines: ['classDiagram', 'namespace {', '  class A', '}', 'namespace N', 'class B'],
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED', 5],
    ],
    keeps: ['A', 'B'],
  },
  {
    name: 'unclosed string, then a bad arrow',
    lines: ['classDiagram', 'A "1 --> B', 'C --> D', 'E -> F', 'G --> H'],
    errors: [
      ['UNCLOSED_STRING', 2],
      ['UNEXPECTED', 4],
    ],
    keeps: ['C', 'D', 'G', 'H'],
  },
  {
    name: 'unclosed generic type, then an unknown character',
    lines: ['classDiagram', 'class A~T', 'class B', 'C ; D', 'class E'],
    errors: [
      ['UNCLOSED', 2],
      ['UNEXPECTED_CHARACTER', 4],
    ],
    keeps: ['B', 'E'],
  },
  {
    name: 'bad notes',
    lines: ['classDiagram', 'note x', 'class A', 'note for A', 'class B'],
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED', 4],
    ],
    keeps: ['A', 'B'],
  },
  {
    name: 'bad clicks',
    lines: ['classDiagram', 'class A', 'click A', 'link A url', 'callback A', 'class B'],
    errors: [
      ['UNEXPECTED', 3],
      ['UNEXPECTED', 4],
      ['UNEXPECTED', 5],
    ],
    keeps: ['A', 'B'],
  },
  {
    name: 'bad styles',
    lines: ['classDiagram', 'class A', 'style A', 'classDef x', 'cssClass A x', 'class B'],
    errors: [
      ['UNEXPECTED', 3],
      ['UNEXPECTED', 4],
      ['UNEXPECTED', 5],
    ],
    keeps: ['A', 'B'],
  },
  {
    name: 'css class shorthand without a name, and a body after it left empty',
    lines: ['classDiagram', 'class A:::', 'class B', 'class C:::x {', '}', 'class D'],
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED', 5],
    ],
    keeps: ['A', 'B', 'C', 'D'],
  },
  {
    name: 'bad accessibility lines and a stray arrow',
    lines: ['classDiagram', '--> A', 'accTitle: ok', '<|-- B', 'class C'],
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED', 4],
    ],
    keeps: ['C'],
  },
  {
    name: 'errors inside two namespaces',
    lines: [
      'classDiagram',
      'namespace N {',
      '  class A[x]',
      '}',
      'namespace M {',
      '  note y',
      '}',
      'class B',
    ],
    errors: [
      ['UNEXPECTED', 3],
      ['UNEXPECTED', 6],
    ],
    keeps: ['A', 'B'],
  },
  {
    name: 'missing header',
    lines: ['A --> B', 'class C', 'D -> E'],
    errors: [
      ['UNEXPECTED', 1],
      ['UNEXPECTED', 3],
    ],
    keeps: ['C'],
  },
  {
    name: 'unclosed class body',
    lines: ['classDiagram', 'A -> B', 'class C {', '  +x'],
    errors: [
      ['UNEXPECTED', 2],
      ['UNCLOSED_BODY', 3],
    ],
    keeps: ['C'],
  },
  {
    name: 'unclosed namespace',
    lines: ['classDiagram', 'A -> B', 'namespace N {', '  class C'],
    errors: [
      ['UNEXPECTED', 2],
      ['UNCLOSED_NAMESPACE', 3],
    ],
    keeps: ['C'],
  },
];

describe('class recovery', () => {
  it.each(CASES)('$name', ({ lines, errors, keeps }) => {
    const src = lines.join('\n');
    const r = parseClass(src);
    const index = new LineIndex(src);
    const got = r.diagnostics
      .filter((d) => d.severity === 'error')
      .map((d) => [d.code, index.position(d.range.start).line + 1]);
    expect(got).toEqual(errors);
    const ids = r.model.classes.map((c) => c.id);
    for (const k of keeps ?? []) expect(ids).toContain(k);
  });

  it('has at least 20 cases', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(20);
  });
});
