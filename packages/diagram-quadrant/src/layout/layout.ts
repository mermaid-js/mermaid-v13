/**
 * The quadrant layout (spec #289 T3): a pure port of v12's `quadrantBuilder.ts` `build()`, over
 * a `QuadrantModel` and the resolved `quadrantChart` config. Every length comes from the config
 * (pitfall 13; `quadrant-layout-literals.spec.ts` in conformance checks it); units are px (D216).
 */
import type { Warning } from '@mermaid-js/core';
import type { QuadrantModel, QuadrantPoint, QuadrantStyles, QuadrantText } from '../model.ts';
import type {
  QuadrantAxisLabel,
  QuadrantBorder,
  QuadrantLayout,
  QuadrantLayoutConfig,
  QuadrantLayoutPoint,
  QuadrantRect,
} from './types.ts';

/** v12's `calculateSpace`: the square the quadrants tile. */
interface Square {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  /** The title band's height, 0 without a title. */
  readonly titleSpace: number;
}

const NO_TEXT = { text: '', markdown: false } as const;

function square(
  c: QuadrantLayoutConfig,
  xAxisSide: QuadrantLayoutConfig['xAxisPosition'],
  showXAxis: boolean,
  showYAxis: boolean,
  showTitle: boolean
): Square {
  const xAxisSpace = showXAxis ? c.xAxisLabelPadding * 2 + c.xAxisLabelFontSize : 0;
  const yAxisSpace = showYAxis ? c.yAxisLabelPadding * 2 + c.yAxisLabelFontSize : 0;
  const xTop = xAxisSide === 'top' ? xAxisSpace : 0;
  const xBottom = xAxisSide === 'bottom' ? xAxisSpace : 0;
  const yLeft = c.yAxisPosition === 'left' ? yAxisSpace : 0;
  const yRight = c.yAxisPosition === 'right' ? yAxisSpace : 0;
  const titleSpace = showTitle ? c.titleFontSize + c.titlePadding * 2 : 0;
  return {
    left: c.quadrantPadding + yLeft,
    top: c.quadrantPadding + xTop + titleSpace,
    // Clamped: a small chart (schema-valid) left v12 a negative size, an invalid `<rect>`.
    width: Math.max(0, c.chartWidth - c.quadrantPadding * 2 - yLeft - yRight),
    height: Math.max(0, c.chartHeight - c.quadrantPadding * 2 - xTop - xBottom - titleSpace),
    titleSpace,
  };
}

/** v12's `getQuadrants`: q1 top right, q2 top left, q3 bottom left, q4 bottom right. */
function quadrants(
  model: QuadrantModel,
  c: QuadrantLayoutConfig,
  s: Square,
  hasPoints: boolean
): QuadrantRect[] {
  const halfW = s.width / 2;
  const halfH = s.height / 2;
  const corners = [
    [s.left + halfW, s.top],
    [s.left, s.top],
    [s.left, s.top + halfH],
    [s.left + halfW, s.top + halfH],
  ] as const;
  return corners.map(([x, y], i): QuadrantRect => {
    const label = model.quadrants[i];
    return {
      quadrant: (i + 1) as QuadrantRect['quadrant'],
      ...(label ? { ast: label.ast } : {}),
      x,
      y,
      width: halfW,
      height: halfH,
      text: {
        label: label ? { text: label.text, markdown: label.markdown } : NO_TEXT,
        x: x + halfW / 2,
        // Centred in an empty chart; at the top once points could cover the centre.
        y: hasPoints ? y + c.quadrantTextTopPadding : y + halfH / 2,
        fontSize: c.quadrantLabelFontSize,
        anchor: 'middle',
        baseline: hasPoints ? 'hanging' : 'middle',
        rotation: 0,
      },
    };
  });
}

/** v12's `getBorders`: the outer lines meet at the corners by overhanging half their stroke. */
function borders(c: QuadrantLayoutConfig, s: Square): QuadrantBorder[] {
  const half = c.quadrantExternalBorderStrokeWidth / 2;
  const right = s.left + s.width;
  const bottom = s.top + s.height;
  const midX = s.left + s.width / 2;
  const midY = s.top + s.height / 2;
  const external = (x1: number, y1: number, x2: number, y2: number): QuadrantBorder => ({
    kind: 'external',
    x1,
    y1,
    x2,
    y2,
    strokeWidth: c.quadrantExternalBorderStrokeWidth,
  });
  const internal = (x1: number, y1: number, x2: number, y2: number): QuadrantBorder => ({
    kind: 'internal',
    x1,
    y1,
    x2,
    y2,
    strokeWidth: c.quadrantInternalBorderStrokeWidth,
  });
  return [
    external(s.left - half, s.top, right + half, s.top),
    external(right, s.top + half, right, bottom - half),
    external(s.left - half, bottom, right + half, bottom),
    external(s.left, s.top + half, s.left, bottom - half),
    internal(midX, s.top + half, midX, bottom - half),
    internal(s.left + half, midY, right - half, midY),
  ];
}

/** The degrees v12 turns y-axis labels by. */
const Y_LABEL_ROTATION = -90;

/** A label v12 shows: one with text. */
const shown = (t: QuadrantText | undefined): t is QuadrantText => !!t?.text;

/**
 * v12's `getAxisLabels`. With an end label, both labels are centred in their halves; a lone start
 * label is start-anchored at the square's edge.
 */
function axisLabels(
  model: QuadrantModel,
  c: QuadrantLayoutConfig,
  s: Square,
  xAxisSide: QuadrantLayoutConfig['xAxisPosition']
): QuadrantAxisLabel[] {
  const out: QuadrantAxisLabel[] = [];
  const halfW = s.width / 2;
  const halfH = s.height / 2;
  const x = model.xAxis;
  if (x) {
    const middle = shown(x.end);
    const y =
      xAxisSide === 'top'
        ? c.xAxisLabelPadding + s.titleSpace
        : c.xAxisLabelPadding + s.top + s.height + c.quadrantPadding;
    const at = (label: QuadrantText, end: 'start' | 'end', from: number): QuadrantAxisLabel => ({
      axis: 'x',
      end,
      side: xAxisSide,
      ast: end === 'end' ? `${x.ast}/end` : x.ast,
      text: {
        label,
        x: from + (middle ? halfW / 2 : 0),
        y,
        fontSize: c.xAxisLabelFontSize,
        anchor: middle ? 'middle' : 'start',
        baseline: 'hanging',
        rotation: 0,
      },
    });
    if (shown(x.start)) out.push(at(x.start, 'start', s.left));
    if (shown(x.end)) out.push(at(x.end, 'end', s.left + halfW));
  }
  const y = model.yAxis;
  if (y) {
    const middle = shown(y.end);
    const xAt =
      c.yAxisPosition === 'left'
        ? c.yAxisLabelPadding
        : c.yAxisLabelPadding + s.left + s.width + c.quadrantPadding;
    const at = (label: QuadrantText, end: 'start' | 'end', from: number): QuadrantAxisLabel => ({
      axis: 'y',
      end,
      side: c.yAxisPosition,
      ast: end === 'end' ? `${y.ast}/end` : y.ast,
      text: {
        label,
        x: xAt,
        y: from - (middle ? halfH / 2 : 0),
        fontSize: c.yAxisLabelFontSize,
        anchor: middle ? 'middle' : 'start',
        baseline: 'hanging',
        rotation: Y_LABEL_ROTATION,
      },
    });
    if (shown(y.start)) out.push(at(y.start, 'start', s.top + s.height));
    if (shown(y.end)) out.push(at(y.end, 'end', s.top + halfH));
  }
  return out;
}

/**
 * A lexed coordinate as v12's d3 scale read it (`+text`), or NaN. The lexer lets `0x5` (5) and
 * `0a5` (NaN) through; neither is in [0, 1].
 */
function coordinate(text: string): number {
  const v = text.trim() === '' ? Number.NaN : Number(text);
  return v >= 0 && v <= 1 ? v : Number.NaN;
}

/** d3's `scaleLinear().domain([0, 1]).range([a, b])`, as v12 used it. */
const scale = (a: number, b: number, t: number): number => a * (1 - t) + b * t;

/** A colour as written, with the `#` v12 let authors leave out (D235). */
const hex = (colour: string): string => (colour.startsWith('#') ? colour : `#${colour}`);

/** v12's `getQuadrantPoints`; a point whose coordinates are not in [0, 1] is left out (D226). */
function points(
  model: QuadrantModel,
  c: QuadrantLayoutConfig,
  s: Square,
  warn: ((w: Warning) => void) | undefined
): QuadrantLayoutPoint[] {
  const out: QuadrantLayoutPoint[] = [];
  for (const p of model.points) {
    const tx = coordinate(p.x);
    const ty = coordinate(p.y);
    if (Number.isNaN(tx) || Number.isNaN(ty)) {
      warn?.(invalid(p));
      continue;
    }
    const cls = p.className === undefined ? undefined : model.classes.get(p.className)?.styles;
    const style: QuadrantStyles = { ...cls, ...p.styles };
    const cx = scale(s.left, s.left + s.width, tx);
    const cy = scale(s.top + s.height, s.top, ty);
    out.push({
      ast: p.ast,
      cx,
      cy,
      radius: style.radius ?? c.pointRadius,
      ...(style.color === undefined ? {} : { fill: hex(style.color) }),
      ...(style.strokeColor === undefined ? {} : { stroke: hex(style.strokeColor) }),
      strokeWidth: style.strokeWidth ?? 0,
      text: {
        label: p.label,
        x: cx,
        y: cy + c.pointTextPadding,
        fontSize: c.pointLabelFontSize,
        anchor: 'middle',
        baseline: 'hanging',
        rotation: 0,
      },
    });
  }
  return out;
}

const invalid = (p: QuadrantPoint): Warning => ({
  code: 'QUADRANT_POINT_INVALID',
  message: `Left out point "${p.label.text}": its coordinates [${p.x}, ${p.y}] are not numbers from 0 to 1`,
  astIds: [p.ast],
});

/**
 * Lay out `model` with the resolved `quadrantChart` options `config`. `warn` gets one
 * `QUADRANT_POINT_INVALID` per point left out (D226).
 */
export function layoutQuadrant(
  model: QuadrantModel,
  config: QuadrantLayoutConfig,
  warn?: (w: Warning) => void
): QuadrantLayout {
  // Every point counts, drawn or not: v12 moved the axis and the quadrant labels for a point
  // it then drew off the chart, so the visible result stays v12's (D226).
  const hasPoints = model.points.length > 0;
  const showXAxis = shown(model.xAxis?.start) || shown(model.xAxis?.end);
  const showYAxis = shown(model.yAxis?.start) || shown(model.yAxis?.end);
  const title = model.title ?? '';
  const showTitle = title !== '';
  // v12 moves the x axis below the square once there is any point (spec #289 §Layout).
  const xAxisSide = hasPoints ? 'bottom' : config.xAxisPosition;
  const s = square(config, xAxisSide, showXAxis, showYAxis, showTitle);
  return {
    width: config.chartWidth,
    height: config.chartHeight,
    quadrants: quadrants(model, config, s, hasPoints),
    borders: borders(config, s),
    axisLabels: axisLabels(model, config, s, xAxisSide),
    points: points(model, config, s, warn),
    ...(showTitle
      ? {
          title: {
            ...(model.titleAst === undefined ? {} : { ast: model.titleAst }),
            label: { text: title, markdown: false },
            x: config.chartWidth / 2,
            y: config.titlePadding,
            fontSize: config.titleFontSize,
            anchor: 'middle' as const,
            baseline: 'hanging' as const,
            rotation: 0,
          },
        }
      : {}),
  };
}
