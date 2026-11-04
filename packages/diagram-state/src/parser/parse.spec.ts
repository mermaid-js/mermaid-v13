import { describe, expect, it } from 'vitest';
import type { AstNode } from '@mermaid-js/core/parser-kit';
import { parseState } from '../index.ts';

const errors = (src: string) =>
  parseState(src)
    .diagnostics.filter((d) => d.severity === 'error')
    .map((d) => d.code);

describe('state parse', () => {
  it('builds states and transitions, with start and end scoped per composite', () => {
    const { model } = parseState(
      'stateDiagram-v2\n  [*] --> A\n  A --> B : go\n  state X {\n    [*] --> C\n    C --> [*]\n  }\n'
    );
    expect(model.states.map((s) => [s.id, s.kind, s.parent])).toEqual([
      ['root_start', 'start', undefined],
      ['A', 'plain', undefined],
      ['B', 'plain', undefined],
      ['X', 'composite', undefined],
      ['X_start', 'start', 'X'],
      ['C', 'plain', 'X'],
      ['X_end', 'end', 'X'],
    ]);
    expect(model.transitions.map((t) => [t.from, t.to, t.label])).toEqual([
      ['root_start', 'A', ''],
      ['A', 'B', 'go'],
      ['X_start', 'C', ''],
      ['C', 'X_end', ''],
    ]);
    expect(errors('stateDiagram-v2\n  A --> B\n')).toEqual([]);
  });
});

/** Every AST id with its type, depth first. */
function ids(src: string): string[] {
  const out: string[] = [];
  const walk = (n: AstNode) => {
    out.push(`${n.type} ${n.id}`);
    n.children?.forEach(walk);
  };
  parseState(src).ast.children.forEach(walk);
  return out;
}

describe('state AST ids (DESIGN §4.2, adapted)', () => {
  it('names states, scoped [*], transitions, composites, regions, notes and statements', () => {
    const src = [
      'stateDiagram-v2',
      '  [*] --> A',
      '  A --> B',
      '  A --> B : again',
      '  state X {',
      '    [*] --> C',
      '    --',
      '    C --> [*]',
      '  }',
      '  note left of A : hi',
      '  classDef hot fill:red',
      '  class A hot',
    ].join('\n');
    expect(ids(src)).toEqual([
      'Header st:1',
      'Transition e:[*]start>A',
      'State n:[*]start',
      'State n:A',
      'Transition e:A>B',
      'State n:A@2',
      'State n:B',
      'Transition e:A>B#2',
      'State n:A@3',
      'State n:B@2',
      'Composite s:X',
      'Region r:X#1',
      'Transition e:X/[*]start>C',
      'State n:X/[*]start',
      'State n:C',
      'Divider st:2',
      'Region r:X#2',
      'Transition e:C>X/[*]end',
      'State n:C@2',
      'State n:X/[*]end',
      'Note note:1',
      'State n:A@4',
      'ClassDef st:3',
      'Class st:4',
    ]);
  });

  it('keeps each AST id once, and the model points at them', () => {
    const src = 'stateDiagram-v2\n  state X {\n    A --> B\n    --\n    B --> A\n  }\n  X --> Y\n';
    const r = parseState(src);
    const all = ids(src).map((s) => s.split(' ')[1]);
    expect(new Set(all).size).toBe(all.length);
    const known = new Set(all);
    for (const s of r.model.states) expect(known, s.id).toContain(s.ast);
    for (const t of r.model.transitions) expect(known).toContain(t.ast);
    for (const g of r.model.regions) expect(known).toContain(g.ast);
    expect(r.model.states.find((s) => s.id === 'X')?.ast).toBe('s:X');
    expect(r.model.regions).toEqual([
      { id: 'X:region1', ast: 'r:X#1', parent: 'X' },
      { id: 'X:region2', ast: 'r:X#2', parent: 'X' },
    ]);
    expect(r.model.states.find((s) => s.id === 'A')?.parent).toBe('X:region2');
  });
});

describe('state model', () => {
  it('keeps notes, classes, styles, links, directions and accessibility fields', () => {
    const { model, diagnostics } = parseState(
      [
        'stateDiagram-v2',
        '  accTitle: Title',
        '  accDescr: Description',
        '  direction LR',
        '  state "Long name" as L',
        '  L : more',
        '  state f <<fork>>',
        '  state c <<choice>>',
        '  state j [[join]]',
        '  A --> f',
        '  note right of A',
        '    two',
        '    lines',
        '  end note',
        '  classDef hot fill:#f00,color:white',
        '  class A hot',
        '  style f stroke:blue',
        '  click A "https://example.com" "tip"',
        '  state X {',
        '    direction BT',
        '    Y',
        '  }',
      ].join('\n')
    );
    expect(diagnostics).toEqual([]);
    expect(model.direction).toBe('LR');
    expect([model.accTitle, model.accDescr]).toEqual(['Title', 'Description']);
    expect(model.states.map((s) => [s.id, s.kind, s.descriptions.join('|')])).toEqual([
      ['L', 'plain', 'Long name|more'],
      ['f', 'fork', ''],
      ['c', 'choice', ''],
      ['j', 'join', ''],
      ['A', 'plain', ''],
      ['X', 'composite', ''],
      ['Y', 'plain', ''],
    ]);
    expect(model.states.find((s) => s.id === 'A')?.classes).toEqual(['hot']);
    expect(model.states.find((s) => s.id === 'f')?.styles).toEqual(['stroke:blue']);
    expect(model.states.find((s) => s.id === 'X')?.dir).toBe('BT');
    expect(model.notes).toEqual([
      { ast: 'note:1', target: 'A', side: 'right', text: 'two\n    lines' },
    ]);
    expect(model.classes).toEqual([
      { id: 'hot', styles: ['fill:#f00', 'color:white'], textStyles: ['fill:white'] },
    ]);
    expect(model.links).toEqual([
      { ast: 'st:8', id: 'A', url: 'https://example.com', tooltip: 'tip' },
    ]);
  });

  it('warns where v12 silently draws nothing', () => {
    const codes = parseState(
      'stateDiagram-v2\n  state Lonely\n  note "floating" as N\n  state X {\n    A\n    --\n  }\n'
    ).diagnostics.map((d) => [d.severity, d.code]);
    expect(codes).toEqual([
      ['warning', 'FLOATING_NOTE'],
      ['warning', 'EMPTY_REGION'],
      ['warning', 'STATE_NOT_DRAWN'],
    ]);
  });

  it('drops a trailing empty region with one EMPTY_REGION warning per diagram (D115)', () => {
    const r = parseState(
      'stateDiagram-v2\n  state X {\n    A\n    --\n  }\n  state Y {\n    B\n    --\n  }\n'
    );
    expect(r.diagnostics.map((d) => d.code)).toEqual(['EMPTY_REGION']);
    expect(r.model.regions).toEqual([]);
    expect(r.model.states.map((s) => [s.id, s.parent])).toEqual([
      ['X', undefined],
      ['A', 'X'],
      ['Y', undefined],
      ['B', 'Y'],
    ]);
  });

  it('is plain data', () => {
    const { model } = parseState('stateDiagram-v2\n  [*] --> A\n  note left of A : n\n');
    expect(JSON.parse(JSON.stringify(model))).toEqual(model);
  });
});

describe('state symbols and statement spans', () => {
  it('records the symbols of a statement only when it parses', () => {
    const r = parseState('stateDiagram-v2\n  A -->\n  A --> B\n');
    expect(r.symbols.map((s) => [s.name, s.role])).toEqual([
      ['A', 'def'],
      ['B', 'def'],
    ]);
    expect(r.symbols[0]?.range.start).toBe('stateDiagram-v2\n  A -->\n  '.length);
  });

  it('records no span for a click statement that fails at its line end', () => {
    const r = parseState('stateDiagram-v2\n  A\n  click A "u" "t" B\n  C\n');
    expect(r.statements.map((s) => s.kind)).toEqual(['header', 'state', 'state']);
    expect(r.ast.children.map((n) => n.type)).toEqual(['Header', 'State', 'State']);
  });
});
