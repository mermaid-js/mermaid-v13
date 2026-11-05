import { describe, expect, it } from 'vitest';
import type { AstNode } from '@mermaid-js/core/parser-kit';
import { parseQuadrant } from '../index.ts';

const H = 'quadrantChart\n';
const model = (src: string) => {
  const r = parseQuadrant(src);
  expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return r.model;
};
const ids = (src: string) => {
  const out: string[] = [];
  const walk = (n: AstNode) => {
    out.push(n.id);
    for (const c of n.children ?? []) walk(c);
  };
  for (const c of parseQuadrant(src).ast.children) walk(c);
  return out;
};

/** The parser seam (spec #289 T2): values convert as v12's `quadrantDb.ts` did. */
describe('quadrant parser: model', () => {
  it('trims labels and keeps the markdown flag of the first part', () => {
    const m = model(H + 'quadrant-1   Plan    \nquadrant-2 "`**b**`" tail\nquadrant-3 "a" b\n');
    expect(m.quadrants.map((q) => q && [q.ast, q.text, q.markdown])).toEqual([
      ['q:1', 'Plan', false],
      ['q:2', '**b** tail', true],
      ['q:3', 'a b', false],
      undefined,
    ]);
  });

  it('merges axis statements as v12 setData: each sets only the labels it names', () => {
    const m = model(H + 'x-axis A --> B\nx-axis C\ny-axis Low -->\n');
    expect(m.xAxis).toEqual({
      ast: 'ax:x',
      start: { text: 'C', markdown: false },
      end: { text: 'B', markdown: false },
    });
    expect(m.yAxis).toEqual({ ast: 'ax:y', start: { text: 'Low ⟶', markdown: false } });
  });

  it('lets the last quadrant-N, title, accTitle, accDescr and classDef win', () => {
    const src =
      H +
      'title one\ntitle two\naccTitle: a\naccTitle: b\naccDescr: c\naccDescr {\n  d\n    e\n}\n' +
      'quadrant-4 x\nquadrant-4 y\nclassDef k radius: 1\nclassDef j radius: 2\nclassDef k color: #f00\n';
    const m = model(src);
    expect([m.title, m.titleAst, m.accTitle, m.accDescr]).toEqual(['two', 'st:3', 'b', 'd\ne']);
    expect(m.quadrants[3]?.text).toBe('y');
    expect([...m.classes]).toEqual([
      ['k', { ast: 'c:k', styles: { color: '#f00' } }],
      ['j', { ast: 'c:j', styles: { radius: 2 } }],
    ]);
  });

  it('keeps points in source order, repeats too, with coordinates as written (D226)', () => {
    const m = model(H + 'A: [0.1, 0.2]\nB:::c: [1, 0]\nA: [0x5, 0a5]\n');
    expect(m.points.map((p) => [p.ast, p.label.text, p.className, p.x, p.y])).toEqual([
      ['pt:A', 'A', undefined, '0.1', '0.2'],
      ['pt:B', 'B', 'c', '1', '0'],
      ['pt:A@2', 'A', undefined, '0x5', '0a5'],
    ]);
  });

  it('converts styles as parseStyles: radius and stroke-width numbers, colours as written', () => {
    const m = model(
      H + 'P: [0.1, 0.2]   radius :10 ,color:abc ,  stroke-color :  #00ff00,stroke-width:  3px\n'
    );
    expect(m.points[0]?.styles).toEqual({
      radius: 10,
      color: 'abc',
      strokeColor: '#00ff00',
      strokeWidth: 3,
    });
    // Only the first two parts of a style count.
    expect(model(H + 'P: [0.1, 0.2] radius: 10: 3\n').points[0]?.styles).toEqual({ radius: 10 });
  });

  it('reads entities as `&name;` and takes the front-matter title only without a title', () => {
    const m = model(H + 'quadrant-1 a #amp; b\n');
    expect(m.quadrants[0]?.text).toBe('a &amp; b');
    const fm = '---\ntitle: Front\n---\n';
    expect(model(fm + H).title).toBe('Front');
    expect(model(fm + H).titleAst).toBeUndefined();
    expect(model(fm + H + 'title In text\n').title).toBe('In text');
    expect(model(fm + H + 'title\n').title).toBe('');
  });

  it('accepts what jison accepts: `;` separators, a header on a statement line, empty quotes', () => {
    expect(model('quadrantChart; quadrant-1 a; title t; b\n').title).toBe('t; b');
    expect(model('quadrantChart x-axis A --> B').xAxis?.end?.text).toBe('B');
    expect(
      model(H + 'quadrant-1 a""b\naccDescr {}quadrant-2 c').quadrants.map((q) => q?.text)
    ).toEqual(['ab', 'c', undefined, undefined]);
  });
});

describe('quadrant parser: AST, symbols and spans', () => {
  it('gives overridden statements st ids, in source order, and every node one id', () => {
    const src =
      H +
      'title T\nx-axis A --> B\nx-axis C\nquadrant-1 a\nquadrant-1 b\nP: [0.1, 0.1]\nP: [0.2, 0.2]\n' +
      'classDef c radius: 1\nclassDef c radius: 2\n';
    expect(ids(src)).toEqual([
      'st:1',
      'st:2',
      'st:3',
      'ax:x/end',
      'ax:x',
      'st:4',
      'q:1',
      'pt:P',
      'pt:P@2',
      'st:5',
      'c:c',
    ]);
  });

  it('percent-encodes names in ids', () => {
    expect(ids(H + 'a#b%c: [0.1, 0.1]\n')).toEqual(['st:1', 'pt:a%23b%25c']);
  });

  it('records class definitions and references as symbols', () => {
    const src = H + 'P:::hot: [0.1, 0.1]\nclassDef hot radius: 3\n';
    const r = parseQuadrant(src);
    expect(
      r.symbols.map((s) => [s.name, s.kind, s.role, src.slice(s.range.start, s.range.end)])
    ).toEqual([
      ['hot', 'class', 'ref', 'hot'],
      ['hot', 'class', 'def', 'hot'],
    ]);
    expect(r.statements.map((s) => s.kind)).toEqual(['header', 'point', 'classDef']);
  });

  it('records a class reference wherever `:::name` lexes, a failed statement too', () => {
    const src = H + 'P:::a: [0.1, 2]\nQ (x):::b: [0.1, 0.2]\n';
    const r = parseQuadrant(src);
    expect(r.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(2);
    expect(
      r.symbols.map((s) => `${s.name}:${s.role}:${src.slice(s.range.start, s.range.end)}`)
    ).toEqual(['a:ref:a', 'b:ref:b']);
    expect(r.statements.map((s) => s.kind)).toEqual(['header']);
  });

  it('makes only the last classDef of a name, the one the model keeps, its definition', () => {
    const src = H + 'classDef hot radius: 1\nP:::hot: [0.1, 0.1]\nclassDef hot radius: 2\n';
    const r = parseQuadrant(src);
    expect(r.symbols.map((s) => `${s.role}@${s.range.start}`)).toEqual([
      `ref@${src.indexOf('hot')}`,
      `ref@${src.indexOf(':::hot') + 3}`,
      `def@${src.lastIndexOf('hot')}`,
    ]);
    expect(r.model.classes.get('hot')?.ast).toBe('c:hot');
  });

  it('ranges cover quotes and `]`, not the blanks a keyword takes', () => {
    const src = H + '  quadrant-1 "a"  \n  P: [0.1, 0.2]  \n';
    const r = parseQuadrant(src);
    expect(r.ast.children.map((n) => src.slice(n.range.start, n.range.end))).toEqual([
      'quadrantChart',
      'quadrant-1 "a"',
      'P: [0.1, 0.2]',
    ]);
  });
});
