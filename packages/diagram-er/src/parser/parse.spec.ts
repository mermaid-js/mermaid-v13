import { describe, expect, it } from 'vitest';
import { parseEr } from '../index.ts';

describe('parseEr', () => {
  it('reads a relationship with both cardinalities and its label', () => {
    const { model, diagnostics } = parseEr('erDiagram\n  CUSTOMER ||--o{ ORDER : places');
    expect(diagnostics).toEqual([]);
    expect(model.entities.map((e) => e.name)).toEqual(['CUSTOMER', 'ORDER']);
    expect(model.relationships).toEqual([
      {
        id: 'e:CUSTOMER>ORDER',
        from: { name: 'CUSTOMER', subgraph: false, cardinality: 'onlyOne' },
        to: { name: 'ORDER', subgraph: false, cardinality: 'zeroOrMore' },
        identifying: true,
        label: 'places',
      },
    ]);
  });
});

describe('AST ids', () => {
  const src = [
    'erDiagram',
    'A ||--o{ B : x',
    'A ||--o{ B : y',
    'A { string x\nint x PK }',
    'A { int y }',
    'subgraph G',
    '  C',
    'end',
    'subgraph G',
    '  D',
    'end',
    'style A fill:red',
    'classDef hot fill:#f96',
    'style B fill:blue',
    '"a.b" { int c }',
  ].join('\n');
  const { ast, model, diagnostics } = parseEr(src);
  const ids: string[] = [];
  const walk = (n: { id: string; children?: unknown[] }) => {
    ids.push(n.id);
    for (const c of (n.children ?? []) as (typeof n)[]) walk(c);
  };
  ast.children.forEach(walk);

  it('names entities, mentions, attributes, relationships and subgraphs', () => {
    expect(diagnostics).toEqual([]);
    expect(ids).toEqual([
      'header:1',
      'e:A>B',
      'n:A',
      'n:B',
      'e:A>B#2',
      'n:A@2',
      'n:B@2',
      'n:A@3',
      'a:A.x',
      'a:A.x#2',
      'n:A@4',
      'a:A.y',
      's:G',
      'n:C',
      's:G@2',
      'n:D',
      'style:1',
      'classDef:1',
      'style:2',
      'n:a.b',
      'a:a%2Eb.c',
    ]);
  });

  it('gives the model the ids of the AST', () => {
    const a = model.entities.find((e) => e.name === 'A');
    expect(a?.id).toBe('n:A');
    expect(a?.attributes.map((x) => x.id)).toEqual(['a:A.x', 'a:A.x#2', 'a:A.y']);
    expect(model.relationships.map((r) => r.id)).toEqual(['e:A>B', 'e:A>B#2']);
    expect(model.subgraphs.map((s) => [s.id, s.members])).toEqual([
      ['s:G', ['C']],
      ['s:G@2', ['D']],
    ]);
  });

  it('has no duplicate ids', () => {
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('the model', () => {
  it('reads cardinality words, identifying lines, aliases, keys and comments', () => {
    const { model } = parseEr(
      [
        'erDiagram',
        'PERSON only one optionally to zero or more CAR : drives',
        'p[Person] { string? name PK, fk "the name" }',
        'p u--1+ PERSON : is',
      ].join('\n')
    );
    expect(
      model.relationships.map((r) => [r.from.cardinality, r.identifying, r.to.cardinality])
    ).toEqual([
      ['onlyOne', false, 'zeroOrMore'],
      ['mdParent', true, 'oneOrMore'],
    ]);
    expect(model.entities.map((e) => [e.name, e.alias])).toEqual([
      ['PERSON', ''],
      ['CAR', ''],
      ['p', 'Person'],
    ]);
    expect(model.entities[2]?.attributes).toEqual([
      { id: 'a:p.name', type: 'string?', name: 'name', keys: ['PK', 'fk'], comment: 'the name' },
    ]);
  });

  it('applies classes and styles only to what exists at that point, as v12 did', () => {
    const { model } = parseEr(
      [
        'erDiagram',
        'style A fill:red',
        'class A hot',
        'A:::cool',
        'style A stroke:blue',
        'classDef hot color:red,fill:#f00',
      ].join('\n')
    );
    expect(model.entities).toEqual([
      {
        id: 'n:A',
        name: 'A',
        alias: '',
        attributes: [],
        classes: ['cool'],
        styles: ['stroke:blue'],
      },
    ]);
    expect(model.classes).toEqual([
      { name: 'hot', styles: ['color:red', 'fill:#f00'], textStyles: ['color:red'] },
    ]);
  });

  it('keeps subgraph members to entities and subgraphs, and a relationship end to a closed subgraph', () => {
    const { model } = parseEr(
      [
        'erDiagram',
        'subgraph G [Some title]',
        '  direction LR',
        '  classDef x fill:red',
        '  A',
        '  subgraph H',
        '    B',
        '  end',
        'end',
        'X ||--o{ G : r',
      ].join('\n')
    );
    expect(model.entities.map((e) => e.name)).toEqual(['A', 'B', 'X']);
    expect(model.subgraphs.map((s) => [s.name, s.title, s.members, s.direction])).toEqual([
      ['H', 'H', ['B'], undefined],
      ['G', 'Some title', ['A', 'H'], 'LR'],
    ]);
    expect(model.relationships[0]?.to).toEqual({
      name: 'G',
      subgraph: true,
      cardinality: 'zeroOrMore',
    });
    expect(model.direction).toBe('TB');
  });

  it('needs no separator between statements', () => {
    const { model, diagnostics } = parseEr('erDiagram\nA B ||--|| C : x D');
    expect(diagnostics).toEqual([]);
    expect(model.entities.map((e) => e.name)).toEqual(['A', 'B', 'C', 'D']);
  });
});

describe('probe mode', () => {
  it('records what may follow an entity name', () => {
    const src = 'erDiagram\n  A ';
    const { probe } = parseEr(src, { probe: src.length });
    expect(probe?.expected.length).toBeGreaterThan(0);
  });

  it('is outside code in a comment', () => {
    const src = 'erDiagram\n  %% note\n  A';
    const { probe } = parseEr(src, { probe: src.indexOf('note') + 2 });
    expect(probe).toMatchObject({ expected: [], mode: 'comment' });
  });
});
