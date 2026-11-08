/**
 * SankeyLayout: the plain-data result of the sankey custom layout (`layoutKind: 'custom'`, spec
 * #427 §Layout). Every length is in px (sankey draws SVG only, D320), in the diagram's
 * coordinates: d3-sankey's extent `[[0, 0], [width, height]]`, drawn as it is.
 */
import type { AstId } from '@mermaid-js/core/parser-kit';
import type { FontKey } from '@mermaid-js/core/text';

/** `nodeAlignment`: d3-sankey's `sankeyLeft`, `sankeyRight`, `sankeyCenter`, `sankeyJustify`. */
export type SankeyAlignment = 'left' | 'right' | 'center' | 'justify';

/** `labelStyle`. */
export type SankeyLabelStyle = 'legacy' | 'outlined';

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
  /** The measured text's box: its advance width, from ascent to descent about the baseline. */
  readonly box: Rect;
}

export interface SankeyNodeLayout {
  /** The node's index in `SankeyModel.nodes`. */
  readonly index: number;
  readonly id: string;
  readonly ast: AstId;
  /** d3-sankey's box. */
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
  /** d3-sankey's `value`: the larger of the node's in and out flow sums. */
  readonly value: number;
  /** The column the node is drawn in (d3's `layer`). */
  readonly layer: number;
  /**
   * The Tableau10 slot (the node's index among the nodes `nodeColors` does not name, mod 10);
   * absent when `nodeColors` names the node.
   */
  readonly slot?: number;
  /** `nodeColors[id]`, or the slot's Tableau10 colour. */
  readonly colour: string;
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
  /** The link's index in `SankeyModel.links`. */
  readonly index: number;
  readonly ast: AstId;
  /** The source and target nodes' indices in `SankeyModel.nodes`. */
  readonly source: number;
  readonly target: number;
  /** The flow drawn (`SankeyLink.flow`). */
  readonly flow: number;
  /** d3-sankey's `width`: the flow at the layout's scale. */
  readonly width: number;
  /** The stroke width v12 draws: `max(1, width)`. */
  readonly strokeWidth: number;
  /** The link's centre line where it leaves its source and where it reaches its target. */
  readonly y0: number;
  readonly y1: number;
  readonly path: SankeyLinkPath;
  /** The source's and target's colours (for `linkColor` `source`, `target` and `gradient`). */
  readonly sourceColour: string;
  readonly targetColour: string;
}

export interface SankeyLayout {
  /** The extent: `width` × `height` from the `sankey` config. */
  readonly width: number;
  readonly height: number;
  /**
   * The padding between the nodes of a column: `nodePadding` (+ `valuePadding` under
   * `showValues`), less when a column would not fit (d3's `py`).
   */
  readonly padding: number;
  /** One per model node, in model order (v12's SVG order). */
  readonly nodes: readonly SankeyNodeLayout[];
  /** One per model link, in model order. */
  readonly links: readonly SankeyLinkLayout[];
  readonly labelStyle: SankeyLabelStyle;
  /** The font the labels were measured in, and so are drawn in. */
  readonly font: FontKey;
  /** What is drawn: the nodes and the labels, with no padding (D224); all 0 when empty. */
  readonly bounds: Rect;
}
