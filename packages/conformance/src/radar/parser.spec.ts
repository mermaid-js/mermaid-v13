import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRadar } from '@mermaid-js/diagram-radar';
import type { RadarCurveNode } from '@mermaid-js/diagram-radar';
import { REPO_ROOT } from '../corpus.ts';

/**
 * The radar parser and model (#446) on the multi-line fixtures
 * `e2e/diagrams/radar/nightly-check/parser-*.mmd` and the cases of `corpus/radar-cases.json`:
 * v12's value conversion and DB resolution, AST ids (DESIGN §4.2), D356's warnings, symbols
 * (D358), statement spans and source ranges. Accept/reject and model parity are
 * `parity.spec.ts`'s.
 */
const parse = (src: string) => parseRadar(src);
const errors = (src: string) =>
  parse(src)
    .diagnostics.filter((d) => d.severity === 'error')
    .map((d) => d.code);
const fixture = (name: string) =>
  readFileSync(join(REPO_ROOT, `e2e/diagrams/radar/nightly-check/${name}.mmd`), 'utf8');
const radarCase = (id: string): string => {
  const cases = JSON.parse(
    readFileSync(join(REPO_ROOT, 'packages/conformance/corpus/radar-cases.json'), 'utf8')
  ) as { id: string; source: string }[];
  const found = cases.find((c) => c.id === `radar-cases/${id}`);
  if (!found) throw new Error(`no radar case ${id}`);
  return found.source;
};

describe('radar parser on the fixtures', () => {
  it('reads axes, curves, options, title and accessibility', () => {
    const { model, diagnostics } = parse(fixture('parser-model'));
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
      titleAstId: 'title',
      accTitle: 'Radar accTitle',
      accDescr: 'Radar accDescription',
      warnings: [],
    });
    expect(Object.isFrozen(model)).toBe(true);
    expect(Object.isFrozen(model.curves[0]?.entries)).toBe(true);
    expect(errors('radar-beta\naxis A,\nB')).toEqual(['UNEXPECTED']);
  });

  it('gives AST ids to every statement and entry, repeats with @n', () => {
    const { ast } = parse(fixture('parser-ast-ids'));
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
    const { model, diagnostics } = parse(fixture('parser-curves-before-axes'));
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

  it("reports v12's DB throws at the curve, with its messages; the curve stays", () => {
    const src = radarCase('parser-missing-entry-label');
    const { model, diagnostics } = parse(src);
    expect(
      diagnostics.map((d) => [d.code, d.message, src.slice(d.range.start, d.range.end)])
    ).toEqual([['RADAR_MISSING_ENTRY', 'Missing entry for axis Beta', 'c{A 1}']]);
    expect(model.curves.map((c) => [c.name, c.entries.length])).toEqual([['c', 1]]);
    const none = parse('radar-beta\ncurve c{A: 1}').diagnostics;
    expect(none.map((d) => [d.code, d.message])).toEqual([
      ['RADAR_NO_AXES', 'Axes must be populated before curves for reference entries'],
    ]);
  });

  it('warns once about entries that name no axis, the others related (D356)', () => {
    const src = fixture('parser-unknown-axes');
    const { model, diagnostics } = parse(src);
    expect(diagnostics).toHaveLength(1);
    const [d] = diagnostics;
    expect(d?.severity).toBe('warning');
    expect(d?.code).toBe('RADAR_UNKNOWN_AXIS');
    expect(src.slice(d?.range.start, d?.range.end)).toBe('X');
    expect(d?.related?.map((r) => src.slice(r.range.start, r.range.end))).toEqual([
      'c{A 1, X 2}',
      'Y',
    ]);
    expect(model.warnings).toEqual(diagnostics);
    expect(model.curves.map((c) => c.entries.map((e) => e.value))).toEqual([[1], [4]]);
  });

  it('resolves options as v12 did: the last of each, ticks clamped to 32 with a warning', () => {
    const { model, diagnostics } = parse(fixture('parser-options-last-wins'));
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

  it('converts labels as Langium did: either quote, escapes, line breaks, untrimmed', () => {
    const { model } = parse(fixture('parser-label-escapes'));
    expect(model.axes.map((a) => a.label)).toEqual(['a"b', "c'd", ' e\nf ', 'g\nh']);
    expect(model.curves[0]?.label).toBe('x');
  });

  it('records axis symbols (definition, repeats and entries as references, none for an entry naming no axis) and curves (D358)', () => {
    const { symbols } = parse(fixture('parser-symbols'));
    expect(symbols.map((s) => [s.kind, s.name, s.role])).toEqual([
      ['axis', 'A', 'def'],
      ['axis', 'B', 'def'],
      ['axis', 'A', 'ref'],
      ['axis', 'A', 'ref'],
      ['curve', 'c', 'def'],
      ['curve', 'd', 'def'],
    ]);
  });

  it('records statement spans', () => {
    const src = fixture('parser-statements');
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
    const src = fixture('parser-source-ranges').replace(/\n/g, '\r\n');
    const { ast, diagnostics } = parse(src);
    expect(diagnostics).toEqual([]);
    expect(ast.children.map((n) => src.slice(n.range.start, n.range.end))).toEqual([
      'radar-beta',
      'A["x"]',
      'c{\r\n%% c\r\n1}',
    ]);
  });
});
