// The colours the quadrant renderer draws with, looked up before the root is written so the
// root `style` declares exactly the aliases used (`theme.rootStyleText()`). Every colour is a
// theme variable or an author's inline or class paint; nothing depends on a theme name or
// `look` (D152), and no family adds a gradient, shadow or palette (D227).
import type { RenderContext } from '@mermaid-js/core';
import { checkColor, type Paint } from '@mermaid-js/core/svg';
import type { QuadrantLayout, QuadrantLayoutPoint } from '../layout/types.ts';

type Theme = RenderContext['theme'];

/** Each quadrant's theme variables, `quadrant-1` first (v12 theme files, quadrant-graph block). */
const QUADRANT_VARS = [
  { fill: 'quadrant1Fill', text: 'quadrant1TextFill' },
  { fill: 'quadrant2Fill', text: 'quadrant2TextFill' },
  { fill: 'quadrant3Fill', text: 'quadrant3TextFill' },
  { fill: 'quadrant4Fill', text: 'quadrant4TextFill' },
] as const;

export interface PointPaint {
  readonly fill: Paint;
  /** Only an inline or class `stroke-color`: v12's default stroke never drew (see below). */
  readonly stroke?: Paint;
}

export interface Paints {
  /** Each quadrant's fill and label colour, by `quadrant - 1`; the label's only when drawn. */
  readonly quadrants: readonly { readonly fill: Paint; readonly text?: Paint }[];
  readonly externalBorder: Paint;
  readonly internalBorder: Paint;
  /** Fill and stroke of each laid-out point, in layout order. */
  readonly points: readonly PointPaint[];
  readonly pointText?: Paint;
  readonly xAxisText?: Paint;
  readonly yAxisText?: Paint;
  readonly title?: Paint;
}

/**
 * The paints of one render. Only the variables something is drawn with are read, so the root
 * declares no alias it does not use.
 */
export function paints(theme: Theme, layout: QuadrantLayout): Paints {
  const quadrants = layout.quadrants.map((q) => {
    const vars = QUADRANT_VARS[q.quadrant - 1]!;
    return {
      fill: theme.color(vars.fill),
      ...(q.text.label.text ? { text: theme.color(vars.text) } : {}),
    };
  });
  const externalBorder = theme.color('quadrantExternalBorderStrokeFill');
  const internalBorder = theme.color('quadrantInternalBorderStrokeFill');
  // An unset point fill is the theme's (D231), read once and only when a point needs it. An
  // unset stroke is none: v12's default was its NaN `quadrantPointFill`, which browsers ignore,
  // so a `stroke-width` alone drew no ring.
  let point: Paint | undefined;
  const themed = (): Paint => (point ??= theme.color('quadrantPointFill'));
  const author = (c: string | undefined): Paint | undefined =>
    c === undefined ? undefined : checkColor(c);
  const points = layout.points.map((p: QuadrantLayoutPoint): PointPaint => {
    const stroke = author(p.stroke);
    return { fill: author(p.fill) ?? themed(), ...(stroke ? { stroke } : {}) };
  });
  const has = (axis: 'x' | 'y'): boolean => layout.axisLabels.some((l) => l.axis === axis);
  return {
    quadrants,
    externalBorder,
    internalBorder,
    points,
    ...(layout.points.some((p) => p.text.label.text)
      ? { pointText: theme.color('quadrantPointTextFill') }
      : {}),
    ...(has('x') ? { xAxisText: theme.color('quadrantXAxisTextFill') } : {}),
    ...(has('y') ? { yAxisText: theme.color('quadrantYAxisTextFill') } : {}),
    ...(layout.title ? { title: theme.color('quadrantTitleFill') } : {}),
  };
}
