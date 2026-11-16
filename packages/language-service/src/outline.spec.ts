/**
 * The outline query (D580): `symbols()` lists each symbol once, at its definition (what
 * `definition` goes to), nested by the statements that hold the definitions (a subgraph, a
 * composite state, a namespace), and never throws (R-LANG-4).
 */
import { describe, expect, it } from 'vitest';
import { flowchartLanguage } from '@mermaid-js/diagram-flowchart/language';
import type { LanguageFacet } from '@mermaid-js/core/parser-kit';
import { createLanguageService } from './index.ts';
import type { DocumentSnapshot, DocumentSymbol } from './index.ts';

const service = createLanguageService();
const ready = service.preload();
const open = async (text: string): Promise<DocumentSnapshot> => {
  await ready;
  return service.update('file:///outline.mmd', text);
};

/** A symbol tree as `kind name 'range text'`, children indented below. */
function show(doc: DocumentSnapshot, symbols: readonly DocumentSymbol[], indent = ''): string[] {
  return symbols.flatMap((s) => {
    const slice = (r: { start: number; end: number }) => doc.text.slice(r.start, r.end);
    expect(slice(s.nameRange), `${s.name}'s name range`).toBe(s.name);
    return [
      `${indent}${s.kind} ${s.name} ${JSON.stringify(slice(s.range))}`,
      ...show(doc, s.children, `${indent}  `),
    ];
  });
}

describe('symbols()', () => {
  it('lists flowchart nodes, subgraphs and classes once, nested by subgraph', async () => {
    const doc = await open(
      [
        'flowchart LR',
        '  A --> B(End)',
        '  subgraph S1 [Group]',
        '    B --> C',
        '    subgraph S2',
        '      D',
        '    end',
        '  end',
        '  classDef hot fill:#f00',
        '  class A,B hot',
        '',
      ].join('\n')
    );
    expect(show(doc, doc.symbols())).toEqual([
      'node A "A --> B(End)"',
      'node B "A --> B(End)"',
      'subgraph S1 "subgraph S1 [Group]\\n    B --> C\\n    subgraph S2\\n      D\\n    end\\n  end"',
      '  node C "B --> C"',
      '  subgraph S2 "subgraph S2\\n      D\\n    end"',
      '    node D "D"',
      'class hot "classDef hot fill:#f00"',
    ]);
  });

  it('lists a subgraph at its block even when an edge named it first', async () => {
    const doc = await open('flowchart LR\n  A --> S\n  subgraph S\n    B\n  end\n');
    expect(show(doc, doc.symbols())).toEqual([
      'node A "A --> S"',
      'subgraph S "subgraph S\\n    B\\n  end"',
      '  node B "B"',
    ]);
  });

  it('nests states in their composite state', async () => {
    const doc = await open(
      'stateDiagram-v2\n  [*] --> Idle\n  state Busy {\n    A --> B\n  }\n  Idle --> Busy\n'
    );
    expect(show(doc, doc.symbols())).toEqual([
      'state Idle "[*] --> Idle"',
      'state Busy "state Busy {\\n    A --> B\\n  }"',
      '  state A "A --> B"',
      '  state B "A --> B"',
    ]);
  });

  it('marks a symbol that opens a block, even one that defines nothing new, and no other', async () => {
    const blocks = (list: readonly DocumentSymbol[]): string[] =>
      list.flatMap((s) => [...(s.block ? [s.name] : []), ...blocks(s.children)]);
    // S holds only B, defined before it: no children in the outline, but a block.
    const flow = await open('flowchart LR\n  A --> B\n  subgraph S\n    B\n  end\n');
    expect(flow.symbols().find((s) => s.name === 'S')?.children).toEqual([]);
    expect(blocks(flow.symbols())).toEqual(['S']);
    // A class body holds members, not statements: the class is no block; the namespace is.
    const cls = await open(
      'classDiagram\n  class Animal {\n    +int age\n  }\n  namespace N {\n    class Duck\n  }\n'
    );
    expect(blocks(cls.symbols())).toEqual(['N']);
    const st = await open('stateDiagram-v2\n  A --> B\n  state Busy {\n    A\n  }\n');
    expect(blocks(st.symbols())).toEqual(['Busy']);
  });

  it('is empty without a facet, and frozen', async () => {
    expect((await open('')).symbols()).toEqual([]);
    expect((await open('zenuml\n  A.method()\n')).symbols()).toEqual([]);
    const doc = await open('flowchart LR\n  subgraph S\n    B\n  end\n');
    const [s] = doc.symbols();
    expect(Object.isFrozen(doc.symbols())).toBe(true);
    expect(Object.isFrozen(s)).toBe(true);
    expect(Object.isFrozen(s?.children)).toBe(true);
    expect(Object.isFrozen(s?.range)).toBe(true);
    expect(doc.symbols()).toBe(doc.symbols());
  });

  it('never throws on a facet whose parse gives malformed statements', async () => {
    const parse: LanguageFacet['parse'] = (text, options) => ({
      ...flowchartLanguage.parse(text, options),
      statements: [
        { kind: 'odd', range: { start: 40, end: 2 } },
        { kind: 'odd', range: { start: 0, end: 99 }, children: null as never },
      ],
    });
    const odd = createLanguageService({
      facets: [
        {
          type: 'flowchart-v2',
          id: 'flowchart',
          detector: (t) => /^\s*flowchart/.test(t),
          facet: { ...flowchartLanguage, parse },
        },
      ],
    });
    await odd.preload();
    const doc = odd.update('file:///odd.mmd', 'flowchart LR\n  A --> B\n');
    expect(doc.symbols().map((s) => s.name)).toEqual(['A', 'B']);
  });
});
