/**
 * SankeyLayout: the plain-data result of the sankey custom layout (`layoutKind: 'custom'`, spec
 * #427 §Layout). Every length is in px (sankey draws SVG only, D320), in the diagram's
 * coordinates: d3-sankey's extent `[[0, 0], [width, height]]`, drawn as it is. Fields marked
 * "Not drawn" are read only by the invariants (`invariants.ts`) and the specs.
 */
import type { SankeyLabelStyle, SankeyNodeAlignment } from '@mermaid-js/core/config';
import type { AstId } from '@mermaid-js/core/parser-kit';
import type { SafeColor } from '@mermaid-js/core/svg';
import type { FontKey } from '@mermaid-js/core/text';

/**
 * `nodeAlignment` (the schema's `SankeyNodeAlignment`): d3-sankey's `sankeyLeft`, `sankeyRight`,
 * `sankeyCenter`, `sankeyJustify`.
 */
export type SankeyAlignment = SankeyNodeAlignment;

/** `labelStyle` (the schema's). */
export type { SankeyLabelStyle };

/** How links are stroked (`linkColor`): a mode, or one colour for every link. */
export type LinkPaint = 'gradient' | 'source' | 'target' | SafeColor;

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Rect extends Point {
  readonly width: number;
  readonly height: number;
}

/** A node's label (D395): one line of plain text, measured. */
export interface SankeyLabel {
  /** The name, or `name prefix<value>suffix` under `showValues` (value rounded to 2 decimals). */
  readonly text: string;
  /** The anchor: `labelGap` right of `x1` (`start`) or left of `x0` (`end`). */
  readonly x: number;
  /** The node's vertical centre. */
  readonly y: number;
  /** The baseline's shift below `y`: 0 under `showValues`, else v12's `0.35em` in px. */
  readonly dy: number;
  readonly anchor: 'start' | 'end';
  /**
   * The measured text's box: its advance width, from ascent to descent about the baseline. Not
   * drawn: the layout's bounds hold it.
   */
  readonly box: Rect;
}

export interface SankeyNodeLayout {
  /** The node's index in `SankeyModel.nodes`. Not drawn. */
  readonly index: number;
  /** The node's name. Not drawn (the label's `text` is). */
  readonly id: string;
  readonly ast: AstId;
  /** d3-sankey's box. */
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
  /** d3-sankey's `value`: the larger of the node's in and out flow sums. Not drawn. */
  readonly value: number;
  /** The column the node is drawn in (d3's `layer`). Not drawn. */
  readonly layer: number;
  /**
   * The rect's fill: the node's `nodeColors` entry when it passes core's colour check, else its
   * Tableau10 slot's colour (its index among the nodes `nodeColors` gives no valid colour, mod
   * 10).
   */
  readonly fill: SafeColor;
  readonly label: SankeyLabel;
}

/** A link's path: d3-shape `linkHorizontal`'s cubic, `M from C c1 c2 to`. */
export interface SankeyLinkPath {
  /** `[source.x1, y0]`. */
  readonly from: Point;
  /** Half way across, at the source's height. */
  readonly c1: Point;
  /** Half way across, at the target's height. */
  readonly c2: Point;
  /** `[target.x0, y1]`. */
  readonly to: Point;
}

export interface SankeyLinkLayout {
  /** The link's index in `SankeyModel.links`. Not drawn. */
  readonly index: number;
  readonly ast: AstId;
  /** The source and target nodes' indices in `SankeyModel.nodes`. Not drawn. */
  readonly source: number;
  readonly target: number;
  /** The flow drawn (`SankeyLink.flow`). Not drawn. */
  readonly flow: number;
  /** d3-sankey's `width`: the flow at the layout's scale. Not drawn (`strokeWidth` is). */
  readonly width: number;
  /** The stroke width v12 draws: `max(1, width)`. */
  readonly strokeWidth: number;
  /**
   * The link's centre line where it leaves its source and where it reaches its target. Not
   * drawn (`path` is).
   */
  readonly y0: number;
  readonly y1: number;
  readonly path: SankeyLinkPath;
  /** The source's and target's fills (for `linkColor` `source`, `target` and `gradient`). */
  readonly sourceFill: SafeColor;
  readonly targetFill: SafeColor;
}

export interface SankeyLayout {
  /** The extent: `width` × `height` from the `sankey` config. Not drawn (`bounds` is). */
  readonly width: number;
  readonly height: number;
  /**
   * The padding between the nodes of a column: `nodePadding` (+ `valuePadding` under
   * `showValues`), less when a column would not fit (d3's `py`). Not drawn.
   */
  readonly padding: number;
  /** One per model node, in model order (v12's SVG order). */
  readonly nodes: readonly SankeyNodeLayout[];
  /** One per model link, in model order. */
  readonly links: readonly SankeyLinkLayout[];
  readonly labelStyle: SankeyLabelStyle;
  /** `linkColor` as drawn (`config.ts`): a mode, or one colour for every link. */
  readonly linkColor: LinkPaint;
  /** Whether the root is `width="100%"` with a `max-width` (`sankey.useMaxWidth`). */
  readonly useMaxWidth: boolean;
  /** The font the labels were measured in, and so are drawn in. */
  readonly font: FontKey;
  /**
   * What is drawn, with no padding (D224); all 0 when empty: the nodes, the label boxes (grown
   * by half the outline under `outlined`, its halo), and each link's stroke (at least 1 px wide,
   * so a zero link or a 0-high node still counts).
   */
  readonly bounds: Rect;
}
