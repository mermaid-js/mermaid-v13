import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Warning } from '@mermaid-js/core';
import {
  layoutQuadrant,
  parseQuadrant,
  quadrantLayoutViolations,
  type QuadrantLayout,
  type QuadrantModel,
  type QuadrantTextAnchor,
} from '@mermaid-js/diagram-quadrant';
import { REPO_ROOT, corpusFromDir } from '../corpus.ts';
import type { CorpusItem } from '../types.ts';
import {
  v12Quadrant,
  v13QuadrantConfig,
  type V12QuadrantData,
  type V12QuadrantText,
} from './v12.ts';

/**
 * Builder parity (spec #289 T3): `layoutQuadrant` equals v12's `getQuadrantData()` to 0.01 px on
 * rects, lines, text anchors, radii and styled point paints, over the corpus and the cases below.
 * Theme colours are left out: the oracle's default point fill is `hsl(240, 100%, NaN%)` (D231),
 * and v13 reads them from the theme. The models are the v13 parser's (#301), so the layout
 * invariants also run on parser-produced fixtures (T3's done-when).
 *
 * Paints: a point's fill and stroke are compared with v12's, `#` added (D235), where a style sets
 * them. v12's default (its `quadrantPointFill`, `hsl(240, 100%, NaN%)`) reads as `null`, the
 * layout's "use the theme".
 */
const EXTRA: CorpusItem[] = [
  {
    id: 'extra/single-arrow-labels',
    source: 'quadrantChart\n  x-axis Low -->\n  y-axis Bottom -->\n  P: [0.1, 0.9]\n',
  },
  {
    id: 'extra/top-axis-title-no-points',
    source: 'quadrantChart\n  title T\n  x-axis A --> B\n  y-axis C\n  quadrant-2 two\n',
  },
  {
    id: 'extra/non-square-bottom-right',
    source:
      '%%{init: {"quadrantChart": {"chartWidth": 700, "chartHeight": 300, "xAxisPosition": "bottom", "yAxisPosition": "right", "pointRadius": 3}}}%%\n' +
      'quadrantChart\n  title Wide\n  x-axis L --> R\n  y-axis B --> T\n  A: [0, 0]\n  B: [1, 1]\n  C: [0.33, 0.66]\n',
  },
  {
    id: 'extra/classes-repeats-unknown',
    source:
      'quadrantChart\n  A:::c1: [0.2, 0.2] radius: 12\n  A: [0.8, 0.8]\n  B:::nope: [0.5, 0.5]\n' +
      '  C:::c1: [0.4, 0.6] stroke-width: 2px\n  classDef c1 color: #ff0000, radius: 9, stroke-width: 4px\n  classDef c1 radius: 6\n',
  },
  {
    id: 'extra/zero-config',
    source:
      '%%{init: {"quadrantChart": {"quadrantPadding": 0, "titlePadding": 0, "pointRadius": 0, "pointTextPadding": 0, "xAxisLabelPadding": 0, "quadrantExternalBorderStrokeWidth": 0}}}%%\n' +
      'quadrantChart\n  title Z\n  x-axis L --> R\n  y-axis B\n  A: [0, 1]\n  B: [1, 0] color: 00ff00, stroke-color: abc\n',
  },
  {
    id: 'extra/axis-merge',
    source:
      'quadrantChart\n  x-axis A --> B\n  x-axis C\n  y-axis D --> E\n  y-axis F\n  P: [0.5, 0.5]\n',
  },
];

/** The v13 parser's model of `source`; it must parse without errors. */
function model(source: string): QuadrantModel {
  const result = parseQuadrant(source);
  const errors = result.diagnostics.filter((d) => d.severity === 'error');
  if (errors.length > 0) throw new Error(errors.map((d) => d.message).join('\n'));
  return result.model;
}

async function corpus(): Promise<CorpusItem[]> {
  const items: CorpusItem[] = [];
  const dir = 'e2e/diagrams/quadrant-chart';
  for await (const item of corpusFromDir(join(REPO_ROOT, dir), dir)) items.push(item);
  return [...items, ...EXTRA];
}

type Flat = Record<string, number | string>;

const anchor = (t: QuadrantTextAnchor) => ({
  text: t.label.text,
  x: t.x,
  y: t.y,
  fontSize: t.fontSize,
  anchor: t.anchor,
  baseline: t.baseline,
  rotation: t.rotation,
});

const v12Anchor = (t: V12QuadrantText) => ({
  text: t.text,
  x: t.x,
  y: t.y,
  fontSize: t.fontSize,
  anchor: t.verticalPos === 'left' ? 'start' : 'middle',
  baseline: t.horizontalPos === 'top' ? 'hanging' : 'middle',
  rotation: t.rotation,
});

/** The v13 layout, without theme colours, in v12's terms and order. */
const v13Shape = (l: QuadrantLayout) => ({
  quadrants: l.quadrants.map((q) => ({
    x: q.x,
    y: q.y,
    width: q.width,
    height: q.height,
    text: anchor(q.text),
  })),
  borders: l.borders.map(({ x1, y1, x2, y2, strokeWidth }) => ({ x1, y1, x2, y2, strokeWidth })),
  axisLabels: l.axisLabels.map((a) => anchor(a.text)),
  points: l.points.map((p) => ({
    x: p.cx,
    y: p.cy,
    radius: p.radius,
    fill: p.fill ?? null,
    stroke: p.stroke ?? null,
    strokeWidth: p.strokeWidth,
    text: anchor(p.text),
  })),
  title: l.title ? anchor(l.title) : null,
});

/** A v12 point paint: its NaN default is `null` (the theme's), a style's colour gets its `#`. */
const paint = (colour: string): string | null =>
  colour.includes('NaN') ? null : colour.startsWith('#') ? colour : `#${colour}`;

/** v12's builder output, without theme colours; points in source order (v12 prepends). */
const v12Shape = (d: V12QuadrantData) => ({
  quadrants: d.quadrants.map((q) => ({
    x: q.x,
    y: q.y,
    width: q.width,
    height: q.height,
    text: v12Anchor(q.text),
  })),
  borders: d.borderLines.map(({ x1, y1, x2, y2, strokeWidth }) => ({
    x1,
    y1,
    x2,
    y2,
    strokeWidth,
  })),
  axisLabels: d.axisLabels.map(v12Anchor),
  points: [...d.points].reverse().map((p) => ({
    x: p.x,
    y: p.y,
    radius: p.radius,
    fill: paint(p.fill),
    stroke: paint(p.strokeColor),
    strokeWidth: Number.parseFloat(p.strokeWidth),
    text: v12Anchor(p.text),
  })),
  title: d.title ? v12Anchor(d.title) : null,
});

/** `value` flattened to `path → leaf`. */
function flatten(value: unknown, path = '', out: Flat = {}): Flat {
  if (value === null || typeof value !== 'object') out[path] = value as number | string;
  else if (Array.isArray(value)) {
    out[`${path}.length`] = value.length;
    value.forEach((v, i) => flatten(v, `${path}[${i}]`, out));
  } else for (const [k, v] of Object.entries(value)) flatten(v, path ? `${path}.${k}` : k, out);
  return out;
}

/** Every leaf where `a` and `b` differ, numbers by more than 0.01. */
function differences(a: unknown, b: unknown): string[] {
  const fa = flatten(a);
  const fb = flatten(b);
  const out: string[] = [];
  for (const key of new Set([...Object.keys(fa), ...Object.keys(fb)])) {
    const x = fa[key];
    const y = fb[key];
    const same = typeof x === 'number' && typeof y === 'number' ? Math.abs(x - y) <= 0.01 : x === y;
    if (!same) out.push(`${key}: v13 ${String(x)}, v12 ${String(y)}`);
  }
  return out;
}

describe('quadrant layout parity with v12 getQuadrantData()', () => {
  it('equals v12 on the corpus and the extra cases, to 0.01 px', async () => {
    const items = await corpus();
    expect(items.length).toBe(14 + EXTRA.length);
    const problems: string[] = [];
    for (const item of items) {
      const v12 = await v12Quadrant(item.source);
      if (!v12.accepted) {
        problems.push(`${item.id}: v12 rejected it: ${v12.error}`);
        continue;
      }
      const warnings: Warning[] = [];
      const layout = layoutQuadrant(model(item.source), v13QuadrantConfig(item.source), (w) =>
        warnings.push(w)
      );
      for (const d of differences(v13Shape(layout), v12Shape(v12.data)))
        problems.push(`${item.id}: ${d}`);
      for (const v of quadrantLayoutViolations(layout)) problems.push(`${item.id}: ${v}`);
      for (const w of warnings) problems.push(`${item.id}: unexpected ${w.code}`);
    }
    expect(problems).toEqual([]);
  });

  it('leaves out the point v12 drew at x = 2455 (0x5), and keeps v12 for the rest (D226)', async () => {
    const source = 'quadrantChart\n  Bad: [0x5, 0.5]\n  Good: [0.5, 0.5]\n';
    const v12 = await v12Quadrant(source);
    if (!v12.accepted) throw new Error(v12.error);
    const warnings: Warning[] = [];
    const layout = layoutQuadrant(model(source), v13QuadrantConfig(source), (w) =>
      warnings.push(w)
    );
    const v12Points = [...v12.data.points].reverse();
    expect(v12Points[0]!.x).toBeCloseTo(2455, 2);
    expect(warnings.map((w) => [w.code, w.astIds])).toEqual([
      ['QUADRANT_POINT_INVALID', ['pt:Bad']],
    ]);
    expect(layout.points.map((p) => [p.ast, p.cx, p.cy])).toEqual([
      ['pt:Good', v12Points[1]!.x, v12Points[1]!.y],
    ]);
    expect(differences(v13Shape(layout).quadrants, v12Shape(v12.data).quadrants)).toEqual([]);
  });
});
