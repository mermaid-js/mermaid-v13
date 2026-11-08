// cspell:words treemapx
import { describe, expect, it } from 'vitest';
import type { TreemapNode } from '../model.ts';
import {
  detectTreemap,
  parseTreemap,
  TREEMAP_INVALID_VALUE,
  TREEMAP_ROWS_ON_ONE_LINE,
  TREEMAP_TRAILING_BLANK,
} from './index.ts';

/**
 * One-line probes of the treemap parser (#484): detection, v12's syntax and its traps (D401),
 * values (D402), titles. The multi-line fixtures are in the conformance package
 * (`treemap/parser.spec.ts`); accept/reject and the model against v12 are its parity specs.
 */
const parse = (src: string) => parseTreemap(src);
const errors = (src: string) =>
  parse(src)
    .diagnostics.filter((d) => d.severity === 'error')
    .map((d) => d.code);
const warnings = (src: string) => parse(src).model.warnings.map((d) => d.code);
const tree = (nodes: readonly TreemapNode[]): unknown[] =>
  nodes.map((n) => (n.type === 'Leaf' ? `${n.name}=${n.value}` : [n.name, tree(n.children)]));

describe('treemap detection', () => {
  it("detects what v12's /^\\s*treemap/ did", () => {
    for (const src of ['treemap', 'treemap-beta', '  treemap', '%% c\ntreemap', 'treemapx']) {
      expect(detectTreemap(src), src).toBe(true);
    }
    for (const src of ['Treemap', 'tree map', 'pie']) expect(detectTreemap(src), src).toBe(false);
  });
});

describe('treemap parser', () => {
  it('reads an empty treemap, sections, leaves with `:` or `,`, and several roots', () => {
    expect(parse('treemap').model).toMatchObject({ roots: [], classes: [], warnings: [] });
    expect(tree(parse('treemap-beta\n"A"\n  "x": 1\n  "y" , 2\n"B"').model.roots)).toEqual([
      ['A', ['x=1', 'y=2']],
      ['B', []],
    ]);
    expect(errors('treemap\n"A"\n: 1')).toEqual([]);
  });

  it('nests rows on one line, with a warning (D401)', () => {
    const { model, diagnostics } = parse('treemap\n"r" "s"');
    expect(tree(model.roots)).toEqual([['r', [['s', []]]]]);
    expect(diagnostics.map((d) => d.code)).toEqual([TREEMAP_ROWS_ON_ONE_LINE]);
    expect(warnings('treemap\n"a": 1,"b": 2,"c": 3')).toEqual([TREEMAP_ROWS_ON_ONE_LINE]);
    expect(warnings('treemap "a": 1')).toEqual([]);
  });

  it('names the trailing blank before an indented row as the cause (D401)', () => {
    const [d] = parse('treemap\n"r" \n  "b": 2').diagnostics;
    expect(d?.code).toBe('STRAY_BLANK');
    expect(d?.message).toContain('a blank at the end of line 2');
    expect(parse('treemap\n"r": 1 %% c\n  "b": 2').diagnostics[0]?.message).toContain(
      'a blank before the `%%` comment on line 2'
    );
    expect(parse('treemap\n"a": 1 ').diagnostics[0]?.message).toContain('no row follows it');
  });

  it('warns when a trailing blank indents the next row, as v12 read it (D401)', () => {
    const { model, diagnostics } = parse('treemap\n"r" \n"b": 2');
    expect(tree(model.roots)).toEqual([['r', ['b=2']]]);
    expect(diagnostics.map((d) => [d.code, d.severity])).toEqual([
      [TREEMAP_TRAILING_BLANK, 'warning'],
    ]);
  });

  it('says class names need two characters (D401)', () => {
    const [d] = parse('treemap\nclassDef c fill:red').diagnostics;
    expect(d?.message).toContain('class names need two characters');
    expect(errors('treemap\nclassDef cc fill:red')).toEqual([]);
  });

  it('rejects what v12 rejected, with the cause', () => {
    expect(parse('treemapx').diagnostics[0]?.message).toContain('`treemapx` is not a diagram type');
    expect(parse('treemap\n"a" :::c').diagnostics[0]?.message).toContain('no blank before them');
    expect(parse('treemap\n"a": 1e3').diagnostics[0]?.message).toContain('no exponent');
    expect(errors('treemap\n"a": -1')).toEqual(['UNEXPECTED_CHARACTER']);
    expect(errors('treemap\n"a')).toEqual(['UNCLOSED_STRING']);
    expect(errors('treemap\naccDescr {\n"a": 1')).toEqual(['UNCLOSED_ACC_DESCR']);
    expect(errors('treemap\naccTitle x')).toEqual(['UNEXPECTED']);
    expect(errors('pie\n"a": 1')).toEqual(['UNEXPECTED']);
  });

  it("keeps v12's value conversion and lists the odd values once (D402)", () => {
    const { model, diagnostics } = parse('treemap\n"a": 1_000\n"b": 1,2,3\n"c": .\n"d": 1,000');
    expect(tree(model.roots)).toEqual(['a=1', 'b=123', 'c=NaN', 'd=1000']);
    expect(diagnostics.map((d) => [d.code, d.related?.length])).toEqual([
      [TREEMAP_INVALID_VALUE, 2],
    ]);
    expect(warnings('treemap\n"a": 01\n"b": 1.\n"c": 1,')).toEqual([]);
  });

  it('takes the last title, accTitle and accDescr, after rows too; a bare title sets none', () => {
    const { model } = parse(
      'treemap\ntitle  A   b \n"a": 1\naccTitle: T\naccDescr {\n  x\n   y }\ntitle B'
    );
    expect([model.title, model.titleAstId, model.accTitle, model.accDescr]).toEqual([
      'B',
      'title@2',
      'T',
      'x\ny',
    ]);
    expect(parse('treemap\ntitle A\ntitle').model.title).toBeUndefined();
  });

  it('gives each row its range, from the name to the value or class', () => {
    const src = 'treemap\n  "a"  :  1:::hot\n"b":::cold';
    const { ast } = parse(src);
    expect(ast.children.map((n) => src.slice(n.range.start, n.range.end))).toEqual([
      'treemap',
      '"a"  :  1:::hot',
      '"b":::cold',
    ]);
  });

  it('includes the preprocess diagnostics unless it is given the preprocess result', () => {
    expect(errors('---\ntitle: x\ntreemap')).toContain('UNCLOSED_FRONT_MATTER');
  });
});
