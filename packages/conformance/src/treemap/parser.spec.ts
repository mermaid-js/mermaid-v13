import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parseTreemap,
  TREEMAP_CLASSDEF_NEXT_LINE,
  TREEMAP_INVALID_VALUE,
  TREEMAP_ROWS_ON_ONE_LINE,
  TREEMAP_TRAILING_BLANK,
} from '@mermaid-js/diagram-treemap';
import type { TreemapNode } from '@mermaid-js/diagram-treemap';
import { REPO_ROOT } from '../corpus.ts';

/**
 * The treemap parser and model (#484) on the multi-line fixtures
 * `e2e/diagrams/treemap/nightly-check/parser-*.mmd`: v12's value conversion and tree building,
 * AST ids (D408), D401's and D402's warnings, the front-matter title (D218), symbols, statement
 * spans and source ranges. Accept/reject and model parity are `parity.spec.ts`'s.
 */
const fixture = (name: string) =>
  readFileSync(join(REPO_ROOT, `e2e/diagrams/treemap/nightly-check/${name}.mmd`), 'utf8');

/** `name` (leaf `name=value`, class `name:::class`) and children, as one nested list. */
type Shape = string | [string, Shape[]];
const shape = (n: TreemapNode): Shape => {
  let label = n.value === undefined ? n.name : `${n.name}=${n.value}`;
  if (n.classSelector !== undefined) label += `:::${n.classSelector}`;
  return n.type === 'Section' ? [label, n.children.map(shape)] : label;
};

describe('treemap parser on the fixtures', () => {
  it('reads sections, leaves, classes, the title and accessibility', () => {
    const { model, diagnostics } = parseTreemap(fixture('parser-model'));
    expect(diagnostics).toEqual([]);
    expect(model.roots.map(shape)).toEqual([
      ['Home:::home', ['Rent=1200', 'Power=80.5']],
      ['Food', ['Groceries=400:::food', 'Eating out=150']],
    ]);
    expect(model.classes).toEqual([
      {
        name: 'home',
        styles: ['fill:#cde', 'stroke:#345', 'color:#111'],
        textStyles: [],
        astId: 'classDef:home',
      },
      { name: 'food', styles: ['fill:#fdc'], textStyles: [], astId: 'classDef:food' },
    ]);
    expect(
      model.roots.map((r) => [r.astId, r.depth, r.children.map((c) => [c.astId, c.depth])])
    ).toEqual([
      [
        'node:Home',
        0,
        [
          ['node:Home/Rent', 1],
          ['node:Home/Power', 1],
        ],
      ],
      [
        'node:Food',
        0,
        [
          ['node:Food/Groceries', 1],
          ['node:Food/Eating out', 1],
        ],
      ],
    ]);
    expect([model.title, model.titleAstId, model.accTitle, model.accDescr]).toEqual([
      'Household budget',
      'title',
      'Budget',
      'Monthly spending by category',
    ]);
    expect(Object.isFrozen(model)).toBe(true);
    expect(Object.isFrozen(model.roots[0]?.children)).toBe(true);
    expect(Object.isFrozen(model.classes[0]?.styles)).toBe(true);
  });

  it('gives AST ids by name path, repeats with @n, special characters encoded (D408)', () => {
    const { ast, model } = parseTreemap(fixture('parser-ast-ids'));
    expect(ast.children.map((n) => n.id)).toEqual([
      'treemap',
      'title',
      'node:A',
      'node:A/x',
      'node:A/x@2',
      'node:A@2',
      'node:A/x@3',
      'node:a%2Fb%40c%25',
      'node:a%2Fb%40c%25/y',
      'classDef:hot',
      'classDef:hot@2',
      'title@2',
    ]);
    expect(model.classes.map((c) => [c.astId, c.styles])).toEqual([
      ['classDef:hot', ['fill:#f99', 'stroke:#900']],
    ]);
    expect([model.title, model.titleAstId]).toEqual(['Second', 'title@2']);
  });

  it('nests by indent as v12 did: any width, unseen dedents, rows under a leaf, tabs', () => {
    const { model, diagnostics, ast } = parseTreemap(fixture('parser-nesting'));
    expect(diagnostics).toEqual([]);
    expect(model.roots.map(shape)).toEqual([
      ['Root', [['Deep', ['d1=1']], 'Mid=2', 'Under leaf=3', 'Tab=4']],
      ['Second root', ['s1=5']],
    ]);
    const rows = ast.children.filter((n) => n.type === 'Section' || n.type === 'Leaf');
    expect(rows.map((n) => [n.name, n.indent, n.depth])).toEqual([
      ['Root', 0, 0],
      ['Deep', 6, 1],
      ['d1', 10, 2],
      ['Mid', 3, 1],
      ['Under leaf', 8, 1],
      ['Tab', 1, 1],
      ['Second root', 0, 0],
      ['s1', 2, 1],
    ]);
  });

  it("warns about v12's traps it accepts (D401) and its invalid values, once (D402)", () => {
    const src = fixture('parser-warnings');
    const { model, diagnostics } = parseTreemap(src);
    const at = (r: { start: number; end: number }) => src.slice(r.start, r.end);
    expect(diagnostics.map((d) => [d.severity, d.code, at(d.range)])).toEqual([
      ['warning', TREEMAP_TRAILING_BLANK, ' '],
      ['warning', TREEMAP_ROWS_ON_ONE_LINE, '"b"'],
      ['warning', TREEMAP_INVALID_VALUE, '1_000'],
      ['warning', TREEMAP_CLASSDEF_NEXT_LINE, 'classDef ab\n"h": 4'],
    ]);
    const [blank, oneLine, values, classDef] = diagnostics;
    expect(blank?.message).toContain('the blank at the end of line 9');
    expect(blank?.related?.map((r) => at(r.range))).toEqual(['"a"']);
    expect(oneLine?.related?.map((r) => at(r.range))).toEqual(['"c"']);
    expect(values?.message).toContain(
      '`1_000` (read as 1), `1,2,3` (read as 123), `.` (read as not a number)'
    );
    expect(values?.related?.map((r) => at(r.range))).toEqual(['1,2,3', '.']);
    expect(classDef?.message).toContain('takes the next line (`"h": 4`)');
    expect(model.warnings).toEqual(diagnostics);
    expect(model.roots.map(shape)).toEqual([
      ['Totals', ['a=1', 'b=2', 'c=3']],
      'd=1',
      'e=123',
      'f=NaN',
      'g=1000.5',
    ]);
    expect(model.classes.map((c) => [c.name, c.styles])).toEqual([['ab', ['"h": 4']]]);
  });

  it('takes the front-matter title when the text sets none (D218)', () => {
    const src = fixture('parser-front-matter-title');
    const { model } = parseTreemap(src);
    expect([model.title, model.titleAstId]).toEqual(['Front matter title', undefined]);
    const inText = src.replace('  title\n', '  title In text\n');
    expect(parseTreemap(inText).model.title).toBe('In text');
    expect(parseTreemap('treemap\n"a": 1').model.title).toBeUndefined();
  });

  it('records node and class symbols (D408) and statement spans', () => {
    const src = fixture('parser-model');
    const { symbols, statements } = parseTreemap(src);
    const at = (r: { start: number; end: number }) => src.slice(r.start, r.end);
    expect(symbols.map((s) => [s.kind, s.name, s.role, at(s.range)])).toEqual([
      ['class', 'home', 'ref', 'home'],
      ['node', 'Home', 'def', '"Home"'],
      ['node', 'Rent', 'def', '"Rent"'],
      ['node', 'Power', 'def', '"Power"'],
      ['node', 'Food', 'def', '"Food"'],
      ['class', 'food', 'ref', 'food'],
      ['node', 'Groceries', 'def', '"Groceries"'],
      ['node', 'Eating out', 'def', '"Eating out"'],
      ['class', 'home', 'def', 'home'],
      ['class', 'food', 'def', 'food'],
      ['class', 'home', 'ref', 'home'],
    ]);
    expect(statements.map((s) => [s.kind, at(s.range)])).toEqual([
      ['header', 'treemap-beta'],
      ['title', 'title Household budget'],
      ['accTitle', 'accTitle: Budget'],
      ['accDescr', 'accDescr: Monthly spending by category'],
      ['section', '"Home":::home'],
      ['leaf', '"Rent", 1200'],
      ['leaf', '"Power": 80.5'],
      ['section', '"Food"'],
      ['leaf', '"Groceries": 400:::food'],
      ['leaf', '"Eating out": 150'],
      ['classDef', 'classDef home fill:#cde,stroke:#345'],
      ['classDef', 'classDef food fill:#fdc'],
      ['classDef', 'classDef home color:#111'],
    ]);
  });

  it('maps ranges to the source through CRLF, comments, directives and entities', () => {
    const src = fixture('parser-source-ranges').replace(/\n/g, '\r\n');
    const { ast, model, diagnostics } = parseTreemap(src);
    expect(diagnostics).toEqual([]);
    expect(ast.children.map((n) => src.slice(n.range.start, n.range.end))).toEqual([
      'treemap',
      '"A #amp; B"',
      '"x": 1',
      '"y": 2',
    ]);
    expect(model.roots.map(shape)).toEqual([['A &amp; B', ['x=1', 'y=2']]]);
  });
});
