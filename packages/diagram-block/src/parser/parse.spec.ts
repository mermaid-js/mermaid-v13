import { describe, expect, it } from 'vitest';
import {
  BLOCK_SIZE_INVALID,
  BLOCK_STYLE_UNKNOWN,
  BLOCK_TRUNCATED,
  MAX_SPACE_CELLS,
  MAX_SPAN,
  parseBlock,
} from '../index.ts';
import type { Block, BlockStatementNode } from '../index.ts';

const B = 'block\n';
const parse = (body: string) => parseBlock(B + body);
const errors = (body: string) =>
  parse(body)
    .diagnostics.filter((d) => d.severity === 'error')
    .map((d) => d.code);
/** The tree as `id` / `id{children}`. */
const tree = (blocks: readonly Block[]): string =>
  blocks.map((b) => b.id + (b.children.length > 0 ? `{${tree(b.children)}}` : '')).join(' ');
const byId = (blocks: readonly Block[], id: string): Block | undefined => {
  for (const b of blocks) {
    if (b.id === id) return b;
    const inner = byId(b.children, id);
    if (inner) return inner;
  }
  return undefined;
};
const astIds = (nodes: readonly BlockStatementNode[]): string[] =>
  nodes.flatMap((n) => [n.id, ...(n.type === 'Composite' ? astIds(n.children) : [])]);

describe('block parser: v12 model', () => {
  it('reads shapes, labels and spans', () => {
    const { model } = parse('a["A"] b("B"):2 c((("C"))) d>"D"] e[\\"E"/] f');
    expect(model.blocks.map((b) => [b.id, b.type, b.label, b.span])).toEqual([
      ['a', 'square', 'A', 1],
      ['b', 'round', 'B', 2],
      ['c', 'doublecircle', 'C', 1],
      ['d', 'rect_left_inv_arrow', 'D', 1],
      ['e', 'inv_trapezoid', 'E', 1],
      ['f', 'na', 'f', 1],
    ]);
  });

  it('reads mismatched delimiters as na, as v12', () => {
    expect(parse('a("x"]').model.blocks[0]?.type).toBe('na');
  });

  it('merges repeats: first position and span, later type and label', () => {
    const { model } = parse('a["x"]:2 b\n a\n a("y")');
    expect(tree(model.blocks)).toBe('a b');
    expect(model.blocks[0]).toMatchObject({ type: 'round', label: 'y', span: 2 });
  });

  it('drops the span of a chain`s first node, as v12', () => {
    expect(parse('a:2 --> b').model.blocks[0]?.span).toBe(1);
  });

  it('reads composites, columns and generated ids in source order', () => {
    const { model } = parse(
      'columns 2\n block\n  columns auto\n  a\n end\n space:2\n block:g["G"]:2\n  b\n end'
    );
    expect(tree(model.blocks)).toBe('id-1{a} id-2 g{b}');
    expect(model.columns).toBe(2);
    expect(model.blocks[0]).toMatchObject({
      type: 'composite',
      label: '',
      columns: -1,
      colorIndex: 0,
    });
    expect(model.blocks[1]).toMatchObject({ type: 'space', cells: 2 });
    expect(model.blocks[2]).toMatchObject({ label: 'G', span: 2, colorIndex: 1 });
  });

  it('numbers composites outer first (v12 colorIndex)', () => {
    const { model } = parse('block:o\n block:i\n a\n end\n end\n block:s\n b\n end');
    const slot = (id: string) => byId(model.blocks, id)?.colorIndex;
    expect([slot('o'), slot('i'), slot('s'), slot('a')]).toEqual([0, 1, 2, undefined]);
  });

  it('reads edges as v12: ids, arrowheads, thickness, pattern, labels', () => {
    const { model } = parse('a --> b\n a ==> b\n a -.- b\n x--o b\n a <--> b\n a -- "l" --x b');
    expect(
      model.edges.map((e) => [
        e.id,
        e.arrowTypeStart,
        e.arrowTypeEnd,
        e.thickness,
        e.pattern,
        e.label,
      ])
    ).toEqual([
      ['1-a-b', 'arrow_open', 'arrow_point', 'normal', 'solid', ''],
      ['2-a-b', 'arrow_open', 'arrow_point', 'thick', 'solid', ''],
      ['3-a-b', 'arrow_open', '', 'normal', 'dotted', ''],
      ['1-x-b', 'arrow_open', 'arrow_circle', 'normal', 'solid', ''],
      ['4-a-b', 'arrow_point', 'arrow_point', 'normal', 'solid', ''],
      ['5-a-b', 'arrow_open', 'arrow_cross', 'normal', 'solid', 'l'],
    ]);
  });

  it('reads classDef as v12 addStyleClass', () => {
    const { model } = parse('classDef c color:red, fill:blue;stroke:x\n classDef c x:y');
    expect(model.classDefs).toEqual([
      { id: 'c', styles: ['color:red', 'fill:bluestroke:x', 'x:y'], textStyles: ['fill:red'] },
    ]);
  });

  it('applies classes in order, one string per statement', () => {
    const { model } = parse('a b\n class a,b foo\n class a bar baz');
    expect(model.blocks.map((b) => b.classes)).toEqual([['foo', 'bar baz'], ['foo']]);
  });

  it('rejects what v12 rejects', () => {
    for (const body of [
      '',
      'end',
      'block:g\n end',
      'classDef DEFAULT fill:red',
      'a --> b:2',
      'a[x]',
      'a[""]',
    ])
      expect(errors(body), body).not.toEqual([]);
    expect(parseBlock('block-beta').diagnostics.some((d) => d.severity === 'error')).toBe(true);
  });
});

describe('block parser: D442 fixes', () => {
  it('a chain declares every block and draws every edge', () => {
    const { model } = parse('a --> b --> c');
    expect(tree(model.blocks)).toBe('a b c');
    expect(model.edges.map((e) => e.id)).toEqual(['1-a-b', '1-b-c']);
  });

  it('class before a declaration applies, and the block is drawn', () => {
    const { model } = parse('class a hot\n a');
    expect(model.blocks[0]).toMatchObject({ id: 'a', classes: ['hot'] });
  });

  it('class a, b trims its ids', () => {
    expect(parse('a b\n class a, b hot').model.blocks.map((b) => b.classes)).toEqual([
      ['hot'],
      ['hot'],
    ]);
  });

  it('root is an ordinary id', () => {
    expect(tree(parse('root a').model.blocks)).toBe('root a');
  });

  it('a leaf later opened as a composite keeps its place and adopts the children', () => {
    const { model } = parse('a b\n block:a\n c\n end');
    expect(tree(model.blocks)).toBe('a{c} b');
    expect(model.blocks[0]).toMatchObject({ type: 'composite', label: '', colorIndex: 0 });
  });

  it('a composite opened twice keeps both bodies (GAPS #554)', () => {
    expect(tree(parse('block:g\n a\n end\n block:g\n b\n end').model.blocks)).toBe('g{a b}');
  });

  it('a header chain: the composite is the first node, the rest sits next to it (GAPS #554)', () => {
    const { model } = parse('block:a --> b\n c\n end');
    expect(tree(model.blocks)).toBe('a{c} b');
    expect(model.edges.map((e) => e.id)).toEqual(['1-a-b']);
  });

  it('a header chain: the AST puts the edge and the block where the model does', () => {
    const { ast } = parse('block:a --> b\n c\n end');
    expect(ast.children.map((n) => n.id)).toEqual(['block:a', 'edge:a->b', 'block:b']);
    const composite = ast.children[0];
    expect(composite?.type === 'Composite' && composite.children.map((n) => n.id)).toEqual([
      'block:c',
    ]);
  });
});

/** AST id → the AST id of the composite (or `doc`) it sits in. */
function astParents(
  nodes: readonly BlockStatementNode[],
  parent: string,
  out = new Map<string, string>()
) {
  for (const n of nodes) {
    out.set(n.id, parent);
    if (n.type === 'Composite') astParents(n.children, n.id, out);
  }
  return out;
}

/** Each model block's AST id → its parent block's AST id (or `doc`). */
function modelParents(blocks: readonly Block[], parent: string, out = new Map<string, string>()) {
  for (const b of blocks) {
    out.set(b.ast, parent);
    modelParents(b.children, b.ast, out);
  }
  return out;
}

describe('block parser: AST and model agree', () => {
  it.each([
    ['blocks and edges', 'a --> b\n c a'],
    ['nested composites', 'block:g\n a\n block\n b --> c\n end\n end\n d'],
    ['a header chain', 'block:a --> b -- "l" --> c\n d\n end\n e'],
    ['spaces', 'space:2\n block\n space\n end'],
    ['a leaf opened later as a composite', 'a\n block:a\n b\n end'],
  ])('%s: each block sits under the composite its AST node sits in', (_name, body) => {
    const { ast, model } = parse(body);
    const inAst = astParents(ast.children, 'doc');
    for (const [id, parent] of modelParents(model.blocks, 'doc')) {
      expect(inAst.has(id), id).toBe(true);
      // By block, not by mention: a later `block:a` (`block:a@2`) opens the block `block:a`.
      expect(inAst.get(id)?.replace(/@\d+$/, ''), id).toBe(parent);
    }
    for (const e of model.edges) expect(inAst.has(e.ast), e.ast).toBe(true);
  });
});

describe('block parser: D443 style', () => {
  it('applies after every statement, to several ids, last one winning', () => {
    const { model, diagnostics } = parse('style a,b fill:red, stroke:blue\n a b\n style b color:x');
    expect(model.blocks.map((b) => b.styles)).toEqual([['fill:red', ' stroke:blue'], ['color:x']]);
    expect(diagnostics).toEqual([]);
  });

  it('warns once, listing the ids that never appear', () => {
    const { diagnostics } = parse('a\n style x fill:red\n style y,a fill:red\n style x fill:red');
    expect(diagnostics.map((d) => [d.severity, d.code])).toEqual([
      ['warning', BLOCK_STYLE_UNKNOWN],
    ]);
    expect(diagnostics[0]?.message).toContain('`x` and `y`');
    expect(diagnostics[0]?.related).toHaveLength(2);
  });
});

describe('block parser: D445 sizes', () => {
  it('columns 0 is auto and :0 is 1, with one warning', () => {
    const { model, diagnostics } = parse('columns 0\n a:0 b:0');
    expect(model.columns).toBe(-1);
    expect(model.blocks.map((b) => b.span)).toEqual([1, 1]);
    expect(diagnostics.map((d) => d.code)).toEqual([BLOCK_SIZE_INVALID]);
    expect(diagnostics[0]?.related).toHaveLength(2);
  });

  it('caps spans and spaces, with one warning', () => {
    const { model, diagnostics } = parse(`a:99999999999999999999\n space:${MAX_SPACE_CELLS + 1}`);
    expect(model.blocks[0]?.span).toBe(MAX_SPAN);
    expect(model.blocks[1]?.cells).toBe(MAX_SPACE_CELLS);
    expect(diagnostics.map((d) => d.code)).toEqual([BLOCK_TRUNCATED]);
  });

  it('keeps space:0 as no cell, as v12', () => {
    expect(parse('space:0 a').model.blocks[0]?.cells).toBe(0);
  });

  it('trims block-arrow directions', () => {
    expect(parse('a<["x"]>( right , left )').model.blocks[0]?.directions).toEqual([
      'right',
      'left',
    ]);
  });
});

describe('block parser: AST, symbols and statements (D448)', () => {
  const src =
    B +
    'a --> b\n a --> b\n block:g\n space\n end\n block\n b\n end\n classDef c x:y\n class a c\n style b x:y\n columns 2';
  const r = parseBlock(src);

  it('gives every statement a semantic id', () => {
    expect(astIds(r.ast.children)).toEqual([
      'block:a',
      'edge:a->b',
      'block:b',
      'block:a@2',
      'edge:a->b@2',
      'block:b@2',
      'block:g',
      'block:id-1',
      'block:id-2',
      'block:b@3',
      'classDef:c',
      'class:1',
      'style:1',
      'columns:1',
    ]);
    expect(r.model.blocks[0]?.ast).toBe('block:a');
    expect(r.model.edges[1]?.ast).toBe('edge:a->b@2');
  });

  it('escapes the separators in ids', () => {
    expect(astIds(parseBlock(B + 'a@b --> c#d').ast.children)).toEqual([
      'block:a%40b',
      'edge:a%40b->c%23d',
      'block:c%23d',
    ]);
  });

  it('defines a block at its first occurrence; later ones and targets refer to it', () => {
    const at = (name: string) =>
      r.symbols
        .filter((s) => s.name === name)
        .map((s) => [s.kind, s.role, src.slice(s.range.start, s.range.end)]);
    expect(at('a')).toEqual([
      ['block', 'def', 'a'],
      ['block', 'ref', 'a'],
      ['block', 'ref', 'a'],
    ]);
    expect(at('c')).toEqual([
      ['class', 'def', 'c'],
      ['class', 'ref', 'c'],
    ]);
  });

  it('records the header and each composite as statements, the only spans that fold (#557)', () => {
    expect(r.statements.map((s) => s.kind)).toEqual(['header', 'composite', 'composite']);
    expect(r.statements[1]?.children).toBeUndefined();
  });

  it('parses 16k statements and depth 800 (limits raised)', () => {
    expect(parseBlock(B + 'a\n'.repeat(16_000)).diagnostics).toEqual([]);
    const deep = B + 'block\n'.repeat(800) + 'a\n' + 'end\n'.repeat(800);
    expect(parseBlock(deep, { maxDepth: 1_000 }).diagnostics).toEqual([]);
    expect(parseBlock(deep).diagnostics.map((d) => d.code)).toEqual(['DEPTH_LIMIT']);
  });
});
