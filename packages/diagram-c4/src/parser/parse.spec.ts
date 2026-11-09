import { describe, expect, it } from 'vitest';
import * as codes from '../codes.ts';
import { parseC4 } from './index.ts';
import type { C4StatementNode } from './ast.ts';

/**
 * The C4 parser on its own seam (spec #522 §Parser, T2): the model v12's DB built (values from
 * the oracle, mermaid\@12.2.0), D452/D453/D457's changes, D458's AST ids, symbols and spans.
 * Model parity over the whole corpus is `packages/conformance` (`c4/v13.ts`).
 */
const parse = (src: string) => parseC4(src);
const model = (src: string) => {
  const r = parseC4(src);
  expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return r.model;
};
const codesOf = (src: string) => parseC4(src).diagnostics.map((d) => [d.severity, d.code]);
const ids = (nodes: readonly C4StatementNode[]): unknown[] =>
  nodes.map((n) => (n.type === 'Boundary' ? [n.id, ids(n.children)] : n.id));

describe('the model, as v12 built it', () => {
  it('keeps the slots of each macro: persons and systems, containers and components', () => {
    const m = model(
      'C4Container\nPerson(p, "P", "d", "spr", "tg", "lk", "extra")\nContainerDb_Ext(c, "C", "Java", "d")'
    );
    expect(m.elements).toEqual([
      expect.objectContaining({
        alias: 'p',
        kind: 'person',
        label: 'P',
        descr: 'd',
        sprite: 'spr',
        tags: 'tg',
        link: 'lk',
        parent: -1,
      }),
      expect.objectContaining({
        alias: 'c',
        kind: 'external_container_db',
        techn: 'Java',
        descr: 'd',
      }),
    ]);
  });

  it('merges a repeated alias into the first: kind and label replaced, descr kept', () => {
    const m = model('C4Context\nPerson(a, "A", "first")\nSystem(a, "A2")');
    expect(m.elements).toEqual([
      {
        ast: 'element:a',
        alias: 'a',
        kind: 'system',
        label: 'A2',
        descr: 'first',
        parent: -1,
        extra: [],
      },
    ]);
    // A named argument sets the field it names; techn kept.
    const c = model('C4Container\nContainer(c, "C", "Java", "d")\nContainer(c, "C2", $descr="x")');
    expect(c.elements[0]).toMatchObject({ label: 'C2', techn: 'Java', descr: 'x' });
  });

  it('merges a repeated relation: kind and label replaced, techn kept', () => {
    const m = model(
      'C4Context\nPerson(a, "A")\nPerson(b, "B")\nRel(a, b, "x", "T")\nRel_Back(a, b, "y")'
    );
    expect(m.relations).toEqual([
      {
        ast: 'rel:a->b',
        kind: 'rel_b',
        from: 'a',
        to: 'b',
        label: 'y',
        techn: 'T',
        descr: '',
        extra: [],
      },
    ]);
  });

  it('leaves a field out when a named argument took its slot (v12 set no default there)', () => {
    const m = model('C4Context\nPerson(a, "A", $sprite="s")\nRel(a, a, "x", $offsetX="3")');
    expect(m.elements[0]).not.toHaveProperty('descr');
    expect(m.elements[0]).toMatchObject({ sprite: 's' });
    expect(m.relations[0]).not.toHaveProperty('techn');
    expect(m.relations[0]).toMatchObject({ offsetX: 3, descr: '' });
  });

  it('keeps names v12 has no use for in `extra`, the last value of each', () => {
    const m = model('C4Context\nPerson(a, "A", $tags="t", $k="v", $k="w")');
    expect(m.elements[0]).toMatchObject({ tags: 't', extra: [{ name: 'k', value: 'w' }] });
  });

  it("splices a named boundary's type in as its third argument", () => {
    const m = model(
      'C4Context\nEnterprise_Boundary(e, "E", "mytype", "lnk") {\nPerson(a, "A")\n}\nBoundary(b, "B") {\nPerson(c, "C")\n}'
    );
    expect(m.boundaries).toEqual([
      {
        ast: 'boundary:e',
        alias: 'e',
        label: 'E',
        type: 'ENTERPRISE',
        tags: 'mytype',
        link: 'lnk',
        parent: -1,
        extra: [],
      },
      { ast: 'boundary:b', alias: 'b', label: 'B', type: 'system', parent: -1, extra: [] },
    ]);
    expect(m.elements.map((e) => e.parent)).toEqual([0, 1]);
  });

  it('drops what lands in a deployment node’s sprite slot, and nests nodes', () => {
    const m = model(
      'C4Deployment\nNode(n, "N", "t", "d", "spr", "tg", "lk") {\nNode_L(m, "M", $sprite="s") {\nPerson(a, "A")\n}\n}'
    );
    expect(m.boundaries).toEqual([
      expect.objectContaining({
        alias: 'n',
        type: 't',
        descr: 'd',
        tags: 'tg',
        link: 'lk',
        nodeKind: 'node',
        parent: -1,
      }),
      // The named sprite is in the type slot, which sets the field it names.
      expect.objectContaining({ alias: 'm', sprite: 's', descr: '', nodeKind: 'nodeL', parent: 0 }),
    ]);
    expect(m.boundaries[0]).not.toHaveProperty('sprite');
    expect(m.elements[0]?.parent).toBe(1);
  });

  it('reads RelIndex without its index, as a plain relation', () => {
    const m = model('C4Dynamic\nPerson(a, "A")\nPerson(b, "B")\nRelIndex(1, a, b, "uses", "HTTP")');
    expect(m.relations[0]).toMatchObject({
      kind: 'rel',
      from: 'a',
      to: 'b',
      label: 'uses',
      techn: 'HTTP',
    });
  });

  it('drops a relation without its first three arguments, as v12', () => {
    const r = parse('C4Context\nPerson(a, "A")\nRel(a, "b")');
    expect(r.model.relations).toEqual([]);
    expect(r.diagnostics).toEqual([]);
  });

  it('applies UpdateElementStyle by slot and by name, to an element or else a boundary', () => {
    const m = model(
      'C4Context\nPerson(a, "A")\nUpdateElementStyle(a, $fontColor="red", "grey", $foo="bar", "no", "queue", "spr", "T", "lt", "ls")\nBoundary(b, "B") {\nPerson(x, "X")\n}\nUpdateElementStyle(b, "#fff")\nUpdateElementStyle(nobody, "#000")'
    );
    expect(m.elements[0]).toMatchObject({
      fontColor: 'grey',
      shadowing: 'no',
      shape: 'queue',
      sprite: 'spr',
      techn: 'T',
      legendText: 'lt',
      legendSprite: 'ls',
      extra: [{ name: 'foo', value: 'bar' }],
    });
    expect(m.elements[0]).not.toHaveProperty('bgColor');
    expect(m.boundaries[0]).toMatchObject({ bgColor: '#fff' });
  });

  it('reads UpdateRelStyle offsets as integers, whatever name is in their slot', () => {
    const m = model(
      'C4Context\nPerson(a, "A")\nPerson(b, "B")\nRel(a, b, "x")\nUpdateRelStyle(a, b, $offsetX="5", "red", $textColor="blue", "7px")'
    );
    expect(m.relations[0]).toMatchObject({
      offsetX: 5,
      lineColor: 'red',
      textColor: 'NaN',
      offsetY: 7,
    });
  });

  it('reads UpdateLayoutConfig by position, keeping integer prefixes of at least 1', () => {
    expect(
      model('C4Context\nUpdateLayoutConfig($c4BoundaryInRow="3", "2abc")\nPerson(a, "A")')
    ).toMatchObject({
      shapeInRow: 3,
      boundaryInRow: 2,
    });
    const m = model('C4Context\nUpdateLayoutConfig("0", "x")\nPerson(a, "A")');
    expect(m).not.toHaveProperty('shapeInRow');
    expect(m).not.toHaveProperty('boundaryInRow');
  });

  it('keeps v12’s parent cycle when a boundary is reopened inside itself', () => {
    const m = model(
      'C4Context\nBoundary(a, "A") {\nBoundary(b, "B") {\nBoundary(a, "A2") {\nPerson(p, "P")\n}\n}\n}'
    );
    expect(m.boundaries.map((b) => [b.alias, b.label, b.parent])).toEqual([
      ['a', 'A2', 1],
      ['b', 'B', 0],
    ]);
  });

  it('keeps entities as `&…;` and line-break tags as written', () => {
    const m = model('C4Context\nPerson(a, "A #amp; B", "x<br>y")\ntitle T #35; x');
    expect(m.elements[0]).toMatchObject({ label: 'A &amp; B', descr: 'x<br>y' });
    expect(m.title).toBe('T &#35; x');
  });

  it('takes an element right after `accDescr { … }` on its line, and `}` right after a statement', () => {
    const m = model('C4Context\naccDescr{x}Person(a, "A")\nBoundary(b, "B") {\nPerson(c, "C")}');
    expect(m.accDescr).toBe('x');
    expect(m.elements.map((e) => e.alias)).toEqual(['a', 'c']);
  });

  it('is plain data (JSON round-trips it)', () => {
    const m = model('C4Context\nPerson(a, "A", $k="v")\nRel(a, a, "x")');
    expect(JSON.parse(JSON.stringify(m))).toEqual(m);
  });
});

describe('names for the structure, as v12 took them', () => {
  it('renames an element from a named alias, so later statements find it by the new one', () => {
    const m = model(
      'C4Context\nPerson(a, "A", $alias="q")\nPerson(b, "B")\nRel(q, b, "x")\nPerson(q, "Q2")'
    );
    expect(m.elements.map((e) => [e.ast, e.alias, e.label])).toEqual([
      ['element:a', 'q', 'Q2'],
      ['element:b', 'b', 'B'],
    ]);
  });

  it("sets a relation's kind and ends from `$type`, `$from` and `$to`", () => {
    const m = model(
      'C4Context\nPerson(a, "A")\nPerson(b, "B")\nRel(a, a, "x", $type="zz")\nRel(a, b, "y", $from="b")\nUpdateRelStyle(b, b, $type="birel")'
    );
    expect(m.relations.map((r) => [r.kind, r.from, r.to])).toEqual([
      ['zz', 'a', 'a'],
      ['birel', 'b', 'b'],
    ]);
  });

  it('moves an element with `UpdateElementStyle`’s `$parentBoundary`, and changes its kind', () => {
    const m = model(
      'C4Context\nBoundary(b, "B") {\nPerson(a, "A")\n}\nPerson(c, "C")\nUpdateElementStyle(c, $parentBoundary="b", $typeC4Shape="system_db")'
    );
    expect(m.elements[1]).toMatchObject({ parent: 0, kind: 'system_db' });
    // In a macro v12 set them again after the arguments: nothing changes.
    const p = model('C4Context\nPerson(a, "A", $parentBoundary="zz", $typeC4Shape="zz")');
    expect(p.elements[0]).toMatchObject({ parent: -1, kind: 'person', extra: [] });
  });

  it('keeps the structure where v12 broke it, with one warning each', () => {
    const r = parse(
      'C4Context\nPerson(c, "C")\nUpdateElementStyle(c, $parentBoundary="nowhere")\nUpdateElementStyle(c, $typeC4Shape="robot")\nBoundary(b, "B", $alias="q") {\nPerson(a, "A")\n}'
    );
    expect(r.model.elements.map((e) => [e.alias, e.kind, e.parent])).toEqual([
      ['c', 'person', -1],
      ['a', 'person', 0],
    ]);
    expect(r.model.boundaries[0]?.alias).toBe('q');
    expect(r.diagnostics.map((d) => [d.severity, d.code])).toEqual([
      ['warning', codes.C4_STRUCTURE_KEPT],
      ['warning', codes.C4_STRUCTURE_KEPT],
      ['warning', codes.C4_STRUCTURE_KEPT],
    ]);
  });
});

describe('D452: parse quirks that damaged the model', () => {
  it('stops an unquoted argument at `)` and at the line end', () => {
    expect(
      model('C4Context\nPerson(a)\nPerson(b, B)').elements.map((e) => [e.alias, e.label])
    ).toEqual([
      ['a', ''],
      ['b', 'B'],
    ]);
    expect(codesOf('C4Context\nPerson(a, b\nPerson(c, "C")')).toEqual([
      ['error', 'UNCLOSED_ARGUMENTS'],
    ]);
  });

  it('keeps the line break after a `%%` comment', () => {
    expect(
      model('C4Context\nPerson(a, "A") %% c\nPerson(b, "B")\n%%\nPerson(c, "C")').elements
    ).toHaveLength(3);
  });

  it('reads a lone `title` as an empty title', () => {
    const m = model('C4Context\ntitle\nPerson(a, "A")');
    expect(m.title).toBe('');
    expect(m.elements).toHaveLength(1);
  });

  it('reports `direction` lines and `$__proto__` instead of crashing (D452)', () => {
    expect(codesOf('C4Context\ndirection TB\nPerson(a, "A")')).toEqual([
      ['error', codes.C4_DIRECTION],
    ]);
    expect(codesOf('C4Context\nPerson(a, "the direction LR is")')).toEqual([
      ['error', codes.C4_DIRECTION],
    ]);
    // A warning: Pele keeps it as an unknown name, with no error.
    const r = parse('C4Context\nPerson(a, "A", $__proto__="x")');
    expect(r.diagnostics.map((d) => [d.severity, d.code])).toEqual([
      ['warning', codes.C4_NAME_RESERVED],
    ]);
    expect(r.model.elements[0]?.extra).toEqual([{ name: '__proto__', value: 'x' }]);
    expect(Object.getPrototypeOf(r.model.elements[0])).toBe(Object.prototype);
  });

  it('applies a named argument in the alias or label slot to the field it names, with a warning', () => {
    const r = parse('C4Context\nPerson($descr="D", $label="L")\nRel(a, $tags="t", "x")');
    expect(r.model.elements[0]).toMatchObject({ alias: '', label: 'L', descr: 'D' });
    expect(r.diagnostics.map((d) => [d.code, r.model.warnings.includes(d)])).toEqual([
      [codes.C4_NAMED_ARGUMENT_MOVED, true],
      [codes.C4_NAMED_ARGUMENT_MOVED, true],
      // The relation's end is now empty, which no element has as its alias (in source order:
      // the relation's start, then the argument).
      [codes.C4_UNKNOWN_END, false],
      [codes.C4_NAMED_ARGUMENT_MOVED, true],
    ]);
    const label = parse('C4Context\nPerson(a, $sprite="users")');
    expect(label.model.elements[0]).toMatchObject({ label: '', sprite: 'users' });
    expect(label.model.warnings.map((w) => w.code)).toEqual([codes.C4_NAMED_ARGUMENT_MOVED]);
  });

  it('keeps the empty argument a blank after a quote makes', () => {
    expect(model('C4Context\nPerson(a, "A" , "D")').elements[0]).toMatchObject({
      descr: '',
      sprite: 'D',
    });
  });
});

describe('D453: titles', () => {
  it('trims the in-text title; the last one wins', () => {
    expect(model('C4Context\ntitle  X  \ntitle  Y \nPerson(a, "A")').title).toBe('Y');
  });

  it('sets only the accessible title from `accTitle:`', () => {
    const m = model('C4Context\naccTitle: T\nPerson(a, "A")');
    expect(m.accTitle).toBe('T');
    expect(m).not.toHaveProperty('title');
  });

  it('takes the front-matter title when the text has none', () => {
    expect(model('---\ntitle: FM\n---\nC4Context\nPerson(a, "A")').title).toBe('FM');
    expect(model('---\ntitle: FM\n---\nC4Context\ntitle In text\nPerson(a, "A")').title).toBe(
      'In text'
    );
  });

  it('reads the accessible description of each parse on its own', () => {
    expect(model('C4Context\naccDescr {\n  one\n  two\n}\nPerson(a, "A")').accDescr).toBe(
      'one\ntwo'
    );
    expect(model('C4Context\naccDescription D\nPerson(a, "A")').accDescr).toBe('D');
    expect(model('C4Context\nPerson(a, "A")').accDescr).toBe('');
  });
});

describe('D457: degenerate input', () => {
  it('counts an offset that is not a number as 0, with a warning', () => {
    const r = parse(
      'C4Context\nPerson(a, "A")\nRel(a, a, "x", $offsetX="left")\nUpdateRelStyle(a, a, "red", "blue", "3", "abc")'
    );
    expect(r.model.relations[0]).toMatchObject({ offsetX: 3, offsetY: 0 });
    expect(r.model.warnings.map((w) => w.code)).toEqual([
      codes.C4_OFFSET_INVALID,
      codes.C4_OFFSET_INVALID,
    ]);
  });

  it('reports a relation to an unknown alias with v12’s message, at parse', () => {
    const r = parse('C4Context\nPerson(a, "A")\nRel(a, nobody, "x")\nRel(a, nobody, "y")');
    expect(r.diagnostics.map((d) => [d.code, d.message, r.model.relations.length])).toEqual([
      [codes.C4_UNKNOWN_END, 'C4 rel "a" -> "nobody" references an unknown shape or boundary', 1],
    ]);
    // A boundary end, and an alias defined further down, are known.
    expect(codesOf('C4Context\nRel(a, b, "x")\nBoundary(b, "B") {\nPerson(a, "A")\n}')).toEqual([]);
  });
});

describe('D458: AST ids, symbols and statements', () => {
  const src = [
    'C4Context',
    'title T',
    'Person(a, "A")',
    'Person(a, "A again")',
    'Boundary(b, "B") {',
    '  System(s, "S")',
    '  Rel(a, s, "x")',
    '}',
    'Rel(a, s, "y")',
    'Rel(a, "dropped")',
    'UpdateElementStyle(a, "red")',
    'UpdateRelStyle(a, s, "blue")',
    'UpdateLayoutConfig("2")',
    'Person(x@y>z, "X")',
  ].join('\n');

  it('names each statement: repeats get @k, styles by order, aliases escaped', () => {
    const r = parse(src);
    expect(ids(r.ast.children)).toEqual([
      'element:a',
      'element:a@2',
      ['boundary:b', ['element:s', 'rel:a->s']],
      'rel:a->s@2',
      'style:1',
      'style:2',
      'style:3',
      'element:x%40y%3Ez',
    ]);
    expect(r.model.elements.map((e) => e.ast)).toEqual([
      'element:a',
      'element:s',
      'element:x%40y%3Ez',
    ]);
    expect(r.model.relations.map((x) => x.ast)).toEqual(['rel:a->s']);
  });

  it('defines aliases at their first statement and refers to them after, per namespace', () => {
    const text =
      'C4Context\nPerson(a, "A")\nPerson(a, "A2")\nBoundary(a, "B") {\nRel(a, a, "x")\n}\nUpdateElementStyle(a, "red")';
    const r = parse(text);
    expect(
      r.symbols.map((s) => [s.kind, s.role, text.slice(s.range.start, s.range.end), s.range.start])
    ).toEqual([
      ['element', 'def', 'a', 17],
      ['element', 'ref', 'a', 32],
      ['boundary', 'def', 'a', 50],
      // References resolve shape first, as v12's lookup.
      ['element', 'ref', 'a', 64],
      ['element', 'ref', 'a', 67],
      ['element', 'ref', 'a', 96],
    ]);
  });

  it('gives boundaries a span over their statements', () => {
    const r = parse(src);
    const boundary = r.statements.find((s) => s.kind === 'boundary');
    expect(boundary?.children?.map((s) => s.kind)).toEqual(['element', 'relation']);
    expect(src.slice(boundary?.range.start, boundary?.range.end)).toMatch(/^Boundary\(b[\s\S]*\}$/);
  });
});
