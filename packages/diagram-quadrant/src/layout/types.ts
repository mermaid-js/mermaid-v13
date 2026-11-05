/**
 * QuadrantLayout: the plain-data output of the quadrant layout, a port of v12's
 * `quadrantBuilder.ts` `build()` (spec #289 §Layout). Every position is an anchor, as v12
 * computed it; labels are measured when they are drawn (D225). Colours are not here: the
 * renderer reads them from the theme (D152), except a point's inline or class paints.
 */
import type { AstId } from '@mermaid-js/core/parser-kit';
import type { QuadrantChartConfig } from '@mermaid-js/core/config';
import type { QuadrantText } from '../model.ts';

/** The `quadrantChart` options the layout reads, resolved over the schema defaults. */
export type QuadrantLayoutConfig = Required<
  Pick<
    QuadrantChartConfig,
    | 'chartWidth'
    | 'chartHeight'
    | 'titleFontSize'
    | 'titlePadding'
    | 'quadrantPadding'
    | 'xAxisLabelPadding'
    | 'yAxisLabelPadding'
    | 'xAxisLabelFontSize'
    | 'yAxisLabelFontSize'
    | 'quadrantLabelFontSize'
    | 'quadrantTextTopPadding'
    | 'pointTextPadding'
    | 'pointLabelFontSize'
    | 'pointRadius'
    | 'xAxisPosition'
    | 'yAxisPosition'
    | 'quadrantInternalBorderStrokeWidth'
    | 'quadrantExternalBorderStrokeWidth'
  >
>;

/**
 * A text anchor: drawn at `translate(x, y) rotate(rotation)` with v12's `text-anchor`
 * (`anchor`) and `dominant-baseline` (`baseline`). In v12 terms `anchor` is `verticalPos`
 * (`left` → `start`, `center` → `middle`) and `baseline` is `horizontalPos` (`top` →
 * `hanging`, `middle` → `middle`).
 */
export interface QuadrantTextAnchor {
  readonly label: QuadrantText;
  readonly x: number;
  readonly y: number;
  /** px. */
  readonly fontSize: number;
  readonly anchor: 'start' | 'middle';
  readonly baseline: 'hanging' | 'middle';
  /** Degrees: 0, or −90 for y-axis labels. */
  readonly rotation: number;
}

export interface QuadrantRect {
  /** 1…4: top right, top left, bottom left, bottom right (v12's order). */
  readonly quadrant: 1 | 2 | 3 | 4;
  /** `q:N`, when the chart labels the quadrant. */
  readonly ast?: AstId;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Always present; its text is empty when the quadrant has no label (v12 drew it so). */
  readonly text: QuadrantTextAnchor;
}

/** v12's six border lines: top, right, bottom, left (external), then vertical and horizontal (internal). */
export interface QuadrantBorder {
  readonly kind: 'external' | 'internal';
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  /** px. */
  readonly strokeWidth: number;
}

export interface QuadrantAxisLabel {
  readonly axis: 'x' | 'y';
  /** x: `start` is the left label; y: `start` is the bottom one. */
  readonly end: 'start' | 'end';
  /** `ax:x` or `ax:y`. */
  readonly ast: AstId;
  readonly text: QuadrantTextAnchor;
}

export interface QuadrantLayoutPoint {
  /** The point's AST id (`pt:<name>`). */
  readonly ast: AstId;
  readonly cx: number;
  readonly cy: number;
  /** px. */
  readonly radius: number;
  /** Inline or class `color`, with `#` (D235); undefined is the theme's `quadrantPointFill`. */
  readonly fill?: string;
  /** Inline or class `stroke-color`, with `#`; undefined is the theme's `quadrantPointFill`. */
  readonly stroke?: string;
  /** px; 0 when no style sets it (v12's `0px`). */
  readonly strokeWidth: number;
  readonly text: QuadrantTextAnchor;
}

export interface QuadrantLayout {
  /** v12's fixed `viewBox="0 0 chartWidth chartHeight"`; D224 growth is the renderer's. */
  readonly width: number;
  readonly height: number;
  /** v12's order: quadrant 1, 2, 3, 4. */
  readonly quadrants: readonly QuadrantRect[];
  readonly borders: readonly QuadrantBorder[];
  /** x start, x end, y start, y end; an empty label is left out. */
  readonly axisLabels: readonly QuadrantAxisLabel[];
  /** Source order, without the points whose coordinates are not in [0, 1] (D226). */
  readonly points: readonly QuadrantLayoutPoint[];
  /** Absent when the title is empty. */
  readonly title?: QuadrantTextAnchor & { readonly ast?: AstId };
}
