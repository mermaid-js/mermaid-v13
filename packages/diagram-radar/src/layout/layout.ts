/**
 * The radar custom layout (spec #422 T3, `layoutKind: 'custom'`): `RadarModel` in,
 * `RadarLayout` out. It follows v12's `renderer.ts` with the drawing taken out: every label is
 * measured first through the injected measurer and laid out by core's label layout (D355), then
 * the rings, spokes, curves, legend and title are placed where v12 put them, and the bounds grow
 * past v12's canvas wherever something drawn reaches out of it (D354). Lengths come from the
 * `radar` config, the theme and the metrics table (pitfall 13).
 *
 * v12 bugs fixed on the way (D356): `max = min` draws every point at the centre (v12 wrote NaN),
 * a curve whose entry count is not the axis count is skipped (v12 did so too), an entry past a
 * double (Infinity) lands at its clamp, and a polygon graticule with no axes draws no ring (v12
 * wrote `points=""`). The parser warns about the first two (`RADAR_EMPTY_RANGE`,
 * `RADAR_CURVE_SKIPPED`, with positions); the layout only guards against them.
 */
import type { RenderContext } from '@mermaid-js/core';
import { layoutLabel, type FontKey, type MeasuredLabel } from '@mermaid-js/core/text';
import { largestEntry, type RadarModel, type RadarOptions } from '../model.ts';
import { radarLayoutConfig, type RadarLayoutConfig } from '../config.ts';
import { closedRoundCurve, relativeRadius } from './curve.ts';
import { NORMAL_WEIGHT, RADAR_METRICS, RADAR_SLOTS } from './metrics.ts';
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
} from './types.ts';
import { RectUnion } from '@mermaid-js/shared/layout';

/** What the layout reads from the render context. */
export type RadarLayoutContext = Pick<RenderContext, 'config' | 'measurer' | 'theme'> &
  Partial<Pick<RenderContext, 'inline' | 'warn'>>;

const TAU = 2 * Math.PI;

/** For a layout run without a `warn` sink (unit tests, the invariants). */
const ignoreWarning = (): void => undefined;

/** The chart's polar frame (`:50-62`): spoke `i` of `n` at `angle(i)`, clockwise from 12 o'clock. */
interface Frame {
  readonly center: Point;
  readonly radius: number;
  /** The axis count. */
  readonly n: number;
  angle(i: number): number;
  /** The point `r` from the centre along `angle`. */
  toward(angle: number, r: number): Point;
}

function frameOf(config: RadarLayoutConfig, n: number): Frame {
  const center: Point = {
    x: config.marginLeft + config.width / 2,
    y: config.marginTop + config.height / 2,
  };
  return {
    center,
    radius: Math.min(config.width, config.height) / 2,
    n,
    angle: (i) => (TAU * i) / n - Math.PI / 2,
    toward: (angle, r) => ({
      x: center.x + r * Math.cos(angle),
      y: center.y + r * Math.sin(angle),
    }),
  };
}

/** Lays out a radar chart in px. */
export function layoutRadar(model: RadarModel, ctx: RadarLayoutContext): RadarLayout {
  const config = radarLayoutConfig(
    ctx.config.radar as Readonly<Record<string, unknown>> | undefined,
    ctx.warn ?? ignoreWarning
  );
  const { theme } = ctx;
  const family = theme.value('fontFamily');
  const font = (size: number): FontKey => ({ family, size, weight: NORMAL_WEIGHT });
  const fonts = {
    axis: font(theme.number('radarAxisLabelFontSize')),
    legend: font(theme.number('radarLegendFontSize')),
    title: font(theme.number('fontSize')),
  };
  const strokes = {
    axis: theme.number('radarAxisStrokeWidth'),
    curve: theme.number('radarCurveStrokeWidth'),
    graticule: theme.number('radarGraticuleStrokeWidth'),
  };
  const inline = ctx.inline ? { inline: ctx.inline } : {};
  const measure = (text: string, labelFont: FontKey): MeasuredLabel => {
    const md = markdownString(text);
    return md === undefined
      ? layoutLabel(text, labelFont, Infinity, ctx.measurer, inline)
      : layoutLabel(md, labelFont, Infinity, ctx.measurer, { ...inline, markdown: true });
  };

  // Measure first: axis labels, legend rows, the title.
  const axisText = model.axes.map((axis) => measure(axis.label, fonts.axis));
  const legendText = model.options.showLegend
    ? model.curves.map((curve) => measure(curve.label, fonts.legend))
    : [];
  const titleText = model.title === undefined ? undefined : measure(model.title, fonts.title);

  const frame = frameOf(config, model.axes.length);
  const { center, radius } = frame;
  const { graticule } = model.options;
  const ticks = ticksOf(model.options.ticks);
  const rings = ringsOf(graticule, ticks, frame);

  const axisLength = radius * config.axisScaleFactor;
  const labelRadius = radius * config.axisLabelFactor + RADAR_METRICS.labelPad;
  const spokes: RadarSpoke[] = model.axes.map((axis, i) => {
    const angle = frame.angle(i);
    const textAnchor = side<RadarTextAnchor>(Math.cos(angle), 'start', 'end', 'middle');
    const baseline = side<RadarBaseline>(Math.sin(angle), 'hanging', 'auto', 'central');
    const anchor = frame.toward(angle, labelRadius);
    return {
      index: i,
      ast: axis.astId,
      angle,
      end: frame.toward(angle, axisLength),
      anchor,
      textAnchor,
      baseline,
      label: placeAt(axisText[i]!, anchor, textAnchor, baseline),
    };
  });

  // Curves (`:140-173`): the range over every entry of every curve, drawn or not. A curve
  // whose entry count is not the axis count is left out (`RADAR_CURVE_SKIPPED`, the parser's).
  const { min } = model.options;
  const max = model.options.max ?? largestEntry(model.curves);
  const curves: RadarCurveLayout[] = [];
  model.curves.forEach((curve, index) => {
    if (frame.n === 0 || curve.entries.length !== frame.n) return;
    const points = curve.entries.map((entry, i) =>
      frame.toward(frame.angle(i), relativeRadius(entry.value, min, max, radius))
    );
    curves.push({
      index,
      ast: curve.astId,
      slot: index % RADAR_SLOTS,
      points,
      segments: graticule === 'circle' ? closedRoundCurve(points, config.curveTension) : [],
    });
  });

  const legend = legendOf({
    model,
    labels: legendText,
    config,
    center,
    swatchSize: theme.number('radarLegendBoxSize'),
  });
  // The title (`:41-45`): middle-anchored at the canvas top, `hanging`.
  const title = titleText && placeAt(titleText, { x: center.x, y: 0 }, 'middle', 'hanging');

  const box = new Box();
  box.add({
    x: 0,
    y: 0,
    width: config.width + config.marginLeft + config.marginRight,
    height: config.height + config.marginTop + config.marginBottom,
  });
  const ringStroke = strokes.graticule / 2;
  for (const ring of rings)
    if (ring.points.length === 0) box.addDisc(center, ring.radius + ringStroke);
    else for (const corner of ring.points) box.addDisc(corner, ringStroke);
  for (const spoke of spokes) {
    box.addDisc(center, strokes.axis / 2);
    box.addDisc(spoke.end, strokes.axis / 2);
    box.add(spoke.label);
  }
  // A Bézier segment stays inside the hull of its control points.
  for (const curve of curves) {
    for (const point of curve.points) box.addDisc(point, strokes.curve / 2);
    for (const segment of curve.segments) {
      box.addDisc(segment.c1, strokes.curve / 2);
      box.addDisc(segment.c2, strokes.curve / 2);
    }
  }
  for (const row of legend) {
    box.add(row.swatch);
    box.add(row.label);
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

/**
 * The ticks to draw rings for: the model's, which the parser holds at 32 at most
 * (`RADAR_TICKS_CLAMPED`); none for a negative or non-finite count (a hand-built model).
 */
function ticksOf(ticks: number): number {
  return Number.isFinite(ticks) && ticks > 0 ? ticks : 0;
}

/** v12 `drawGraticule` (`:64-93`): ring `k` (1…⌈ticks⌉) at `radius · k / ticks`. */
function ringsOf(graticule: RadarOptions['graticule'], ticks: number, frame: Frame): RadarRing[] {
  if (graticule === 'polygon' && frame.n === 0) return [];
  const rings: RadarRing[] = [];
  for (let k = 1; k <= Math.ceil(ticks); k++) {
    const r = (frame.radius * k) / ticks;
    const points =
      graticule === 'circle'
        ? []
        : Array.from({ length: frame.n }, (_, i) => frame.toward(frame.angle(i), r));
    rings.push({ radius: r, points });
  }
  return rings;
}

/** What the legend is placed from. */
interface LegendParts {
  readonly model: RadarModel;
  /** The measured legend labels, one per curve (none without `showLegend`). */
  readonly labels: readonly MeasuredLabel[];
  readonly config: RadarLayoutConfig;
  readonly center: Point;
  /** `radarLegendBoxSize`. */
  readonly swatchSize: number;
}

/**
 * v12 `drawLegend` (`:209-244`): row `i` at `(¾(w/2 + mR), −¾(h/2 + mT) + 20·i)` from the
 * centre, its swatch there and its text `legendTextGap` right of the swatch (16 px from the
 * row's origin with v12's 12 px swatch), `hanging`. A label of several lines (D355) pushes
 * the rows after it down by its extra lines.
 */
function legendOf(parts: LegendParts): RadarLegendRow[] {
  const { model, labels, config, center, swatchSize: size } = parts;
  const { legendFactor, legendTextGap, legendRow } = RADAR_METRICS;
  const x = center.x + legendFactor * (config.width / 2 + config.marginRight);
  let y = center.y - legendFactor * (config.height / 2 + config.marginTop);
  return labels.map((label, index) => {
    const row: RadarLegendRow = {
      index,
      ast: model.curves[index]!.astId,
      slot: index % RADAR_SLOTS,
      swatch: { x, y, width: size, height: size },
      label: {
        x: x + size + legendTextGap,
        y,
        width: label.width,
        height: label.height,
        text: label,
      },
    };
    y += legendRow + extraLines(label);
    return row;
  });
}

/** v12's three-way choice by `cos θ` or `sin θ` (`:116-117`), with its ±0.01 dead band. */
function side<T>(v: number, positive: T, negative: T, near: T): T {
  if (v > RADAR_METRICS.anchorThreshold) return positive;
  if (v < -RADAR_METRICS.anchorThreshold) return negative;
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
class Box extends RectUnion {
  /** The square around the disc of radius `r` about `center`. */
  addDisc(center: Point, r: number): void {
    this.add({ x: center.x - r, y: center.y - r, width: 2 * r, height: 2 * r });
  }
}
