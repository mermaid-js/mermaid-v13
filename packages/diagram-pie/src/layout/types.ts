/**
 * PieLayout: the plain-data result of the pie custom layout (`layoutKind: 'custom'`, spec #288
 * §Layout). Every length is in px (pie draws SVG only, D216), in the diagram's coordinates:
 * the renderer draws them as they are, with no group transform of its own. Rectangles have
 * their top-left corner at `x`, `y`. Angles are radians clockwise from 12 o'clock, as d3's.
 */
import type { AstId } from '@mermaid-js/core/parser-kit';
import type { FontKey, MeasuredLabel } from '@mermaid-js/core/text';
import type { Rect } from '@mermaid-js/shared/layout';

export interface Point {
  readonly x: number;
  readonly y: number;
}

export type { Rect };

/**
 * A measured label and the box it is drawn in. v12 placed its text by the first baseline, so
 * that baseline is at `y + text.baseline`.
 */
export interface PlacedLabel extends Rect {
  readonly text: MeasuredLabel;
}

export interface PieSliceLayout {
  /** The section's index in `PieModel.sections`. */
  readonly index: number;
  readonly ast: AstId;
  readonly label: string;
  readonly value: number;
  readonly startAngle: number;
  readonly endAngle: number;
  /** The colour slot: section index mod 12, so `pie${colour + 1}` (a hidden slice shifts nothing). */
  readonly colour: number;
  /** The percentage's anchor, d3's `centroid()` at `radius * textPosition`. */
  readonly anchor: Point;
  /** `toFixed(0)` of the value over the sum of all sections, and `%`, centred on `anchor`. */
  readonly percent: PlacedLabel;
  /** `highlightSlice` names this slice: drawn at `highlightScale` about the centre (D222). */
  readonly highlighted: boolean;
}

export interface PieLegendRow {
  /** The section's index in `PieModel.sections`: every section has a row, shown or not. */
  readonly index: number;
  readonly ast: AstId;
  readonly colour: number;
  readonly swatch: Rect;
  /** `label`, or `label [value]` under `showData`. */
  readonly label: PlacedLabel;
}

export interface PieLayout {
  /** The pie's centre. */
  readonly center: Point;
  readonly radius: number;
  /** `donutHole * radius`, 0 without a hole. */
  readonly innerRadius: number;
  /** Where the percentages sit: `radius * textPosition`. */
  readonly textRadius: number;
  /** The outer circle's radius, `radius + pieOuterStrokeWidth / 2`, about `center`. */
  readonly outerRadius: number;
  /** The outer circle's stroke width (`pieOuterStrokeWidth`). */
  readonly outerStrokeWidth: number;
  /** The slices' stroke width (`pieStrokeWidth`). */
  readonly strokeWidth: number;
  /** The shown slices (at least 1% of the sum, D223) in input order; together they fill 2π. */
  readonly slices: readonly PieSliceLayout[];
  /** One row per section, in input order. */
  readonly legend: readonly PieLegendRow[];
  /** The title, middle-anchored on v12's canvas centre; absent without one. */
  readonly title?: PlacedLabel;
  /** `highlightSlice: hover`: accepted, draws nothing extra (D222). */
  readonly hover: boolean;
  /** The scale a highlighted slice is drawn at, about `center`. */
  readonly highlightScale: number;
  /** The fonts the labels were measured in, and so are drawn in. */
  readonly fonts: {
    readonly title: FontKey;
    readonly section: FontKey;
    readonly legend: FontKey;
  };
  /** v12's viewBox, grown to cover everything drawn (D224). */
  readonly bounds: Rect;
}
