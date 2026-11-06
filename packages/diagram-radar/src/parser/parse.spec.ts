import { describe, expect, it } from 'vitest';
import { parseRadar } from './index.ts';
import type { RadarCurveNode } from './index.ts';

/**
 * The radar parser and model (#446): v12's grammar, value conversion and DB resolution, the
 * model in source order, D218's title, D356's warnings, AST ids (DESIGN §4.2), symbols (D358)
 * and spans. Accept/reject and model parity over the corpus are the conformance suite's.
 */
const parse = (src: string) => parseRadar(src);
const errors = (src: string) =>
  parse(src)
    .diagnostics.filter((d) => d.severity === 'error')
    .map((d) => d.code);

describe('radar parser', () => {
  it('reads axes, curves, options, title and accessibility', () => {
    const { model, diagnostics } = parse(
      [
        'radar-beta',
        '  title Radar diagram',
        '  accTitle: Radar accTitle',
        '  accDescr: Radar accDescription',
        '  axis A["Axis A"], B["Axis B"] ,C["Axis C"]',
        '  curve mycurve["My Curve"]{1,2,3}',
        '  curve other{ C: 3, A: 1, B: 2 }',
        '  ticks 10',
      ].join('\n')
    );
    expect(diagnostics).toEqual([]);
    expect(model).toEqual({
      axes: [
        { name: 'A', label: 'Axis A', astId: 'axis:A' },
        { name: 'B', label: 'Axis B', astId: 'axis:B' },
        { name: 'C', label: 'Axis C', astId: 'axis:C' },
      ],
      curves: [
        {
          name: 'mycurve',
          label: 'My Curve',
          astId: 'curve:mycurve',
          entries: [
            { value: 1, astId: 'curve:mycurve#0' },
            { value: 2, astId: 'curve:mycurve#1' },
            { value: 3, astId: 'curve:mycurve#2' },
          ],
        },
        {
          name: 'other',
          label: 'other',
          astId: 'curve:other',
          entries: [
            { value: 1, astId: 'curve:other>A' },
            { value: 2, astId: 'curve:other>B' },
            { value: 3, astId: 'curve:other>C' },
          ],
        },
      ],
      options: { showLegend: true, ticks: 10, max: null, min: 0, graticule: 'circle' },
      title: 'Radar diagram',
      accTitle: 'Radar accTitle',
      accDescr: 'Radar accDescription',
      warnings: [],
    });
    expect(Object.isFrozen(model)).toBe(true);
    expect(Object.isFrozen(model.curves[0]?.entries)).toBe(true);
    expect(errors('radar-beta\naxis A,\nB')).toEqual(['UNEXPECTED']);
  });

  it('accepts the three headers and statements sharing a line', () => {
    for (const src of [
      'radar-beta',
      'radar-beta:',
      ' radar-beta :\naxis A',
      'radar-beta title Hi\naxis A',
      'radar-beta\naxis A curve c{1}',
      'radar-beta\naxis A\ncurve c{A:1} ticks 3',
      'radar-beta\naxis A, B\ncurve c{\n\n1,\n\n2\n\n}',
      'radar-beta\naxis A\ncurve c{A 1}',
      '\n\nradar-beta\n\n',
    ]) {
      expect(errors(src), src).toEqual([]);
    }
    for (const src of [
      'radar-betax',
      'radar-beta\naxis A,\nB',
      'radar-beta\naxis A, B\ncurve c{1\n,2}',
      'radar-beta\naxis A, B\ncurve c{1, A 2}',
      'radar-beta\naxis A\ncurve c{}',
      'radar-beta\naxis A\ncurve c{A::1}',
      'radar-beta\nmin -5',
      'radar-beta\ntitle x axis A curve c{1} ticks 3\naccTitle x',
      'radar-beta\naxis max',
    ]) {
      expect(errors(src), src).not.toEqual([]);
    }
  });

  it('gives AST ids to every statement and entry, repeats with @n', () => {
    const { ast } = parse(
      'radar-beta\naxis A, A, B\ncurve c{1, 2, 3}, c{A: 1, A: 2, B: 3}\nticks 3\nticks 4\ntitle a\ntitle b\naccTitle: t\naccDescr: d'
    );
    expect(ast.children.map((n) => n.id)).toEqual([
      'radar',
      'axis:A',
      'axis:A@2',
      'axis:B',
      'curve:c',
      'curve:c@2',
      'opt:ticks',
      'opt:ticks@2',
      'title',
      'title@2',
      'accTitle',
      'accDescr',
    ]);
    const curves = ast.children.filter((n): n is RadarCurveNode => n.type === 'Curve');
    expect(curves.map((c) => c.children.map((e) => e.id))).toEqual([
      ['curve:c#0', 'curve:c#1', 'curve:c#2'],
      ['curve:c@2>A', 'curve:c@2>A@2', 'curve:c@2>B'],
    ]);
  });

  it('resolves the model as v12 did: axes first, detailed entries reordered, duplicates kept', () => {
    const { model, diagnostics } = parse(
      'radar-beta\ncurve c{B: 2, A: 1, A: 9}\naxis A["Alpha"], B[""]\naxis A'
    );
    expect(diagnostics).toEqual([]);
    expect(model.axes.map((a) => [a.name, a.label, a.astId])).toEqual([
      ['A', 'Alpha', 'axis:A'],
      ['B', '', 'axis:B'],
      ['A', 'A', 'axis:A@2'],
    ]);
    expect(model.curves[0]?.entries).toEqual([
      { value: 1, astId: 'curve:c>A' },
      { value: 2, astId: 'curve:c>B' },
      { value: 1, astId: 'curve:c>A' },
    ]);
  });

  it("reports v12's DB throws at the curve, with its messages, and goes on", () => {
    const src = 'radar-beta\naxis A["Alpha"], B["Beta"]\ncurve c{A: 1}\ncurve d{1, 2}';
    const { model, diagnostics } = parse(src);
    expect(
      diagnostics.map((d) => [d.code, d.message, src.slice(d.range.start, d.range.end)])
    ).toEqual([['RADAR_MISSING_ENTRY', 'Missing entry for axis Beta', 'c{A: 1}']]);
    expect(model.curves.map((c) => c.name)).toEqual(['c', 'd']);
    const none = parse('radar-beta\ncurve c{A: 1}').diagnostics;
    expect(none.map((d) => [d.code, d.message])).toEqual([
      ['RADAR_NO_AXES', 'Axes must be populated before curves for reference entries'],
    ]);
  });

  it('warns once about entries that name no axis, the others related (D356)', () => {
    const src = 'radar-beta\naxis A\ncurve c{A 1, X 2}\ncurve d{Y 3, A 4}';
    const { model, diagnostics } = parse(src);
    expect(diagnostics).toHaveLength(1);
    const [d] = diagnostics;
    expect(d?.severity).toBe('warning');
    expect(d?.code).toBe('RADAR_UNKNOWN_AXIS');
    expect(src.slice(d?.range.start, d?.range.end)).toBe('X');
    expect(d?.related?.map((r) => src.slice(r.range.start, r.range.end))).toEqual(['Y']);
    expect(model.warnings).toEqual(diagnostics);
    expect(model.curves.map((c) => c.entries.map((e) => e.value))).toEqual([[1], [4]]);
  });

  it('resolves options as v12 did: the last of each, ticks clamped to 32 with a warning', () => {
    const { model, diagnostics } = parse(
      'radar-beta\nticks 3, showLegend false\nticks 40\ngraticule polygon\nmax 0\nmin 0.5'
    );
    expect(model.options).toEqual({
      showLegend: false,
      ticks: 32,
      max: 0,
      min: 0.5,
      graticule: 'polygon',
    });
    expect(diagnostics.map((d) => [d.code, d.severity])).toEqual([
      ['RADAR_TICKS_CLAMPED', 'warning'],
    ]);
    expect(parse('radar-beta\nticks 32\nticks 1.5').model.options.ticks).toBe(1.5);
    expect(parse('radar-beta').model.options).toEqual({
      showLegend: true,
      ticks: 5,
      max: null,
      min: 0,
      graticule: 'circle',
    });
  });

  it('takes the in-text title if non-empty, else the front-matter one (D218)', () => {
    const fm = '---\ntitle: Front\n---\n';
    expect(parse(`${fm}radar-beta\naxis A`).model.title).toBe('Front');
    expect(parse(`${fm}radar-beta\ntitle In text\naxis A`).model.title).toBe('In text');
    expect(parse(`${fm}radar-beta\ntitle In text\ntitle\naxis A`).model.title).toBe('Front');
    expect(parse('radar-beta\ntitle   a   b   %% c').model.title).toBe('a b');
    expect('title' in parse('radar-beta\ntitle').model).toBe(false);
  });

  it('converts labels as Langium did: either quote, escapes, line breaks, untrimmed', () => {
    const { model } = parse(
      'radar-beta\naxis A["a\\"b"], B[\'c\\\'d\'], C[" e\\nf "], D["g\nh"]\ncurve c[\'x\']{1, 2, 3, 4}'
    );
    expect(model.axes.map((a) => a.label)).toEqual(['a"b', "c'd", ' e\nf ', 'g\nh']);
    expect(model.curves[0]?.label).toBe('x');
  });

  it('says why a name that starts with a keyword is no name (D357)', () => {
    const at = (src: string) => parse(src).diagnostics.map((d) => d.message);
    expect(at('radar-beta\naxis circles')).toEqual([
      expect.stringContaining('`circles` starts with the keyword `circle`'),
    ]);
    expect(at('radar-beta\naxis A, true')).toEqual([
      expect.stringContaining('`true` is a keyword'),
    ]);
    expect(at('radar-beta\naxis titleX')).toEqual([
      expect.stringContaining('`titleX` starts with the keyword `title`'),
    ]);
    expect(at('radar-beta\nshowLegend trueish')).toEqual([
      expect.stringContaining('`trueish` starts with the keyword `true`'),
    ]);
  });

  it('records axis symbols (definition, repeats and entries as references) and curves (D358)', () => {
    const { symbols } = parse('radar-beta\naxis A, B, A\ncurve c{A 1, X 2}, d{1, 2, 3}');
    expect(symbols.map((s) => [s.kind, s.name, s.role])).toEqual([
      ['axis', 'A', 'def'],
      ['axis', 'B', 'def'],
      ['axis', 'A', 'ref'],
      ['axis', 'A', 'ref'],
      ['axis', 'X', 'ref'],
      ['curve', 'c', 'def'],
      ['curve', 'd', 'def'],
    ]);
  });

  it('records statement spans', () => {
    const src = 'radar-beta\naxis A, B\ncurve c{1, 2}, d{3,\n4}\nticks 3, max 4\ntitle t';
    const { statements } = parse(src);
    expect(statements.map((s) => [s.kind, src.slice(s.range.start, s.range.end)])).toEqual([
      ['header', 'radar-beta'],
      ['axis', 'axis A, B'],
      ['curve', 'curve c{1, 2}, d{3,\n4}'],
      ['option', 'ticks 3, max 4'],
      ['title', 'title t'],
    ]);
  });

  it('maps ranges to the source through CRLF, comments and directives', () => {
    const src = '%%{init: {}}%%\r\nradar-beta\r\n%% c\r\naxis A["x"]\r\ncurve c{\r\n%% c\r\n1}';
    const { ast, diagnostics } = parse(src);
    expect(diagnostics).toEqual([]);
    expect(ast.children.map((n) => src.slice(n.range.start, n.range.end))).toEqual([
      'radar-beta',
      'A["x"]',
      'c{\r\n%% c\r\n1}',
    ]);
  });
});
