/**
 * WardleyLayout: the plain-data result of the wardley custom layout (`layoutKind: 'custom'`,
 * spec #430 "Layout (T3)"). Every length is in px (wardley draws SVG only, D320), in the
 * diagram's coordinates, as v12 wrote them: the canvas runs from (0, 0) to (`width`,
 * `height`), with no group transform. Rectangles have their top-left corner at `x`, `y`. The
 * strokes, dashes and opacities the renderer draws with are in `WARDLEY_METRICS`.
 */
import type { AstId } from '@mermaid-js/core/parser-kit';
import type { FontKey, LabelMarkup, MeasuredLabel } from '@mermaid-js/core/text';
import type { WardleyFlow, WardleyNodeClass, WardleyStrategy } from '../model.ts';

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Rect extends Point {
  readonly width: number;
  readonly height: number;
}

/** A straight line. */
export interface Segment {
  readonly from: Point;
  readonly to: Point;
}

/** An arrowhead: the two base corners and the tip between them. */
export type Triangle = readonly [Point, Point, Point];

/** v12's `text-anchor` and `dominant-baseline` for a text at a point. */
export type WardleyTextAnchor = 'start' | 'middle';
export type WardleyBaseline = 'auto' | 'middle' | 'central';

/**
 * A measured text, read by the label rule (#1368) and laid out by core's label layout: v12's
 * anchor point, alignment and rotation, and the box its lines fill before the rotation. The
 * first line sits where v12's one line did; further lines follow below it.
 */
export interface PlacedText extends Rect {
  /** What is drawn, as plain text: the runs of each line, the lines joined by `\n`. */
  readonly text: string;
  /** The laid-out lines and runs, as `SvgWriter.label()` draws them. */
  readonly label: MeasuredLabel;
  /** How the text was read: `plain` unless it is a markdown string or every label is markdown. */
  readonly markup: LabelMarkup;
  /** The font it was measured in, and so is drawn in. */
  readonly font: FontKey;
  /** From the box's top to the first line's baseline (the font's ascent). */
  readonly ascent: number;
  /** v12's `x`, `y`. */
  readonly at: Point;
  readonly anchor: WardleyTextAnchor;
  readonly baseline: WardleyBaseline;
  /** Degrees clockwise about `at` (v12's `rotate(a x y)`); 0 for upright text. */
  readonly rotate: number;
}

/** One evolution stage: its span on the x axis, its label, and the divider at its start. */
export interface WardleyStageLayout {
  /**
   * The span in px; custom boundaries are clamped to the chart (`WARDLEY_STAGE_CLAMPED`). With
   * decreasing boundaries `end` is left of `start`, as v12 drew them.
   */
  readonly start: number;
  readonly end: number;
  readonly label: PlacedText;
  /** The dashed line at `start`, top to bottom of the chart; absent for the first stage. */
  readonly divider?: Segment;
}

/** What a node draws at its point (v12 `:646-741`). */
export type WardleyGlyph = 'circle' | 'square' | 'none';

export interface WardleyNodeLayout {
  readonly id: string;
  readonly ast: AstId;
  readonly className: WardleyNodeClass;
  /** The node's centre: its projected position, a pipeline parent's moved to its box. */
  readonly point: Point;
  /** A circle of `nodeRadius`, a pipeline parent's square, or none (anchors, `(market)`). */
  readonly glyph: WardleyGlyph;
  /** The circle's radius, or half the square's side; 0 without a glyph. */
  readonly radius: number;
  /** The strategy's circle under the glyph, `2 · nodeRadius`. */
  readonly overlay?: { readonly strategy: WardleyStrategy; readonly radius: number };
  /** `(market)`: three dots on a triangle, joined by lines (`:660-729`). */
  readonly market?: { readonly dots: readonly [Point, Point, Point]; readonly radius: number };
  /** `inertia`: a vertical bar right of the node. */
  readonly inertia?: { readonly line: Segment; readonly width: number };
  readonly label: PlacedText;
}

/** A drawn link (v12 `:382-530`). */
export interface WardleyLinkLayout {
  readonly ast: AstId;
  /** The node ids it joins. */
  readonly source: string;
  readonly target: string;
  /** The line, shortened at each end to its node's edge. */
  readonly from: Point;
  readonly to: Point;
  readonly dashed: boolean;
  readonly flow?: WardleyFlow;
  /** v12's `marker-start` (backward, bidirectional) and `marker-end` (forward, bidirectional). */
  readonly heads: { readonly start?: Triangle; readonly end?: Triangle };
  /** Middle-anchored `labelOffset` off the midpoint of the centres, along the line. */
  readonly label?: PlacedText;
}

/** A drawn `evolve` (v12 `:532-582`). */
export interface WardleyTrendLayout {
  readonly ast: AstId;
  readonly nodeId: string;
  /** From the node's point to its target, shortened by `nodeRadius + 2` when longer. */
  readonly from: Point;
  readonly to: Point;
  readonly head: Triangle;
}

/** A pipeline with children (v12 `:306-380`). */
export interface WardleyPipelineLayout {
  readonly ast: AstId;
  readonly nodeId: string;
  /** About the last child's line, `pad` past the outer children. */
  readonly box: Rect;
  /** Dashed joins between consecutive children, by evolution. */
  readonly joins: readonly Segment[];
}

/** An `annotation`'s numbered marker. */
export interface WardleyAnnotationLayout {
  readonly ast: AstId;
  readonly number: number;
  readonly point: Point;
  readonly radius: number;
  readonly label: PlacedText;
}

/** The `annotations` box: one line per annotation with text, by number (v12 `:880-955`). */
export interface WardleyAnnotationsBoxLayout {
  readonly ast: AstId;
  /** Clamped to the chart where it fits. */
  readonly box: Rect;
  readonly lines: readonly PlacedText[];
}

export interface WardleyNoteLayout {
  readonly ast: AstId;
  readonly label: PlacedText;
}

/** An `accelerator` (pointing right) or `deaccelerator` (pointing left). */
export interface WardleyAcceleratorLayout {
  readonly ast: AstId;
  readonly name: string;
  /** The arrow's seven corners, as v12's path. */
  readonly outline: readonly Point[];
  readonly label: PlacedText;
}

export interface WardleyLayout {
  /** The canvas: the map's `size`, else the config's `width` and `height`. */
  readonly width: number;
  readonly height: number;
  readonly padding: number;
  readonly nodeRadius: number;
  /** The plotting area, inset by `padding`; never empty (D424). */
  readonly chart: Rect;
  readonly title?: PlacedText;
  readonly axes: {
    readonly x: Segment;
    readonly y: Segment;
    readonly xLabel: PlacedText;
    readonly yLabel: PlacedText;
  };
  readonly stages: readonly WardleyStageLayout[];
  /** For each quarter mark (1…3), its vertical then its horizontal line, as v12; empty without `showGrid`. */
  readonly grid: readonly Segment[];
  readonly pipelines: readonly WardleyPipelineLayout[];
  readonly links: readonly WardleyLinkLayout[];
  readonly trends: readonly WardleyTrendLayout[];
  /** In model order. */
  readonly nodes: readonly WardleyNodeLayout[];
  readonly annotations: readonly WardleyAnnotationLayout[];
  readonly annotationsBox?: WardleyAnnotationsBoxLayout;
  readonly notes: readonly WardleyNoteLayout[];
  readonly accelerators: readonly WardleyAcceleratorLayout[];
  readonly deaccelerators: readonly WardleyAcceleratorLayout[];
  /** The fonts the texts were measured in, and so are drawn in. */
  readonly fonts: {
    readonly title: FontKey;
    readonly axis: FontKey;
    readonly stage: FontKey;
    readonly node: FontKey;
    readonly anchor: FontKey;
    readonly link: FontKey;
    readonly annotationNumber: FontKey;
    readonly annotation: FontKey;
    readonly note: FontKey;
    readonly accelerator: FontKey;
  };
  /** v12's canvas, grown to cover everything drawn (D224); it may start at negative x/y. */
  readonly bounds: Rect;
}
