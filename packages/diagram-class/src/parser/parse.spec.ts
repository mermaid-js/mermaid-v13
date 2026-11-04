import { Kind } from '@mermaid-js/core/parser-kit';
import { describe, expect, it } from 'vitest';
import { namespaceGroups, parseClass } from '../index.ts';
import type { ClassStatementNode } from '../index.ts';
import { T } from './tokens.ts';

const NAMES = new Map<number, string>([
  [Kind.EOF, 'EOF'],
  [Kind.Newline, 'Newline'],
  ...Object.entries(T).map(([k, v]) => [v, k] as [number, string]),
]);

/** Every AST id in the document, depth first. */
function ids(nodes: readonly ClassStatementNode[], out: string[] = []): string[] {
  for (const n of nodes) {
    out.push(n.id);
    if ('children' in n && Array.isArray(n.children)) ids(n.children as ClassStatementNode[], out);
  }
  return out;
}

describe('class parse', () => {
  it('builds the model in insertion order', () => {
    const r = parseClass(`classDiagram
class Animal~T~ ["An animal"] {
  +String name
  +eat(food) bool$
}
Animal <|-- Duck : is a
Duck "1" *-- "many" Egg
note for Duck "quacks"
namespace Farm.Pond {
  class Duck
}
direction LR
accTitle: Animals`);
    expect(r.diagnostics).toEqual([]);
    const m = r.model;
    expect(m.classes.map((c) => c.id)).toEqual(['Animal', 'Duck', 'Egg']);
    const animal = m.classes[0]!;
    expect(animal).toMatchObject({ type: 'T', label: 'An animal', classes: ['default'] });
    expect(animal.attributes[0]).toMatchObject({
      visibility: '+',
      name: 'String name',
      ast: 'm:Animal#1',
    });
    expect(animal.methods[0]).toMatchObject({
      kind: 'method',
      name: 'eat',
      parameters: 'food',
      returnType: 'bool',
      classifier: '$',
      ast: 'm:Animal#2',
    });
    expect(m.relations[1]).toMatchObject({
      ast: 'e:Duck>Egg',
      start: { id: 'Duck', type: 'composition', multiplicity: '1' },
      end: { id: 'Egg', type: 'none', multiplicity: 'many' },
      line: 'solid',
    });
    expect(m.relations[0]?.label).toBe('is a');
    expect(m.notes[0]).toMatchObject({ id: 'note0', ast: 'note:1', class: 'Duck', text: 'quacks' });
    expect(m.namespaces.map((n) => [n.id, n.explicit, n.ast])).toEqual([
      ['Farm', false, undefined],
      ['Farm.Pond', true, 's:Farm.Pond'],
    ]);
    expect(m.classes[1]?.parent).toBe('Farm.Pond');
    expect(m.direction).toBe('LR');
    expect(m.accTitle).toBe('Animals');
  });

  it('gives semantic AST ids, unique across the document', () => {
    const r = parseClass(`classDiagram
class A
A --> B
A --> B
A : +x
style A fill:#f00
note "n"`);
    const all = ids(r.ast.children);
    expect(all).toEqual([
      'st:1',
      'n:A',
      'e:A>B',
      'n:A@2',
      'n:B',
      'e:A>B#2',
      'n:A@3',
      'n:B@2',
      'st:2',
      'n:A@4',
      'm:A#1',
      'st:3',
      'note:1',
    ]);
    expect(new Set(all).size).toBe(all.length);
    // A model entry keeps the id of the mention that made it.
    expect(r.model.classes.map((c) => c.ast)).toEqual(['n:A', 'n:B']);
  });

  it('gives a class `n:<id>` wherever it is made; interfaces and earlier mentions differ', () => {
    const r = parseClass('classDiagram\nnote for A "x"\nA ()-- B\nclass A\nA --> B');
    expect(ids(r.ast.children)).toEqual([
      'st:1',
      'note:1',
      'n:A@2',
      'e:A>B',
      'i:A',
      'n:B',
      'n:A',
      'e:A>B#2',
      'n:A@3',
      'n:B@2',
    ]);
    expect(r.model.classes.map((c) => [c.id, c.ast])).toEqual([
      ['B', 'n:B'],
      ['A', 'n:A'],
    ]);
    expect(r.model.interfaces[0]?.ast).toBe('i:A');
    expect(r.symbols.filter((s) => s.name === 'A').map((s) => [s.kind, s.role])).toEqual([
      ['class', 'ref'],
      ['interface', 'def'],
      ['class', 'def'],
      ['class', 'ref'],
    ]);
  });

  it('records callbacks for existing classes, with v12 argument lists', () => {
    const r = parseClass(
      'classDiagram\nclass A\nclick Z call foo()\nclick A call foo(  a , "b,c" )\ncallback A "f"\nclick A call h(")'
    );
    expect(r.model.callbacks.map((c) => [c.id, c.name, c.args])).toEqual([
      ['A', 'foo', ['a', 'b,c']],
      ['A', 'f', ['A']],
      ['A', 'h', ['']],
    ]);
    expect(parseClass('classDiagram\nclass A\nclick Z call foo()').diagnostics).toEqual([]);
  });

  it('gives each opening of a namespace its own id; the model keeps the first', () => {
    const r = parseClass('classDiagram\nnamespace N {\nclass A\n}\nnamespace N {\nclass B\n}');
    expect(r.ast.children.map((c) => c.id)).toEqual(['st:1', 's:N', 's:N@2']);
    expect(r.model.namespaces[0]).toMatchObject({ ast: 's:N', classes: ['A', 'B'] });
  });

  it('records symbols: a class is defined where it is made', () => {
    const r = parseClass(
      'classDiagram\nstyle A fill:#f00\nclass A:::hot\nA --> B\nclassDef hot fill:red'
    );
    expect(r.symbols.map((s) => [s.name, s.kind, s.role])).toEqual([
      ['A', 'class', 'ref'],
      ['A', 'class', 'def'],
      ['hot', 'cssClass', 'ref'],
      ['A', 'class', 'ref'],
      ['B', 'class', 'def'],
      ['hot', 'cssClass', 'def'],
    ]);
  });

  it('carries callbacks on the click AST node', () => {
    const r = parseClass('classDiagram\nclass A\nclick A call go(1) "tip"\nlink A "u" _self');
    const clicks = r.ast.children.filter((c) => c.type === 'Click');
    expect(clicks[0]).toMatchObject({
      callback: { targets: ['A'], name: 'go', args: '1' },
      tooltip: 'tip',
    });
    expect(clicks[1]).toMatchObject({ url: 'u', target: '_self' });
    expect(r.diagnostics.map((d) => d.code)).toEqual(['CALLBACK_IGNORED']);
    expect(
      parseClass('classDiagram\nclass A\ncallback A "f"', { claims: ['callbacks'] }).diagnostics
    ).toEqual([]);
  });

  it('lays out namespaces both ways (class.hierarchicalNamespaces)', () => {
    const { model } = parseClass('classDiagram\nnamespace A.B {\nclass C\n}');
    expect(namespaceGroups(model).groups).toEqual([
      { id: 'A', label: 'A' },
      { id: 'A.B', ast: 's:A.B', label: 'B', parent: 'A' },
    ]);
    const compact = namespaceGroups(model, false);
    expect(compact.groups).toEqual([{ id: 'A.B', ast: 's:A.B', label: 'A.B' }]);
    expect(compact.parentOf('A.B')).toBe('A.B');
  });

  it('keeps v12 accepting an empty class body and rejecting an empty diagram', () => {
    expect(parseClass('classDiagram\nclass A {\n}').diagnostics).toEqual([]);
    expect(parseClass('classDiagram').diagnostics.map((d) => d.code)).toEqual(['UNEXPECTED']);
  });
});

describe('class probe', () => {
  const probeAt = (marked: string) => {
    const offset = marked.indexOf('|');
    const src = marked.slice(0, offset) + marked.slice(offset + 1);
    const p = parseClass(src, { probe: offset }).probe;
    if (!p) throw new Error('no probe');
    return {
      expected: p.expected.map((k) => NAMES.get(k) ?? String(k)),
      mode: p.mode,
      prefix: src.slice(p.prefix.start, p.prefix.end),
    };
  };

  it('offers statements at a line start', () => {
    const p = probeAt('classDiagram\n|');
    expect(p.expected).toEqual(expect.arrayContaining(['Class', 'Namespace', 'Note', 'Alpha']));
  });

  it('offers relationships and members after a class name', () => {
    const p = probeAt('classDiagram\nA |\nB');
    expect(p.expected).toEqual(expect.arrayContaining(['Line', 'Extension', 'Label', 'Str']));
  });

  it('gives the word typed so far', () => {
    expect(probeAt('classDiagram\nclass Fo|').prefix).toBe('Fo');
  });

  it('names the lexer mode inside a class body', () => {
    expect(probeAt('classDiagram\nclass A {\n  +x|\n}').mode).toBe('class-body');
  });

  it('is outside code in a comment', () => {
    const p = probeAt('classDiagram\n%% a |comment\nclass A');
    expect(p).toMatchObject({ expected: [], mode: 'comment' });
  });
});
