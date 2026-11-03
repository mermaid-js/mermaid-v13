// The layout contract for graph diagrams (DESIGN §6.1, D70). Both sides are plain data: the
// diagram measures every box before layout, the engine never measures, and every backend
// (SVG now, ASCII later) reads the same LayoutModel (R-ARCH-3).

import type { LayoutMetrics } from './units.ts';

/** Flow direction: top to bottom, bottom to top, left to right, right to left. */
export type Dir = 'TB' | 'BT' | 'LR' | 'RL';

/** A side of a box. */
export type Side = 'top' | 'right' | 'bottom' | 'left';

export interface Point {
  x: number;
  y: number;
}

/**
 * A point on an edge route. `axis` says how the route runs into the point: `'v'` vertically,
 * `'h'` horizontally. Renderers use it to leave and reach nodes square to their sides.
 */
export interface RoutePoint extends Point {
  axis: 'v' | 'h';
}

export interface Size {
  width: number;
  height: number;
}

export interface Box {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface LayoutNode {
  id: string;
  /** Measured size of the node's box, in the units of the measurer (px for SVG, cells for ASCII). */
  width: number;
  height: number;
  /** Id of the group this node sits in. */
  parent?: string;
  shape?: string;
  /**
   * How much of the side that edges meet may be shared out between edge ends, measured across
   * the flow. 0 keeps every end at the middle. Defaults to the side's length less 24.
   */
  span?: number;
}

export interface LayoutEdge {
  id: string;
  /** Node or group id. */
  source: string;
  /** Node or group id. */
  target: string;
  /** Least number of ranks the edge spans (`---->` gives more than 1). */
  minLen: number;
  /** Measured size of the edge label, including any room the diagram wants around it. */
  label?: Size;
}

export interface LayoutGroup {
  id: string;
  /** Id of the enclosing group. */
  parent?: string;
  /** Own direction. A group that an edge crosses inherits its parent's instead, as in v12. */
  direction?: Dir;
  /** Room between the group's border and its content. The title sits inside `padding.top`. */
  padding: Box;
  title?: Size;
}

export interface LayoutSpacing {
  /** Between nodes in one rank (v12 `nodeSpacing`). */
  node: number;
  /** Between ranks (v12 `rankSpacing`). */
  rank: number;
  /** Between edges that run side by side. */
  edge: number;
}

/** How edges are routed: S-curves, right angles on tracks of their own, or straight lines. */
export type EdgeRouting = 'curved' | 'stepped' | 'straight';

export interface LayoutGraph {
  direction: Dir;
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  groups: LayoutGroup[];
  spacing: LayoutSpacing;
  /** Margin around the whole drawing (v12 `diagramPadding`). Defaults to 0. */
  diagramPadding?: number;
  /** Defaults to `'curved'`. */
  routing?: EdgeRouting;
  /** Room the arrowhead takes at an edge's head; labels sit midway along the visible line. */
  headRoom?: number;
  /**
   * Opt-in width budget (R-LAYOUT-5). A drawing wider than this is laid out tighter, and an
   * LR/RL drawing is turned to TB when the budget is under 640 and that is narrower.
   */
  availableWidth?: number;
  /**
   * The engine's length constants, from the diagram's unit profile (D77). Defaults to the px
   * values, so a graph without them lays out as before.
   */
  metrics?: LayoutMetrics;
  /**
   * Grid quantum (D77, D140): node boxes, ports and tracks land on whole multiples of it, and
   * each edge end gets its own cell. Set to 1 for character cells.
   */
  grid?: number;
}

export interface LayoutModelNode {
  /** Centre of the node's box. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutModelEdge {
  points: RoutePoint[];
  /** Centre of the label, when the edge has one. */
  label?: Point;
  ports: { source: Side; target: Side };
}

export interface LayoutModelGroup {
  /** Centre of the group's box. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Centre of the title band. */
  title: Point;
}

export interface LayoutModel {
  width: number;
  height: number;
  nodes: Map<string, LayoutModelNode>;
  edges: Map<string, LayoutModelEdge>;
  groups: Map<string, LayoutModelGroup>;
  /** May differ from the input when `availableWidth` turned the drawing. */
  direction: Dir;
}

/** What an engine gets besides the graph. Engine-specific settings come from the `layout` config. */
export interface LayoutContext {
  readonly options?: Readonly<Record<string, unknown>>;
}

export type LayoutEngine = (graph: LayoutGraph, ctx?: LayoutContext) => LayoutModel;
