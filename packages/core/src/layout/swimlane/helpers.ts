// Ported from v12 `swimlanes/helpers.ts` at upstream `c9b12739f` (D532). Changed: no pools and no
// anchored nodes (D531); no logger, so the shared-node and nested-lane warnings are left to the
// renderer (D536, T2). A node in two lanes cannot reach the engine (`LayoutNode.parent` is one
// id), so v12's `dropLanesEmptiedBySharedNodes` is gone. A lane's title band grows with its
// measured title, and a nested group's box grows by its own `LayoutGroup` padding.
import type { Edge as MermaidEdge, LayoutData, Node as MermaidNode } from './layoutData.ts';
import { buildLaneModel } from './lanes.ts';

export type Layout = LayoutData;
export type Node = MermaidNode;
export type NodeId = Node['id'];
export type EdgeId = MermaidEdge['id'];

export interface EdgeRef {
  id: EdgeId;
  src: NodeId;
  dst: NodeId;
  weight?: number;
  ref: MermaidEdge;
}

export interface Graph {
  nodes: NodeId[];
  edges: EdgeRef[];
  layout: Layout;
  nodeById: Map<NodeId, Node>;
}

export interface Layering {
  layers: NodeId[][];
  rankOf: Record<NodeId, number>;
  dummy?: Set<NodeId>;
}

export interface OrderedLayers {
  layers: NodeId[][];
}

export interface Coordinates {
  x: Record<NodeId, number>;
  y: Record<NodeId, number>;
}

export type Edge = EdgeRef;

export const DEFAULT_SWIMLANE_ID = '__swimlane_default__';

export interface WriteBackOptions {
  layerGap?: number;
  nodeGap?: number;
}

// Captured swimlane fixtures use 21px as the stable single-line label height.
const TOP_LANE_TITLE_BAND_HEIGHT = 21;
const MIN_TOP_LANE_HORIZONTAL_PADDING = 20;
const MIN_HEADER_MARGIN = 36;

/** The title band of a lane: v12's 21px, or the measured title when that is taller. */
export function topLaneTitleBandHeight(lane: Node): number {
  return Math.max(TOP_LANE_TITLE_BAND_HEIGHT, lane.titleSize?.height ?? 0);
}

/** The room beside a lane's content (and its title) across the flow: `max(padding, 20)`. */
export function topLaneHorizontalPadding(lane: Node): number {
  return Math.max(lane.padding ?? MIN_TOP_LANE_HORIZONTAL_PADDING, MIN_TOP_LANE_HORIZONTAL_PADDING);
}

function assignTopLaneTitleRect(lane: Node): void {
  const { x, y, width, height } = lane;
  const contentTop = lane.swimlaneContentTop;
  if (
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    typeof contentTop !== 'number' ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    !Number.isFinite(contentTop) ||
    width <= 0 ||
    height <= 0
  ) {
    delete lane.groupTitleRect;
    return;
  }

  const top = y - height / 2;
  const headerBottom = Math.min(contentTop, y + height / 2);
  const titleHeight = Math.min(topLaneTitleBandHeight(lane), Math.max(0, headerBottom - top));
  const bottom = top + titleHeight;
  if (bottom <= top) {
    delete lane.groupTitleRect;
    return;
  }

  lane.groupTitleRect = {
    left: x - width / 2,
    right: x + width / 2,
    top,
    bottom,
  };
}

export function prepareLayoutForSwimlanes(layout: LayoutData): void {
  const direction = layout.direction;
  const nodes = layout.nodes;
  const laneModel = buildLaneModel(nodes);
  for (const node of nodes) {
    if (!laneModel.isLane(node.id)) {
      continue;
    }
    node.shape = 'swimlane';
    node.direction = direction;
  }

  const looseNodes = nodes.filter((node) => !node.isGroup && !node.parentId);
  if (looseNodes.length === 0) {
    return;
  }

  let defaultLane = nodes.find((node) => node.id === DEFAULT_SWIMLANE_ID);
  if (!defaultLane) {
    defaultLane = {
      id: DEFAULT_SWIMLANE_ID,
      isGroup: true,
      shape: 'swimlane',
      padding: 20,
      direction,
    };
    nodes.push(defaultLane);
  } else if (defaultLane.isGroup) {
    defaultLane.shape = 'swimlane';
    defaultLane.direction = direction;
  }

  for (const node of looseNodes) {
    node.parentId = DEFAULT_SWIMLANE_ID;
  }
}

/**
 * The graph the Sugiyama phases lay out. Edge-label nodes and their layout-only
 * edges are left out, and a labelled edge takes part as itself, so a label never
 * changes a node's rank. `assignCoordinates` places the labels.
 */
export function toGraphView(layout: LayoutData): Graph {
  const allNodes = layout.nodes.filter((n) => !n.isEdgeLabel);

  const nodeById = new Map<NodeId, Node>();
  for (const n of allNodes) {
    nodeById.set(n.id, n);
  }

  const edges: EdgeRef[] = [];
  for (const e of layout.edges) {
    const src = e.start;
    const dst = e.end;
    if (!src || !dst || e.isLayoutOnly) {
      continue;
    }
    if (src === dst) {
      continue;
    }
    edges.push({ id: e.id, src, dst, ref: e });
  }

  const groupNodes = allNodes.filter((n) => n.isGroup);
  const nonGroupNodes = allNodes.filter((n) => !n.isGroup);

  const nodesInGroupOrder = [...groupNodes].reverse();
  const nodes: NodeId[] = [...nodesInGroupOrder, ...nonGroupNodes].map((n) => n.id);
  return { nodes, edges, layout, nodeById };
}

function groupsDeepestFirst(allNodes: Node[]): Node[] {
  const byId = new Map(allNodes.map((n) => [n.id, n]));
  const depthOf = (node: Node) => {
    let depth = 0;
    let parentId = node.parentId;
    const seen = new Set<NodeId>([node.id]);
    while (parentId !== undefined && !seen.has(parentId)) {
      seen.add(parentId);
      depth++;
      parentId = byId.get(parentId)?.parentId;
    }
    return depth;
  };
  return allNodes
    .filter((n) => n.isGroup)
    .map((n) => ({ node: n, depth: depthOf(n) }))
    .sort((a, b) => b.depth - a.depth)
    .map((entry) => entry.node);
}

interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/**
 * Sizes a nested group around its children's bounds. With a `paddingBox` (from `LayoutGroup`)
 * each side grows by its own padding, so the title fits in the top; without one, v12's single
 * `padding` is split between the sides.
 */
export function applyNestedGroupBounds(group: Node, b: Bounds): void {
  const box = group.paddingBox;
  const pad = group.padding ?? 20;
  const left = b.minX - (box ? box.left : pad / 2);
  const right = b.maxX + (box ? box.right : pad / 2);
  const top = b.minY - (box ? box.top : pad / 2);
  const bottom = b.maxY + (box ? box.bottom : pad / 2);
  group.x = (left + right) / 2;
  group.y = (top + bottom) / 2;
  group.width = Math.max(0, right - left);
  group.height = Math.max(0, bottom - top);
}

function placeNodes(
  layout: Graph,
  ordered: OrderedLayers,
  coords: Coordinates,
  layerGap: number,
  nodeGap: number
): void {
  let layerIndex = 0;
  for (const layer of ordered.layers) {
    let orderIndex = 0;
    for (const id of layer) {
      const node = layout.nodeById.get(id);
      if (!node) {
        orderIndex++;
        continue;
      }
      node.layer = layerIndex;
      node.order = orderIndex;
      node.x = coords.x[id] ?? orderIndex * nodeGap;
      node.y = coords.y[id] ?? layerIndex * layerGap;
      orderIndex++;
    }
    layerIndex++;
  }
}

function childBounds(children: Node[], coords: Coordinates): Bounds | null {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const child of children) {
    const cx = child.x ?? coords.x[child.id];
    const cy = child.y ?? coords.y[child.id];
    const cw = child.width ?? 0;
    const ch = child.height ?? 0;
    if (cx !== undefined && cy !== undefined) {
      if (!child.isEdgeLabel) {
        minX = Math.min(minX, cx - cw / 2);
        maxX = Math.max(maxX, cx + cw / 2);
      }
      minY = Math.min(minY, cy - ch / 2);
      maxY = Math.max(maxY, cy + ch / 2);
    }
  }
  return minX === Infinity || minY === Infinity ? null : { minX, maxX, minY, maxY };
}

/**
 * v12's lane widths: lanes keep their content centres and grow until neighbours meet, each at
 * least as wide as its own content.
 */
function solveLaneWidths(laneIds: NodeId[], centers: number[], baseWidths: number[]) {
  const count = laneIds.length;
  const laneWidths = new Map<NodeId, number>();
  if (count === 1) {
    laneWidths.set(laneIds[0]!, baseWidths[0]!);
    return laneWidths;
  }
  const d: number[] = [];
  for (let i = 0; i < count - 1; i++) {
    d.push(centers[i + 1]! - centers[i]!);
  }

  const u: number[] = Array.from({ length: count }, () => 0);
  for (let i = 0; i < count - 1; i++) {
    u[i + 1] = 2 * d[i]! - u[i]!;
  }

  let lowerBound = 0;
  let upperBound = Number.POSITIVE_INFINITY;
  for (let i = 0; i < count; i++) {
    const baseW = baseWidths[i]!;
    if (i % 2 === 0) {
      lowerBound = Math.max(lowerBound, baseW - u[i]!);
    } else {
      upperBound = Math.min(upperBound, u[i]! - baseW);
    }
  }

  const x = lowerBound <= upperBound ? (lowerBound + upperBound) / 2 : lowerBound;

  for (let i = 0; i < count; i++) {
    const w = u[i]! + (i % 2 === 0 ? x : -x);
    laneWidths.set(laneIds[i]!, Math.max(baseWidths[i]!, w));
  }
  return laneWidths;
}

function sizeTopLevelLanes(topLevelGroups: Node[], groupBounds: Map<NodeId, Bounds>): void {
  let globalMinY = Infinity;
  let globalMaxY = -Infinity;
  let maxPad = 0;
  let maxBand = TOP_LANE_TITLE_BAND_HEIGHT;
  for (const lane of topLevelGroups) {
    const pad = lane.padding ?? 20;
    if (pad > maxPad) {
      maxPad = pad;
    }
    maxBand = Math.max(maxBand, topLaneTitleBandHeight(lane));
    const b = groupBounds.get(lane.id);
    if (!b) {
      continue;
    }
    globalMinY = Math.min(globalMinY, b.minY);
    globalMaxY = Math.max(globalMaxY, b.maxY);
  }
  if (globalMinY === Infinity || globalMaxY === -Infinity) {
    return;
  }
  const contentHeight = Math.max(0, globalMaxY - globalMinY);
  // v12 keeps 36 above the content, 15 more than its 21px band; a taller title keeps the 15.
  const minHeaderMargin = Math.max(
    MIN_HEADER_MARGIN,
    maxBand + MIN_HEADER_MARGIN - TOP_LANE_TITLE_BAND_HEIGHT
  );
  const verticalMargin = Math.max(maxPad, minHeaderMargin);
  const laneHeight = contentHeight + 2 * verticalMargin;
  const centerY = (globalMinY + globalMaxY) / 2;
  for (const lane of topLevelGroups) {
    lane.y = centerY;
    lane.height = laneHeight;
    lane.swimlaneContentTop = globalMinY;
  }

  const sortedLanes = [...topLevelGroups].sort((a, b) => (a.x ?? 0) - (b.x ?? 0));

  const laneIds: NodeId[] = [];
  const centers: number[] = [];
  const baseWidths: number[] = [];

  for (const lane of sortedLanes) {
    const b = groupBounds.get(lane.id);
    if (!b) {
      continue;
    }
    laneIds.push(lane.id);
    centers.push((b.minX + b.maxX) / 2);
    baseWidths.push(Math.max(0, b.maxX - b.minX) + 2 * topLaneHorizontalPadding(lane));
  }

  if (laneIds.length === 0) {
    return;
  }
  const laneWidths = solveLaneWidths(laneIds, centers, baseWidths);
  for (const lane of topLevelGroups) {
    const w = laneWidths.get(lane.id);
    if (w !== undefined) {
      lane.width = w;
    }
    assignTopLaneTitleRect(lane);
  }
}

export function writeBackToLayoutData(
  g: Graph,
  ordered: OrderedLayers,
  coords: Coordinates,
  opts?: WriteBackOptions
): void {
  const { layout } = g;
  placeNodes(g, ordered, coords, opts?.layerGap ?? 100, opts?.nodeGap ?? 40);

  const allNodes = layout.nodes;
  // Edge labels have no rank; their seed position comes from the coordinates.
  // Anchoring moves them onto the routed edge later.
  for (const label of allNodes) {
    const lx = coords.x[label.id];
    const ly = coords.y[label.id];
    if (label.isEdgeLabel && lx !== undefined && ly !== undefined) {
      label.x = lx;
      label.y = ly;
    }
  }
  const groupBounds = new Map<NodeId, Bounds>();
  const laneModel = buildLaneModel(allNodes);
  const topLevelGroups: Node[] = [];
  for (const group of groupsDeepestFirst(allNodes)) {
    if (laneModel.isLane(group.id)) {
      topLevelGroups.push(group);
    }
    // A lane is sized across the flow by its nodes: the room reserved for edge labels
    // reaches it through the column spacing, and anchoring moves each label onto its
    // edge later. Along the flow it also holds the labels, which can be taller than
    // the row of nodes they sit beside.
    const children = allNodes.filter((n) => n.parentId === group.id);
    const bounds = childBounds(children, coords);
    if (!bounds) {
      group.x = group.x ?? 0;
      group.y = group.y ?? 0;
      group.width = group.width ?? 0;
      group.height = group.height ?? 0;
    } else if (group.parentId) {
      applyNestedGroupBounds(group, bounds);
      groupBounds.set(group.id, bounds);
    } else {
      const pad = group.padding ?? 20;
      const { minX, maxX, minY, maxY } = bounds;
      group.x = (minX + maxX) / 2;
      group.y = (minY + maxY) / 2;
      group.width = Math.max(0, maxX - minX) + 2 * topLaneHorizontalPadding(group);
      group.height = Math.max(0, maxY - minY) + pad;
      groupBounds.set(group.id, bounds);
    }
  }

  if (topLevelGroups.length > 0 && groupBounds.size > 0) {
    sizeTopLevelLanes(topLevelGroups, groupBounds);
  }
}
