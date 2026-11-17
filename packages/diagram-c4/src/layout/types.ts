/**
 * C4Layout: the plain-data result of the C4 custom layout (`layoutKind: 'custom'`, spec #522
 * §Layout, D224). Every length is in px, in one frame: the canvas, from (0, 0) at its top-left,
 * `width` × `height`, the config margins all round and the title row above. Rectangles have
 * their top-left corner at `x`, `y`.
 */
import type { AstId } from '@mermaid-js/core/parser-kit';
import type { FontKey, MeasuredLabel } from '@mermaid-js/core/text';
import type { C4ElementKind, C4NodeKind } from '../model.ts';

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Rect extends Point {
  readonly width: number;
  readonly height: number;
}

/**
 * A measured label, its box and the font it was measured in, which is the font it is drawn in
 * (pitfall 16). The box is the text's: lines centred across it; the first baseline at
 * `y + text.baseline`.
 */
export interface PlacedLabel extends Rect {
  readonly text: MeasuredLabel;
  readonly font: FontKey;
  /** Set when the label is measured bold (an element's name, a boundary's label). */
  readonly bold?: true;
  /** Set when the label is measured italic (a relation's `[techn]`). */
  readonly italic?: true;
}

/**
 * The five C4 shapes (D446): `person` (head and rounded body), `rounded` (`rx` 12), `cyl`
 * (databases), `h-cyl` (queues) and `fr-rect` (the `component` keyword).
 */
export type C4ShapeId = 'person' | 'rounded' | 'cyl' | 'h-cyl' | 'fr-rect';

/** A drawn element, in `C4Model.elements` order. */
export interface C4ElementLayout {
  readonly ast: AstId;
  readonly alias: string;
  readonly kind: C4ElementKind;
  /** Its index in `C4Model.elements`. */
  readonly index: number;
  readonly shape: C4ShapeId;
  /** The shape's box; the outline fills it. */
  readonly box: Rect;
  /** v12's sections, top to bottom: the bold name, `[Person]`/`[Container: techn]`, the description. */
  readonly name?: PlacedLabel;
  /** Absent when c4-beta hides the type line (`showStereotypes`, `hideStereotypes`). */
  readonly type?: PlacedLabel;
  readonly descr?: PlacedLabel;
}

/** A drawn boundary (or deployment node), parents before their children. */
export interface C4BoundaryLayout {
  readonly ast: AstId;
  readonly alias: string;
  readonly nodeKind?: C4NodeKind;
  /** Its index in `C4Model.boundaries`. */
  readonly index: number;
  /**
   * Its drawn parent's index in `C4Model.boundaries`; -1 at the top level, where a boundary on
   * a parent cycle is drawn too (D454, `C4_BOUNDARY_CYCLE`).
   */
  readonly parent: number;
  /** Nesting depth: 0 at the top level. */
  readonly depth: number;
  /** The frame. */
  readonly box: Rect;
  /** The header, inside the frame: the bold label, `[type]`, the description. */
  readonly label?: PlacedLabel;
  readonly type?: PlacedLabel;
  readonly descr?: PlacedLabel;
  /** The header's height from the frame's top: the contents start below it. */
  readonly head: number;
}

/** A relation's end: where it meets the outline, and the way an arrowhead there points (a unit vector). */
export interface C4RelationEnd extends Point {
  readonly dx: number;
  readonly dy: number;
}

/** How a relation is drawn. */
export type C4RouteKind =
  /** One straight segment. */
  | 'line'
  /** Upright and level stretches with rounded corners (an elbow or a detour). */
  | 'bent'
  /** A self-loop: a cubic from `points[0]` to `points[1]` through `controls`. */
  | 'loop';

/** A drawn relation, in `C4Model.relations` order (one with an unknown end is not drawn). */
export interface C4RelationLayout {
  readonly ast: AstId;
  /** Its index in `C4Model.relations`. */
  readonly index: number;
  /** v12's kind: `rel`, `birel`, `rel_b`, … (an unknown `$type` reads as `rel`). */
  readonly kind: string;
  readonly from: string;
  readonly to: string;
  readonly route: C4RouteKind;
  /** The line's corners, from the outline of `from` to the outline of `to`. */
  readonly points: readonly Point[];
  /** A self-loop's two control points. */
  readonly controls?: readonly [Point, Point];
  readonly start: C4RelationEnd;
  readonly end: C4RelationEnd;
  /** Arrowheads: at `end` unless `rel_b`; at `start` for `birel` and `rel_b`. */
  readonly startArrow: boolean;
  readonly endArrow: boolean;
  /** The label (with C4Dynamic's `"<n>: "`), and `[techn]` in italic below it. */
  readonly label?: PlacedLabel;
  readonly techn?: PlacedLabel;
  /**
   * The label's box, under the label and `[techn]`: both stacked, `labelPad` wider than the
   * wider. The renderer draws it and the invariants check it; set when either is.
   */
  readonly labelBox?: Rect;
  /**
   * No spot kept the label off its own arrowheads, the elements and the boundary headers (a
   * diagram with no room between its shapes): it sits beside the line where it covers least.
   */
  readonly crowded?: true;
}

/** One legend row: a swatch and its label. */
export interface C4LegendRow {
  readonly swatch: Rect;
  readonly label: PlacedLabel;
  /** A kind row's element kind: the swatch takes that kind's palette. */
  readonly kind?: C4ElementKind;
  /** A tag row's style, its colours as written: the swatch takes them. */
  readonly tag?: {
    readonly name: string;
    readonly ast: AstId;
    readonly fill?: string;
    readonly stroke?: string;
  };
}

/** c4-beta's legend (spec #730 T3): a heading and one row per kind and tag style in use. */
export interface C4LegendLayout {
  /** Everything the legend draws. */
  readonly box: Rect;
  readonly title: PlacedLabel;
  readonly rows: readonly C4LegendRow[];
}

export interface C4Layout {
  /** The canvas: everything drawn, the config margins all round, and the title row. */
  readonly width: number;
  readonly height: number;
  readonly title?: PlacedLabel;
  readonly boundaries: readonly C4BoundaryLayout[];
  readonly elements: readonly C4ElementLayout[];
  readonly relations: readonly C4RelationLayout[];
  /** Below the drawing; set only by c4-beta, and only when it has a row to show. */
  readonly legend?: C4LegendLayout;
  /** Everything drawn (D224): frames, shapes, lines, labels and the title. */
  readonly bounds: Rect;
  /**
   * False when the diagram was too big to steer relations and place labels with care
   * (R-SEC-5, D455's budget): relations then go straight and labels sit at their middle.
   */
  readonly careful: boolean;
  /**
   * Set when relation and boundary text may wrap: the root `wrap` is true (it wins over
   * `c4.wrap`, #683). The text output wraps a relation's label narrower only then.
   */
  readonly labelsWrap?: true;
  /**
   * Set when laid out for text output (the cell profile, #545): px per cell. Text was measured
   * in cells at this size, so the layout divided by it is the drawing on the character grid.
   */
  readonly cell?: { readonly x: number; readonly y: number };
}
