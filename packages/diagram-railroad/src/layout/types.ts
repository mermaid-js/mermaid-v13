/**
 * RailroadLayout: the plain-data result of the railroad custom layout (`layoutKind: 'custom'`,
 * spec #526 §Layout). Every length is in px (D216), or in cells for the text output (`units`).
 * v12 nests a `g` per expression, each translated inside its parent, and writes each track
 * `path` in its group's coordinates; the
 * layout keeps that shape so the renderer (T4, #613) writes v12's transforms and path data as
 * they are: an expression's `x`/`y` are its offset in its parent (v12's `translate`), its paths,
 * box and text are in its own coordinates, and a rule's parts are in the rule's coordinates,
 * whose origin is `origin` in the diagram.
 */
import type { AstId } from '@mermaid-js/core/parser-kit';
import type { FontKey } from '@mermaid-js/core/text';
import type { RailroadConfig, RailroadLayoutConfig } from '../config.ts';
import type { RailroadNodeKind } from '../model.ts';
import type { RailroadMetrics } from './metrics.ts';

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Top-left corner, width and height. */
export interface Rect extends Point {
  readonly width: number;
  readonly height: number;
}

/** A straight piece of track to (`x`, `y`): v12's `L`. */
export interface TrackLine extends Point {
  readonly kind: 'line';
}

/**
 * A quarter-circle corner of track to (`x`, `y`): v12's `A r r 0 0 sweep x y` (never the large
 * arc, never rotated). `sweep` is SVG's sweep flag (clockwise).
 */
export interface TrackArc extends Point {
  readonly kind: 'arc';
  readonly radius: number;
  readonly sweep: boolean;
}

export type TrackSegment = TrackLine | TrackArc;

/** One `path.railroad-line`: `M start` then the segments, in order. */
export interface TrackPath {
  readonly start: Point;
  readonly segments: readonly TrackSegment[];
}

/** A text and where it is drawn. */
export interface PlacedText {
  readonly text: string;
  readonly font: FontKey;
  /**
   * The anchor point: a box's text is centred on it (`text-anchor: middle` and
   * `dominant-baseline: middle`); a rule name starts at it, on its alphabetic baseline (v12 sets
   * neither).
   */
  readonly x: number;
  readonly y: number;
  readonly anchor: 'middle' | 'start';
  /** The measured box around the text, for the bounds. */
  readonly box: Rect;
}

/** A terminal's, nonterminal's or special's `rect`, at (0, 0) in its expression. */
export interface TrackBox extends Rect {
  /** `rx`/`ry`: the terminal's fixed corner radius, else 0 (a square `rect`). */
  readonly cornerRadius: number;
  /** A special's dashed outline (dash, gap), else absent. */
  readonly dash?: readonly [number, number];
}

/**
 * One expression, v12's `g.railroad-<kind>`. Its box runs from (0, 0) to (`width`,
 * `up + down`), and its track enters at (0, `up`) and leaves at (`width`, `up`).
 */
export interface RailroadExpressionLayout {
  readonly kind: RailroadNodeKind;
  /** The model node's AST id (`data-ast`, D517). */
  readonly ast: AstId;
  /** Its offset in its parent's coordinates (v12's `translate(x, y)`). */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  /** From the top to the track. */
  readonly up: number;
  /** From the track to the bottom. */
  readonly down: number;
  /**
   * The children, in model order (a sequence's elements, a choice's alternatives, the element of
   * an optional or a repetition). v12 writes them before the group's own paths.
   */
  readonly children: readonly RailroadExpressionLayout[];
  /**
   * The group's `path.railroad-line`s, in v12's order: a sequence's connectors; a choice's left
   * then right path per branch; an optional's two stubs then its bypass; a repetition's two
   * stubs, its loop, then (`min` 0) its bypass. A terminal, nonterminal or special has none.
   */
  readonly paths: readonly TrackPath[];
  /**
   * v12's DOM order of children and paths: `pathsAfter[i]` of `paths`, in order, follow child
   * `i`, and the paths left over follow the last child. A sequence writes each child then the
   * connector to the next (1, …, 1, 0), a choice each branch then its left and right paths (2
   * each), an optional or a repetition its element then all its paths (0).
   */
  readonly pathsAfter: readonly number[];
  /** A terminal's, nonterminal's or special's box and text. */
  readonly box?: TrackBox;
  readonly text?: PlacedText;
}

/** A start or end marker, `circle` at (`cx`, `cy`). */
export interface Marker {
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
}

/** One rule, v12's `g.railroad-rule` translated to `origin`; the rest is in its coordinates. */
export interface RailroadRuleLayout {
  readonly name: string;
  /** The rule's AST id (`data-ast`, D517). */
  readonly ast: AstId;
  /** Its top-left corner in the diagram: x 0, y from `padding` down. */
  readonly origin: Point;
  /** The track's y: `max(minBaseline, definition.up)`. */
  readonly baseline: number;
  /** `name =`, bold, starting at (0, `baseline`). */
  readonly label: PlacedText;
  readonly start: Marker;
  readonly end: Marker;
  /** The definition, at (`definitionX`, `baseline - up`). */
  readonly definition: RailroadExpressionLayout;
  /** From the start marker's right edge to the definition. */
  readonly leadIn: TrackPath;
  /** From the definition to the end marker's left edge. */
  readonly leadOut: TrackPath;
  /** v12's rule size: the next rule starts `height + verticalSeparation` lower. */
  readonly width: number;
  readonly height: number;
}

export interface RailroadLayout {
  /** v12's canvas (its viewBox): widest rule plus twice `padding`, or 200 × 100 with no rules. */
  readonly width: number;
  readonly height: number;
  /**
   * `px` for SVG; `cell` with the cell profile (the text output, #617), where every length is in
   * cells and a point is a cell's centre.
   */
  readonly units: 'px' | 'cell';
  /** The fixed lengths the layout used: `RAILROAD_METRICS`, or the cell table in cells. */
  readonly metrics: RailroadMetrics;
  /**
   * The lengths the layout used: the checked `railroad` lengths (`config.lengths`) in px, the
   * `ascii.padding` preset's in cells.
   */
  readonly options: RailroadLayoutConfig;
  /**
   * The `railroad` section, checked once (D515): lengths, the font and colours it sets that are
   * usable, `useMaxWidth`, and the keys it set that are not (the layout's one
   * `RAILROAD_CONFIG_INVALID`). The renderer draws with it.
   */
  readonly config: RailroadConfig;
  /** The fonts measured in: every box's text, and the rule names (bold, D514). */
  readonly fonts: {
    readonly text: FontKey;
    readonly ruleName: FontKey;
  };
  /** Rules in model order (a duplicate is drawn twice, D517). */
  readonly rules: readonly RailroadRuleLayout[];
  /**
   * The canvas grown to cover everything drawn, half the stroke included (D224): a rule name in
   * a large font can rise above its rule.
   */
  readonly bounds: Rect;
}
