/**
 * The pie custom layout (spec #288 T3, `layoutKind: 'custom'`): `PieModel` in, `PieLayout` out.
 * It follows v12's `pieRenderer.ts` with the drawing taken out: every label is measured first
 * through the injected measurer, then the pie, the legend and the title are placed on v12's
 * 450 px canvas, and the bounds grow wherever v12 clipped (D224). Every length comes from the
 * metrics table (pitfall 13).
 *
 * v12 bugs fixed on the way: no sections no longer writes NaN legend offsets (`Math.max()` of
 * nothing), and an empty `highlightSlice` highlights nothing, even a slice labelled `""`.
 */
import type { PieDiagramConfig } from '@mermaid-js/core/config';
import type { RenderContext } from '@mermaid-js/core';
import {
  layoutLabel,
  markdownString,
  type FontKey,
  type MeasuredLabel,
} from '@mermaid-js/core/text';
import type { PieModel } from '../model.ts';
import { pieSum } from '../shares.ts';
import { centroid, pieAngles } from './arc.ts';
import {
  MIN_PERCENT,
  NORMAL_WEIGHT,
  PERCENT,
  PIE_COLOURS as COLOURS,
  PIE_METRICS as m,
  PIE_OPTIONS,
} from './metrics.ts';
import type { PieLayout, PieLegendRow, PieSliceLayout, PlacedLabel, Point } from './types.ts';
import { RectUnion } from '@mermaid-js/shared/layout';

/** What the layout reads from the render context. */
export type PieLayoutContext = Pick<RenderContext, 'config' | 'measurer' | 'theme'> &
  Partial<Pick<RenderContext, 'inline'>>;

type LegendPosition = 'top' | 'bottom' | 'left' | 'right' | 'center';
const POSITIONS: ReadonlySet<string> = new Set(['top', 'bottom', 'left', 'right', 'center']);

/** Lays out a pie chart in px. */
export function layoutPie(model: PieModel, ctx: PieLayoutContext): PieLayout {
  const family = ctx.theme.value('fontFamily');
  const font = (size: number): FontKey => ({ family, size, weight: NORMAL_WEIGHT });
  const fonts = {
    title: font(ctx.theme.number('pieTitleTextSize')),
    section: font(ctx.theme.number('pieSectionTextSize')),
    legend: font(ctx.theme.number('pieLegendTextSize')),
  };
  // Title and legend go through core's label layout (D225), unwrapped as v12 drew them; a
  // markdown string (core's `markdownString`, D710) is laid out as markdown, without its
  // backticks. `suffix` is plain text.
  const inline = ctx.inline ? { inline: ctx.inline } : {};
  const measure = (text: string, f: FontKey, suffix = ''): MeasuredLabel => {
    const { text: source, markup } = markdownString(text);
    return layoutLabel(source + suffix, f, Infinity, ctx.measurer, { ...inline, markup });
  };

  const outerStrokeWidth = ctx.theme.number('pieOuterStrokeWidth');
  const strokeWidth = ctx.theme.number('pieStrokeWidth');
  const { textPosition, donut, position, highlight, hover } = optionsOf(ctx.config.pie ?? {});

  // Measure first: legend rows, then the title.
  const { sections } = model;
  const legendText = sections.map((s) =>
    measure(s.label, fonts.legend, model.showData ? ` [${s.value}]` : '')
  );
  let longest = 0;
  for (const t of legendText) if (t.width > longest) longest = t.width;
  const title = model.title === undefined ? undefined : measure(model.title, fonts.title);

  // A row is v12's 22 px, and taller by the extra lines of its label (D225). A legend taller
  // than the canvas breaks into columns of the canvas height, except over the pie (D616).
  const pitches = legendText.map((t) => m.row + extraLines(t));
  const columns = legendColumns(pitches, position === 'center' ? Infinity : m.height);
  const columnPitch = m.legendTextX + longest + m.columnGap;
  const spread = (columns.count - 1) * columnPitch;

  const middle = m.width / 2;
  const { rowX, rowY, shift, chartWidth, chartHeight } = legendPlace(position, {
    height: columns.height,
    longest,
    spread,
  });
  const center: Point = { x: middle + shift.x, y: m.height / 2 + shift.y };

  // Slices: under 1% of the sum dropped, the rest fill the circle (D223); percentages over the
  // sum of all sections, which never overflows (D226).
  const { unit, sum } = pieSum(sections.map((s) => s.value));
  const share = (v: number): number => (v / unit / sum) * PERCENT;
  const shown = sections
    .map((s, index) => ({ s, index }))
    .filter(({ s }) => share(s.value) >= MIN_PERCENT);
  const angles = pieAngles(shown.map(({ s }) => s.value / unit));
  const textRadius = m.radius * textPosition;
  const slices: PieSliceLayout[] = shown.map(({ s, index }, i) => {
    const a = angles[i]!;
    const c = centroid(a, textRadius, textRadius);
    const anchor = { x: center.x + c.x, y: center.y + c.y };
    const text = measure(`${share(s.value).toFixed(0)}%`, fonts.section);
    return {
      index,
      ast: s.astId,
      label: s.label,
      value: s.value,
      startAngle: a.startAngle,
      endAngle: a.endAngle,
      colour: index % COLOURS,
      anchor,
      percent: placed(text, anchor.x - text.width / 2, anchor.y),
      highlighted: !hover && highlight !== '' && s.label === highlight,
    };
  });

  const top = m.height / 2 + rowY;
  let rowTop = top;
  const legend: PieLegendRow[] = sections.map((s, index) => {
    const column = columns.column[index]!;
    if (column !== columns.column[index - 1]) rowTop = top;
    const x = middle + rowX + column * columnPitch;
    const y = rowTop;
    rowTop += pitches[index]!;
    return {
      index,
      ast: s.astId,
      colour: index % COLOURS,
      swatch: { x, y, width: m.swatch, height: m.swatch },
      label: placed(legendText[index]!, x + m.legendTextX, y + m.legendTextY),
    };
  });

  // The title stays on the canvas centre, whatever moved the pie; over legend columns it
  // centres on the pie instead (D616). Its last line sits where v12's one line did, so extra
  // lines grow up, clear of the pie and the legend (D224 bounds).
  const titleX = columns.count > 1 ? center.x : middle;
  const titleBox =
    title && placed(title, titleX - title.width / 2, m.height / 2 - m.titleY - extraLines(title));

  const outerRadius = m.radius + outerStrokeWidth / 2;
  const box = new Box();
  // v12's viewBox: the chart and legend, widened only for the title.
  const titleWidth = title?.width ?? 0;
  box.add({ x: 0, y: 0, width: chartWidth, height: chartHeight });
  box.add({ x: titleX - titleWidth / 2, y: 0, width: titleWidth, height: 0 });
  // What is drawn: the outer circle, the slices (a highlighted one scaled), labels and swatches.
  box.circle(center, outerRadius + outerStrokeWidth / 2);
  box.circle(center, m.radius + strokeWidth / 2);
  if (slices.some((s) => s.highlighted))
    box.circle(center, (m.radius + strokeWidth / 2) * m.highlightScale);
  for (const s of slices) box.add(s.percent);
  for (const r of legend) {
    box.add(r.swatch);
    box.add(r.label);
  }
  if (titleBox) box.add(titleBox);

  return {
    center,
    radius: m.radius,
    innerRadius: donut * m.radius,
    textRadius,
    outerRadius,
    outerStrokeWidth,
    strokeWidth,
    slices,
    legend,
    ...(titleBox ? { title: titleBox } : {}),
    hover,
    highlightScale: m.highlightScale,
    fonts,
    bounds: box.rect(),
  };
}

interface Options {
  readonly textPosition: number;
  readonly donut: number;
  readonly position: LegendPosition;
  readonly highlight: string;
  readonly hover: boolean;
}

/** The `pie` options as v12 read them: a bad `donutHole` is 0, a bad `legendPosition` right. */
function optionsOf(pie: Readonly<PieDiagramConfig>): Options {
  const tp = pie.textPosition;
  const hole = pie.donutHole;
  const lp = pie.legendPosition;
  const highlight = typeof pie.highlightSlice === 'string' ? pie.highlightSlice : '';
  return {
    textPosition: typeof tp === 'number' && Number.isFinite(tp) ? tp : PIE_OPTIONS.textPosition,
    donut: typeof hole === 'number' && hole > 0 && hole <= PIE_OPTIONS.maxDonutHole ? hole : 0,
    position: typeof lp === 'string' && POSITIONS.has(lp) ? (lp as LegendPosition) : 'right',
    highlight,
    hover: highlight === 'hover',
  };
}

interface LegendPlace {
  /** The first row's top-left corner, from v12's canvas centre. */
  readonly rowX: number;
  readonly rowY: number;
  /** How far the pie moves from the canvas centre. */
  readonly shift: Point;
  /** v12's viewBox size before the title widened it. */
  readonly chartWidth: number;
  readonly chartHeight: number;
}

interface LegendColumns {
  /** Each row's column, from 0. */
  readonly column: readonly number[];
  readonly count: number;
  /** The tallest column's rows, in px. */
  readonly height: number;
}

/**
 * Rows `pitches` px tall, in order, into columns no taller than `limit` (D616); a row taller
 * than `limit` has a column to itself. A legend that fits is one column, as v12 drew it.
 */
function legendColumns(pitches: readonly number[], limit: number): LegendColumns {
  const column: number[] = [];
  let count = 1;
  let at = 0;
  let height = 0;
  for (const p of pitches) {
    if (at > 0 && at + p > limit) {
      count++;
      at = 0;
    }
    column.push(count - 1);
    at += p;
    if (at > height) height = at;
  }
  return { column, count, height };
}

/** The legend's size: its tallest column, its longest label, and every column but the last. */
interface LegendSize {
  readonly height: number;
  readonly longest: number;
  readonly spread: number;
}

/**
 * v12's legend offsets per position (`pieRenderer.ts` :195-251) for a column `height` px tall
 * (v12's `n * 22` when every label is one line), widened by the columns before the last (D616).
 */
function legendPlace(position: LegendPosition, size: LegendSize): LegendPlace {
  const { height: total, longest, spread } = size;
  const centred = -(spread + longest) / 2 - m.legendTextX;
  const side = m.width + m.margin + m.legendTextX + longest + spread;
  const middle = -total / 2;
  const none: Point = { x: 0, y: 0 };
  const base = { shift: none, chartWidth: m.width + m.margin, chartHeight: m.height };
  switch (position) {
    case 'center':
      return { ...base, rowX: centred, rowY: middle };
    case 'top':
      return {
        ...base,
        rowX: centred,
        rowY: -m.radius,
        shift: { x: 0, y: total + m.row },
        chartHeight: m.height + total,
      };
    case 'bottom':
      return { ...base, rowX: centred, rowY: m.radius + m.row, chartHeight: m.height + total };
    case 'left':
      return {
        ...base,
        rowX: -m.radius - m.legendTextX,
        rowY: middle,
        shift: { x: longest + m.legendTextX + spread, y: 0 },
        chartWidth: side,
      };
    case 'right':
      return { ...base, rowX: m.rightLegendX, rowY: middle, chartWidth: side };
  }
}

/** How much taller than one line a label is: 0 for one line (or none), as v12 drew every label. */
function extraLines(text: MeasuredLabel): number {
  return Math.max(0, text.height - text.lineHeight);
}

/** A label whose first baseline is at (`x`, `baseline`), its left edge at `x`. */
function placed(text: MeasuredLabel, x: number, baseline: number): PlacedLabel {
  return { x, y: baseline - text.baseline, width: text.width, height: text.height, text };
}

/** The union of what is drawn. */
class Box extends RectUnion {
  circle(c: Point, r: number): void {
    this.add({ x: c.x - r, y: c.y - r, width: 2 * r, height: 2 * r });
  }
}
