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
import { layoutLabel, type FontKey, type MeasuredLabel } from '@mermaid-js/core/text';
import type { PieModel } from '../model.ts';
import { centroid, pieAngles } from './arc.ts';
import {
  MIN_PERCENT,
  NORMAL_WEIGHT,
  PERCENT,
  PIE_COLOURS as COLOURS,
  PIE_METRICS as m,
  PIE_OPTIONS,
} from './metrics.ts';
import type { PieLayout, PieLegendRow, PieSliceLayout, PlacedLabel, Point, Rect } from './types.ts';

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
  // Title and legend go through core's label layout (D225), unwrapped as v12 drew them.
  const measure = (text: string, f: FontKey): MeasuredLabel =>
    layoutLabel(text, f, Infinity, ctx.measurer, ctx.inline ? { inline: ctx.inline } : {});

  const outerStrokeWidth = ctx.theme.number('pieOuterStrokeWidth');
  const strokeWidth = ctx.theme.number('pieStrokeWidth');
  const { textPosition, donut, position, highlight, hover } = optionsOf(ctx.config.pie ?? {});

  // Measure first: legend rows, then the title.
  const { sections } = model;
  const legendText = sections.map((s) =>
    measure(model.showData ? `${s.label} [${s.value}]` : s.label, fonts.legend)
  );
  let longest = 0;
  for (const t of legendText) if (t.width > longest) longest = t.width;
  const title = model.title === undefined ? undefined : measure(model.title, fonts.title);

  const middle = m.width / 2;
  const { rowX, rowY, shift, chartWidth, chartHeight } = legendPlace(
    position,
    sections.length,
    longest
  );
  const center: Point = { x: middle + shift.x, y: m.height / 2 + shift.y };

  // Slices: under 1% of the sum dropped, the rest fill the circle (D223); percentages over the
  // sum of all sections.
  let sum = 0;
  for (const s of sections) sum += s.value;
  const shown = sections
    .map((s, index) => ({ s, index }))
    .filter(({ s }) => (s.value / sum) * PERCENT >= MIN_PERCENT);
  const angles = pieAngles(shown.map(({ s }) => s.value));
  const textRadius = m.radius * textPosition;
  const slices: PieSliceLayout[] = shown.map(({ s, index }, i) => {
    const a = angles[i]!;
    const c = centroid(a, textRadius, textRadius);
    const anchor = { x: center.x + c.x, y: center.y + c.y };
    const text = measure(`${((s.value / sum) * PERCENT).toFixed(0)}%`, fonts.section);
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

  const legend: PieLegendRow[] = sections.map((s, index) => {
    const x = middle + rowX;
    const y = m.height / 2 + rowY + index * m.row;
    return {
      index,
      ast: s.astId,
      colour: index % COLOURS,
      swatch: { x, y, width: m.swatch, height: m.swatch },
      label: placed(legendText[index]!, x + m.legendTextX, y + m.legendTextY),
    };
  });

  // The title stays on the canvas centre, whatever moved the pie.
  const titleBox = title && placed(title, middle - title.width / 2, m.height / 2 - m.titleY);

  const outerRadius = m.radius + outerStrokeWidth / 2;
  const box = new Box();
  // v12's viewBox: the chart and legend, widened only for the title.
  const titleWidth = title?.width ?? 0;
  box.add({ x: 0, y: 0, width: chartWidth, height: chartHeight });
  box.add({ x: middle - titleWidth / 2, y: 0, width: titleWidth, height: 0 });
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

/** v12's legend offsets per position (`pieRenderer.ts` :195-251) for `n` rows. */
function legendPlace(position: LegendPosition, n: number, longest: number): LegendPlace {
  const total = n * m.row;
  const centred = -longest / 2 - m.legendTextX;
  const side = m.width + m.margin + m.legendTextX + longest;
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
        shift: { x: longest + m.legendTextX, y: 0 },
        chartWidth: side,
      };
    case 'right':
      return { ...base, rowX: m.rightLegendX, rowY: middle, chartWidth: side };
  }
}

/** A label whose first baseline is at (`x`, `baseline`), its left edge at `x`. */
function placed(text: MeasuredLabel, x: number, baseline: number): PlacedLabel {
  return { x, y: baseline - text.baseline, width: text.width, height: text.height, text };
}

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
