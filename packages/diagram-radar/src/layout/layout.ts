/**
 * The radar custom layout (spec #422 T3, `layoutKind: 'custom'`): `RadarModel` in,
 * `RadarLayout` out. It follows v12's `renderer.ts` with the drawing taken out: every label is
 * measured first through the injected measurer and laid out by core's label layout (D355), then
 * the rings, spokes, curves, legend and title are placed where v12 put them, and the bounds grow
 * past v12's canvas wherever something drawn reaches out of it (D354). Lengths come from the
 * `radar` config, the theme and the metrics table (pitfall 13).
 *
 * v12 bugs fixed on the way (D356): `max = min` draws every point at the centre (v12 wrote NaN,
 * `RADAR_EMPTY_RANGE`), a curve whose entry count is not the axis count is skipped with
 * `RADAR_CURVE_SKIPPED` (v12 skipped it silently), and a polygon graticule with no axes draws
 * no ring (v12 wrote `points=""`).
 */
import type { RenderContext, Warning } from '@mermaid-js/core';
import type { AstId } from '@mermaid-js/core/parser-kit';
import { layoutLabel, type FontKey, type MeasuredLabel } from '@mermaid-js/core/text';
import type { RadarModel } from '../model.ts';
import { radarLayoutConfig, radarThemeNumber, type RadarLayoutConfig } from '../stand-ins.ts';
import { closedRoundCurve, relativeRadius } from './curve.ts';
import { MAX_TICKS, NORMAL_WEIGHT, RADAR_METRICS as m, RADAR_SLOTS } from './metrics.ts';
import type {
  PlacedLabel,
  Point,
  RadarBaseline,
  RadarCurveLayout,
  RadarLayout,
  RadarLegendRow,
  RadarRing,
  RadarSpoke,
  RadarTextAnchor,
  Rect,
} from './types.ts';

/** What the layout reads from the render context. */
export type RadarLayoutContext = Pick<RenderContext, 'config' | 'measurer' | 'theme'> &
  Partial<Pick<RenderContext, 'inline' | 'warn'>>;

export const RADAR_CURVE_SKIPPED = 'RADAR_CURVE_SKIPPED';
export const RADAR_EMPTY_RANGE = 'RADAR_EMPTY_RANGE';

const TAU = 2 * Math.PI;

/** Lays out a radar chart in px. */
export function layoutRadar(model: RadarModel, ctx: RadarLayoutContext): RadarLayout {
  const c = radarLayoutConfig(ctx.config.radar as Readonly<Record<string, unknown>> | undefined);
  const family = ctx.theme.value('fontFamily');
  const font = (size: number): FontKey => ({ family, size, weight: NORMAL_WEIGHT });
  const fonts = {
    axis: font(radarThemeNumber('radarAxisLabelFontSize')),
    legend: font(radarThemeNumber('radarLegendFontSize')),
    title: font(ctx.theme.number('fontSize')),
  };
  const strokes = {
    axis: radarThemeNumber('radarAxisStrokeWidth'),
    curve: radarThemeNumber('radarCurveStrokeWidth'),
    graticule: radarThemeNumber('radarGraticuleStrokeWidth'),
  };
  const inline = ctx.inline ? { inline: ctx.inline } : {};
  const measure = (text: string, f: FontKey): MeasuredLabel => {
    const md = markdownString(text);
    return md === undefined
      ? layoutLabel(text, f, Infinity, ctx.measurer, inline)
      : layoutLabel(md, f, Infinity, ctx.measurer, { ...inline, markdown: true });
  };

  // Measure first: axis labels, legend rows, the title.
  const axisText = model.axes.map((a) => measure(a.label, fonts.axis));
  const showLegend = model.options.showLegend;
  const legendText = showLegend ? model.curves.map((cv) => measure(cv.label, fonts.legend)) : [];
  const titleText = model.title === undefined ? undefined : measure(model.title, fonts.title);

  // The frame (`:50-62`).
  const center: Point = { x: c.marginLeft + c.width / 2, y: c.marginTop + c.height / 2 };
  const radius = Math.min(c.width, c.height) / 2;
  const n = model.axes.length;
  const angle = (i: number): number => (TAU * i) / n - Math.PI / 2;
  const toward = (a: number, r: number): Point => ({
    x: center.x + r * Math.cos(a),
    y: center.y + r * Math.sin(a),
  });

  const { graticule } = model.options;
  const ticks = ticksOf(model.options.ticks);
  const rings = ringsOf(graticule, ticks, n, radius, angle, toward);

  const axisLength = radius * c.axisScaleFactor;
  const labelRadius = radius * c.axisLabelFactor + m.labelPad;
  const spokes: RadarSpoke[] = model.axes.map((a, i) => {
    const th = angle(i);
    const cos = Math.cos(th);
    const sin = Math.sin(th);
    const textAnchor = side<RadarTextAnchor>(cos, 'start', 'end', 'middle');
    const baseline = side<RadarBaseline>(sin, 'hanging', 'auto', 'central');
    const anchor = toward(th, labelRadius);
    return {
      index: i,
      ast: a.astId,
      angle: th,
      end: toward(th, axisLength),
      anchor,
      textAnchor,
      baseline,
      label: placeAt(axisText[i]!, anchor, textAnchor, baseline),
    };
  });

  // Curves (`:140-173`): the range over every entry of every curve, drawn or not.
  const { min } = model.options;
  const max = model.options.max ?? largest(model);
  const skipped: AstId[] = [];
  const curves: RadarCurveLayout[] = [];
  model.curves.forEach((cv, index) => {
    if (n === 0 || cv.entries.length !== n) {
      skipped.push(cv.astId);
      return;
    }
    const points = cv.entries.map((e, i) =>
      toward(angle(i), relativeRadius(e.value, min, max, radius))
    );
    curves.push({
      index,
      ast: cv.astId,
      slot: index % RADAR_SLOTS,
      points,
      segments: graticule === 'circle' ? closedRoundCurve(points, c.curveTension) : [],
    });
  });
  warnings(model, curves, skipped, min, max, ctx.warn);

  const legend = legendOf(model, legendText, c, center);
  // The title (`:41-45`): middle-anchored at the canvas top, `hanging`.
  const title = titleText && placeAt(titleText, { x: center.x, y: 0 }, 'middle', 'hanging');

  const box = new Box();
  box.add({
    x: 0,
    y: 0,
    width: c.width + c.marginLeft + c.marginRight,
    height: c.height + c.marginTop + c.marginBottom,
  });
  const g = strokes.graticule / 2;
  for (const r of rings)
    if (r.points.length === 0) box.circle(center, r.radius + g);
    else for (const p of r.points) box.circle(p, g);
  for (const s of spokes) {
    box.circle(center, strokes.axis / 2);
    box.circle(s.end, strokes.axis / 2);
    box.add(s.label);
  }
  // A Bézier segment stays inside the hull of its control points.
  for (const cv of curves) {
    for (const p of cv.points) box.circle(p, strokes.curve / 2);
    for (const s of cv.segments) {
      box.circle(s.c1, strokes.curve / 2);
      box.circle(s.c2, strokes.curve / 2);
    }
  }
  for (const r of legend) {
    box.add(r.swatch);
    box.add(r.label);
  }
  if (title) box.add(title);

  return {
    center,
    radius,
    axisLength,
    labelRadius,
    graticule,
    ticks,
    min,
    max,
    rings,
    spokes,
    curves,
    legend,
    ...(title ? { title } : {}),
    strokes,
    fonts,
    bounds: box.rect(),
  };
}

/** The ticks to draw rings for: v12's value, at most 32, and none for a value under 0 or NaN. */
function ticksOf(ticks: number): number {
  return Number.isFinite(ticks) && ticks > 0 ? Math.min(ticks, MAX_TICKS) : 0;
}

/** v12 `drawGraticule` (`:64-93`): ring `k` (1…⌈ticks⌉) at `radius · k / ticks`. */
function ringsOf(
  graticule: 'circle' | 'polygon',
  ticks: number,
  n: number,
  radius: number,
  angle: (i: number) => number,
  toward: (a: number, r: number) => Point
): RadarRing[] {
  if (graticule === 'polygon' && n === 0) return [];
  const rings: RadarRing[] = [];
  for (let k = 1; k <= Math.ceil(ticks); k++) {
    const r = (radius * k) / ticks;
    const points =
      graticule === 'circle' ? [] : Array.from({ length: n }, (_, i) => toward(angle(i), r));
    rings.push({ radius: r, points });
  }
  return rings;
}

/** The largest entry of any curve (v12 `Math.max` over all curves); 0 when there is none. */
function largest(model: RadarModel): number {
  let max = -Infinity;
  for (const cv of model.curves) for (const e of cv.entries) if (e.value > max) max = e.value;
  return max === -Infinity ? 0 : max;
}

/** One warning per kind per render (D356), naming every curve it is about. */
function warnings(
  model: RadarModel,
  curves: readonly RadarCurveLayout[],
  skipped: readonly AstId[],
  min: number,
  max: number,
  warn: ((w: Warning) => void) | undefined
): void {
  if (!warn) return;
  const n = model.axes.length;
  if (skipped.length > 0)
    warn({
      code: RADAR_CURVE_SKIPPED,
      message: `Left out ${skipped.length === 1 ? 'a curve' : `${skipped.length} curves`} whose entry count is not the axis count (${n})`,
      astIds: skipped,
    });
  if (max === min && curves.length > 0)
    warn({
      code: RADAR_EMPTY_RANGE,
      message: `max and min are both ${max}: every curve is drawn at the centre`,
      astIds: curves.map((cv) => cv.ast),
    });
}

/**
 * v12 `drawLegend` (`:209-244`): row `i` at `(¾(w/2 + mR), −¾(h/2 + mT) + 20·i)` from the
 * centre, its swatch there and its text 16 px right, `hanging`. A label of several lines
 * (D355) pushes the rows after it down by its extra lines.
 */
function legendOf(
  model: RadarModel,
  text: readonly MeasuredLabel[],
  c: RadarLayoutConfig,
  center: Point
): RadarLegendRow[] {
  const box = radarThemeNumber('radarLegendBoxSize');
  const x = center.x + m.legendFactor * (c.width / 2 + c.marginRight);
  let y = center.y - m.legendFactor * (c.height / 2 + c.marginTop);
  return text.map((t, index) => {
    const cv = model.curves[index]!;
    const row: RadarLegendRow = {
      index,
      ast: cv.astId,
      slot: index % RADAR_SLOTS,
      swatch: { x, y, width: box, height: box },
      label: { x: x + m.legendTextX, y, width: t.width, height: t.height, text: t },
    };
    y += m.legendRow + extraLines(t);
    return row;
  });
}

/** v12's three-way choice by `cos θ` or `sin θ` (`:116-117`), with its ±0.01 dead band. */
function side<T>(v: number, positive: T, negative: T, near: T): T {
  if (v > m.anchorThreshold) return positive;
  if (v < -m.anchorThreshold) return negative;
  return near;
}

/** How far left of the anchor a label's box starts, in label widths. */
const ANCHOR_SHIFT: Readonly<Record<RadarTextAnchor, number>> = { start: 0, middle: 1 / 2, end: 1 };

/**
 * A label's box for v12's `text-anchor` and `dominant-baseline` at `at`. One line sits as v12's
 * did; more lines (D355) grow away from the chart: down from a `hanging` top, up from an `auto`
 * baseline, both ways about a `central` one.
 */
function placeAt(
  text: MeasuredLabel,
  at: Point,
  anchor: RadarTextAnchor,
  baseline: RadarBaseline
): PlacedLabel {
  const x = at.x - ANCHOR_SHIFT[anchor] * text.width;
  let y = at.y - text.height / 2;
  if (baseline === 'hanging') y = at.y;
  else if (baseline === 'auto') y = at.y - text.baseline - extraLines(text);
  return { x, y, width: text.width, height: text.height, text };
}

/** How much taller than one line a label is: 0 for one line (or none). */
function extraLines(text: MeasuredLabel): number {
  return Math.max(0, text.height - text.lineHeight);
}

/**
 * The source of a markdown string (D355), written as in flowcharts: a backtick and a double
 * quote around it. A label comes without its quotes, so the backticks are enough.
 */
function markdownString(text: string): string | undefined {
  return RE_MARKDOWN.exec(text.trim())?.[2];
}
const RE_MARKDOWN = /^("?)`([^]*)`\1$/;

/** The union of what is drawn. */
class Box {
  private x0 = Infinity;
  private y0 = Infinity;
  private x1 = -Infinity;
  private y1 = -Infinity;
  add(r: Rect): void {
    this.x0 = Math.min(this.x0, r.x);
    this.y0 = Math.min(this.y0, r.y);
    this.x1 = Math.max(this.x1, r.x + r.width);
    this.y1 = Math.max(this.y1, r.y + r.height);
  }
  circle(c: Point, r: number): void {
    this.add({ x: c.x - r, y: c.y - r, width: 2 * r, height: 2 * r });
  }
  rect(): Rect {
    return { x: this.x0, y: this.y0, width: this.x1 - this.x0, height: this.y1 - this.y0 };
  }
}
