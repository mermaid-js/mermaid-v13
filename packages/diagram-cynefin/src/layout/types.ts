/**
 * CynefinLayout: the plain-data result of the cynefin custom layout (`layoutKind: 'custom'`,
 * spec #423 "Layout (T3)"). Every length is in px. Geometry is in v12's content space: the
 * canvas runs from (0, 0) to (`width`, `height`), and the renderer draws it inside a group
 * translated by `offset`, as v12's `translate(padding, padding)` root `<g>`. Rectangles have
 * their top-left corner at `x`, `y`.
 */
import type { AstId } from '@mermaid-js/core/parser-kit';
import type { FontKey, MeasuredLabel } from '@mermaid-js/core/text';
import type { Rect } from '@mermaid-js/shared/layout';
import type { CynefinDomainName } from '../model.ts';

export interface Point {
  readonly x: number;
  readonly y: number;
}

export type { Rect };

/** A font a text was measured in, and so is drawn in: core's key plus its CSS `font-style`. */
export interface CynefinFont extends FontKey {
  readonly style: 'normal' | 'italic';
}

/** A measured label and the box it is drawn in, centred on the box's centre. */
export interface PlacedLabel extends Rect {
  readonly text: MeasuredLabel;
}

/** One cubic Bézier segment: two control points and its end. */
export interface CubicSegment {
  readonly c1: Point;
  readonly c2: Point;
  readonly to: Point;
}

/** A path of cubic segments from `from` (the fold, the horizon, the cliff). */
export interface CubicCurve {
  readonly from: Point;
  readonly segments: readonly CubicSegment[];
}

/** The quadrants, in v12's drawing order. */
export type CynefinQuadrantName = Exclude<CynefinDomainName, 'confusion'>;

/** A quadrant's background. */
export interface CynefinQuadrant extends Rect {
  readonly name: CynefinQuadrantName;
  /**
   * Where its texts and transitions hang from: the centre of its quarter of v12's canvas, which
   * stays at the top of a row that grew (D617).
   */
  readonly center: Point;
  /** The drawn block's AST id when the domain is declared; undeclared domains are drawn too. */
  readonly ast?: AstId;
}

/** The confusion ellipse, drawn as two half arcs (v12 `generateConfusionPath`). */
export interface CynefinEllipse {
  readonly center: Point;
  readonly rx: number;
  readonly ry: number;
  readonly ast?: AstId;
  /** Its dashed outline's width (styles.ts :71). */
  readonly strokeWidth: number;
}

/** A fixed text: a domain name (`Complex`) or a subtitle (`DOMAIN_META`), plain, not parsed. */
export interface CynefinFixedText extends PlacedLabel {
  readonly domain: CynefinDomainName;
}

/** An item's badge, or confusion's `+N more` badge. */
export interface CynefinBadge extends Rect {
  readonly domain: CynefinDomainName;
  /** The label, centred in the badge. */
  readonly label: PlacedLabel;
  /** Corner radius. */
  readonly radius: number;
}

export interface CynefinItemBadge extends CynefinBadge {
  readonly ast: AstId;
  /** The item's index in its domain's `items`. */
  readonly index: number;
  /** The item's label as written: its `data-id` (T4, #468). */
  readonly id: string;
}

/** Confusion's `+N more` badge, after its first three items. */
export interface CynefinOverflowBadge extends CynefinBadge {
  /** How many items it stands for. */
  readonly count: number;
}

/** A transition: a quadratic curve from centre to centre and its arrowhead. */
export interface CynefinTransitionLayout {
  readonly from: CynefinDomainName;
  readonly to: CynefinDomainName;
  readonly ast: AstId;
  /** The curve: `M start Q control end`. */
  readonly start: Point;
  readonly control: Point;
  readonly end: Point;
  /**
   * v12's marker triangle (`M 0 0 L 10 5 L 0 10 z`) placed at `end` along the end tangent: the
   * two base corners and the tip between them. The line is not shortened, so the tip lies
   * a tenth of the head's length past `end`.
   */
  readonly head: readonly [Point, Point, Point];
  /** The label, its baseline 6 px above the control point; absent without one. */
  readonly label?: PlacedLabel;
}

export interface CynefinLayout {
  /**
   * The canvas, `width × height`: v12's fixed geometry (D361), taller by what a row grew to fit
   * its list (D617).
   */
  readonly width: number;
  readonly height: number;
  readonly padding: number;
  /** Where the canvas starts in the SVG: (`padding`, `padding`). */
  readonly offset: Point;
  readonly showDomainDescriptions: boolean;
  /** The seed the fold and the horizon were drawn with (D362). */
  readonly seed: number;
  /** complex, complicated, chaotic, clear: they tile the canvas in two rows. */
  readonly quadrants: readonly CynefinQuadrant[];
  readonly confusion: CynefinEllipse;
  readonly boundaries: {
    readonly fold: CubicCurve;
    readonly horizon: CubicCurve;
    readonly cliff: CubicCurve;
  };
  /** Stroke widths of what the layout's bounds cover (theme lengths). */
  readonly strokes: {
    readonly boundary: number;
    readonly cliff: number;
    readonly arrow: number;
    readonly item: number;
  };
  /** Four quadrant labels, then `Confusion`. */
  readonly labels: readonly CynefinFixedText[];
  /** Model then practice per quadrant, then `Disorder`; empty without descriptions. */
  readonly subtitles: readonly CynefinFixedText[];
  /** Item badges: quadrants in drawing order, then confusion's first three. */
  readonly items: readonly CynefinItemBadge[];
  readonly overflow?: CynefinOverflowBadge;
  /** In source order. */
  readonly transitions: readonly CynefinTransitionLayout[];
  /** Centred half the padding above the canvas; extra lines grow up. Absent without one. */
  readonly title?: PlacedLabel;
  /** The fonts the texts were measured in, and so are drawn in. */
  readonly fonts: {
    readonly label: CynefinFont;
    /** Italic (styles.ts :40). */
    readonly subtitle: CynefinFont;
    readonly item: CynefinFont;
    readonly transition: CynefinFont;
    readonly title: CynefinFont;
  };
  /** v12's viewBox in content space, `(-padding, -padding)` on, grown to cover what is drawn (D361). */
  readonly bounds: Rect;
  /** `bounds` in SVG space: the `viewBox`. */
  readonly viewBox: Rect;
}
