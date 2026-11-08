import { describe, expect, it } from 'vitest';
import type { AstNode } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import { parseXyChart } from '../index.ts';

const model = (src: string) => {
  const r = parseXyChart(src);
  expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return r.model;
};
const ids = (src: string) => parseXyChart(src).ast.children.map((n: AstNode) => n.id);
/** Each plot's `[x, y]` pairs, `null` for a missing value (as `getXYChartData()` shows them). */
const pairs = (src: string) => model(src).plots.map((p) => p.data.map((d) => [d.x, d.y ?? null]));

/**
 * The parser seam (spec #426 T2): the model holds what v12's `xychartDb.ts` held after the same
 * statements. Expected values were read from mermaid 12.2.0 (`getXYChartData()` and friends).
 */
describe('xychart parser: model', () => {
  it('infers the x range from the first plot only', () => {
    const m = model('xychart\nbar [1,2]\nline [1,2,3,4]');
    expect(m.xAxis).toEqual({ kind: 'linear', title: '', min: 1, max: 2 });
    expect(m.yAxis).toEqual({ kind: 'linear', title: '', min: 1, max: 4, explicit: false });
    expect(m.plots.map((p) => [p.ast, p.kind, p.index, p.data])).toEqual([
      [
        'plot:1',
        'bar',
        0,
        [
          { x: '1', y: 1 },
          { x: '2', y: 2 },
        ],
      ],
      [
        'plot:2',
        'line',
        1,
        [
          { x: '1', y: 1 },
          { x: '1.3333333333333333', y: 2 },
          { x: '1.6666666666666665', y: 3 },
          { x: '2', y: 4 },
        ],
      ],
    ]);
  });

  it('keeps for each plot the x axis it saw (D386)', () => {
    const src =
      'xychart\nbar [1,2,3]\nbar [4,5]\nx-axis [a,b,c,d]\nbar [9,8,7,6,5]\nx-axis 10 --> 20\nline [1,2]';
    expect(pairs(src)).toEqual([
      [
        ['1', 1],
        ['2', 2],
        ['3', 3],
      ],
      [
        ['1', 4],
        ['3', 5],
      ],
      [
        ['a', 9],
        ['b', 8],
        ['c', 7],
        ['d', 6],
      ],
      [
        ['10', 1],
        ['20', 2],
      ],
    ]);
    const m = model(src);
    expect(m.xAxis).toEqual({ kind: 'linear', title: '', min: 10, max: 20, ast: 'x-axis@2' });
    expect([m.yAxis.min, m.yAxis.max]).toEqual([1, 9]);
  });

  it('warns once for the plots before the last x-axis with data, naming each (D386)', () => {
    const r = parseXyChart('xychart\nbar [1,2]\nline [2]\nx-axis [a,b]\nbar [3]\nx-axis "T"');
    expect(r.diagnostics.map((d) => [d.severity, d.code, r.ast.children[3]?.range])).toEqual([
      ['warning', 'XYCHART_PLOT_BEFORE_AXIS', r.ast.children[3]?.range],
    ]);
    const [w] = r.model.warnings;
    expect(w?.range).toEqual({ start: 27, end: 39 });
    expect(w?.related?.map((x) => x.range)).toEqual([
      { start: 8, end: 17 },
      { start: 18, end: 26 },
    ]);
    expect(model('xychart\nx-axis [a]\nbar [1]\nx-axis "T"').warnings).toEqual([]);
  });

  it('does not warn when the later x-axis gives the plot the x values it already has', () => {
    expect(model('xychart\nx-axis [a]\nbar [1]\nx-axis [a]').warnings).toEqual([]);
    // The first plot inferred `1 --> 2`; the same range again changes nothing.
    expect(model('xychart\nbar [1, 2]\nx-axis "T" 1 --> 2').warnings).toEqual([]);
    const r = parseXyChart('xychart\nx-axis [a]\nbar [1]\nx-axis [b]\nbar [2]\nx-axis [b]');
    expect(r.model.warnings.map((w) => [w.code, w.related?.map((x) => x.message)])).toEqual([
      ['XYCHART_PLOT_BEFORE_AXIS', ['Plot 1 comes before the `x-axis`.']],
    ]);
  });

  it('cuts values to the categories and leaves missing ones out; keeps duplicates (D383)', () => {
    expect(pairs('xychart\nx-axis [a,b,c]\nbar [1]')).toEqual([
      [
        ['a', 1],
        ['b', null],
        ['c', null],
      ],
    ]);
    const m = model('xychart\nx-axis [Q1, Q2]\nbar [10, 50, 999, 800]\nx-axis [a, a, b]');
    expect(m.plots[0]?.data).toEqual([
      { x: 'Q1', y: 10 },
      { x: 'Q2', y: 50 },
    ]);
    expect(m.plots[0]?.values).toEqual([10, 50, 999, 800]);
    expect(m.yAxis.max).toBe(50);
    expect(m.xAxis).toMatchObject({ kind: 'band', categories: ['a', 'a', 'b'] });
  });

  it('keeps a reversed range, and a later title-only axis keeps the data', () => {
    const m = model('xychart\nx-axis 10 --> 1\ny-axis 100 --> 0\nbar [1, 2]');
    expect(m.xAxis).toMatchObject({ kind: 'linear', min: 10, max: 1 });
    expect(m.yAxis).toMatchObject({ min: 100, max: 0, explicit: true });
    expect(pairs('xychart\nx-axis 10 --> 1\nbar [1, 2]')).toEqual([
      [
        ['10', 1],
        ['1', 2],
      ],
    ]);
    expect(model('xychart\nx-axis "T" [a]\nx-axis "U"\nbar [1, 2]').xAxis).toEqual({
      kind: 'band',
      title: 'U',
      categories: ['a'],
      ast: 'x-axis@2',
    });
    expect(model('xychart\ny-axis 0 --> 10\ny-axis "T"\nbar [50]').yAxis).toEqual({
      kind: 'linear',
      title: 'T',
      min: 0,
      max: 10,
      explicit: true,
      ast: 'y-axis@2',
    });
  });

  it('turns the chart only for `horizontal` as written, the last header winning', () => {
    expect(model('xychart horizontal\nbar [1]').orientation).toBe('horizontal');
    expect(model('xychart HORIZONTAL\nbar [1]').orientation).toBe('vertical');
    expect(model('xychart horizontal xychart vertical\nbar [1]').orientation).toBe('vertical');
    expect(model('xychart\nbar [1]').orientation).toBeUndefined();
  });

  it('joins unquoted text without blanks and trims what v12 trimmed', () => {
    const m = model(
      'xychart\ntitle Sales 2024 & co\nx-axis Month name [jan feb, " mar "]\nline " n " [1 " p ", 2]\nbar b [3 "x"]'
    );
    expect(m.title).toBe('Sales2024&co');
    expect(m.xAxis).toMatchObject({ title: 'Monthname', categories: ['janfeb', 'mar'] });
    expect(m.plots.map((p) => [p.name, p.pointLabels])).toEqual([
      ['n', ['p', '']],
      ['b', undefined],
    ]);
  });

  it('lets the last title, accTitle and accDescr win; the in-text title over front matter', () => {
    const src =
      'xychart\ntitle one\ntitle "two"\naccTitle: a\naccTitle: b\naccDescr: c\naccDescr {\n  d\n    e\n}\nbar [1]';
    const m = model(src);
    expect([m.title, m.titleAst, m.accTitle, m.accDescr]).toEqual(['two', 'title@2', 'b', 'd\ne']);
    expect(model('---\ntitle: FM\n---\nxychart\nbar [1]').title).toBe('FM');
    expect(model('---\ntitle: FM\n---\nxychart\ntitle "  "\nbar [1]').title).toBe('');
  });

  it('reads an unclosed accDescr as v12: its text, then an empty description', () => {
    const r = parseXyChart('xychart\nbar [1]\naccDescr {\nnever closed');
    expect(r.model.accDescr).toBe('');
    expect(r.diagnostics.map((d) => [d.severity, d.code])).toEqual([
      ['warning', 'XYCHART_UNCLOSED_DESCRIPTION'],
    ]);
  });

  it('accepts statements with no separator and repeated headers, as jison does', () => {
    expect(model('xychart\ntitle a x-axis [q] bar [5]').plots[0]?.data).toEqual([{ x: 'q', y: 5 }]);
    expect(model('xychart\nxychart-beta\n;bar [1] line [2]').plots).toHaveLength(2);
  });

  it('reports an unclosed directive that cut the text once, not also "no plot"', () => {
    for (const src of ['%%{init: {}\nxychart\nbar [1]', 'xychart\n%%{init: {}\nbar [1]']) {
      expect(parseXyChart(src).diagnostics.map((d) => d.code)).toEqual(['UNCLOSED_DIRECTIVE']);
      const pre = preprocess(src);
      expect(parseXyChart(src, { preprocessed: pre }).diagnostics).toEqual([]);
    }
  });

  it('rejects a chart without a plot with v12 message (R-PARSE-4)', () => {
    const r = parseXyChart('xychart\ntitle T');
    expect(r.diagnostics.map((d) => [d.code, d.message])).toEqual([
      ['XYCHART_NO_PLOT', 'No Plot to render, please provide a plot with some data'],
    ]);
  });
});

describe('xychart parser: AST', () => {
  it('names statements, with @n for repeats and plots by position', () => {
    expect(
      ids(
        'xychart\naccTitle: a\ntitle t\nx-axis [a]\nbar [1]\nline [2]\nx-axis "b"\ny-axis 0 --> 1\ntitle u\naccDescr: d\naccTitle: e\nxychart'
      )
    ).toEqual([
      'header',
      'accTitle',
      'title',
      'x-axis',
      'plot:1',
      'plot:2',
      'x-axis@2',
      'y-axis',
      'title@2',
      'accDescr',
      'accTitle@2',
    ]);
  });

  it('records categories and plot names as symbols, quotes in the range', () => {
    const src = 'xychart\nx-axis [jan, "Q 2"]\nbar "Sales" [1, 2]';
    const r = parseXyChart(src);
    expect(r.symbols.map((s) => [s.kind, s.name, src.slice(s.range.start, s.range.end)])).toEqual([
      ['category', 'jan', 'jan'],
      ['category', 'Q 2', '"Q 2"'],
      ['plot', 'Sales', '"Sales"'],
    ]);
    expect(r.statements.map((s) => s.kind)).toEqual(['header', 'axis', 'plot']);
  });
});
