// Ported from v12 `swimlanes/direction/lrTransform.ts` at upstream `c9b12739f` (D532). Changed:
// no anchored-node footprints (D531); nested groups grow by their own `LayoutGroup` padding; the
// left title band grows with the measured title; and RL and BT keep the lane title band where
// D536 puts it (left for RL, top for BT), where v12 mirrored it to the right and the bottom.
import type { LayoutData, Node } from '../layoutData.ts';
import { buildLaneModel } from '../lanes.ts';
import { applyNestedGroupBounds, topLaneTitleBandHeight } from '../helpers.ts';

type LayoutNode = Node;
type Direction = 'LR' | 'RL';
type Axis = 'x' | 'y';

function buildNodeMap(nodes: LayoutNode[]): Map<string, LayoutNode> {
  return new Map(nodes.map((node) => [node.id, node]));
}

function groupDepth(group: LayoutNode, nodeById: Map<string, LayoutNode>): number {
  const seen = new Set<string>([group.id]);
  let depth = 0;
  let parentId = group.parentId;
  while (parentId && !seen.has(parentId)) {
    const parent = nodeById.get(parentId);
    if (!parent?.isGroup) {
      break;
    }
    seen.add(parentId);
    depth++;
    parentId = parent.parentId;
  }
  return depth;
}

function boundsForChildren(
  children: LayoutNode[]
): { minX: number; maxX: number; minY: number; maxY: number } | null {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const child of children) {
    const cx = child.x;
    const cy = child.y;
    if (typeof cx !== 'number' || typeof cy !== 'number') {
      continue;
    }
    const w = child.width ?? 0;
    const h = child.height ?? 0;
    minX = Math.min(minX, cx - w / 2);
    maxX = Math.max(maxX, cx + w / 2);
    minY = Math.min(minY, cy - h / 2);
    maxY = Math.max(maxY, cy + h / 2);
  }
  if (minX === Infinity || minY === Infinity) {
    return null;
  }
  return { minX, maxX, minY, maxY };
}

export function recomputeNestedGroupBounds(nodes: LayoutNode[]): void {
  const nodeById = buildNodeMap(nodes);
  const groupsByDepth = nodes
    .filter((node) => node.isGroup && node.parentId)
    .sort((a, b) => groupDepth(b, nodeById) - groupDepth(a, nodeById));

  for (const group of groupsByDepth) {
    const children = nodes.filter((node) => node.parentId === group.id);
    const bounds = boundsForChildren(children);
    if (bounds) {
      applyNestedGroupBounds(group, bounds);
    }
  }
}

function mirrorAxis(layout: LayoutData, axis: Axis): boolean {
  const nodes = layout.nodes;
  const edges = layout.edges;
  const contentNodes = nodes.filter((node) => !node.isGroup);
  let min = Infinity;
  let max = -Infinity;
  for (const node of contentNodes) {
    const value = node[axis];
    if (typeof value !== 'number') {
      continue;
    }
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return false;
  }
  const mirror = (value: number) => min + max - value;
  for (const node of nodes) {
    const value = node[axis];
    if (typeof value === 'number') {
      node[axis] = mirror(value);
    }
    const titleRect = node.groupTitleRect;
    if (titleRect) {
      node.groupTitleRect =
        axis === 'x'
          ? {
              ...titleRect,
              left: mirror(titleRect.right),
              right: mirror(titleRect.left),
            }
          : {
              ...titleRect,
              top: mirror(titleRect.bottom),
              bottom: mirror(titleRect.top),
            };
    }
  }
  for (const edge of edges) {
    for (const point of edge.points ?? []) {
      point[axis] = mirror(point[axis]);
    }
  }
  return true;
}

export function applyBtDirectionTransform(layout: LayoutData): boolean {
  const nodes = layout.nodes;
  if (!nodes.some((node) => !node.isGroup)) {
    return true;
  }

  if (!mirrorAxis(layout, 'y')) {
    return false;
  }
  // A nested group's title stays at its top, and a lane's title band stays on top (D536).
  recomputeNestedGroupBounds(nodes);
  for (const node of nodes) {
    const rect = node.groupTitleRect;
    if (rect && node.y !== undefined && node.height !== undefined) {
      const top = node.y - node.height / 2;
      node.groupTitleRect = { ...rect, top, bottom: top + (rect.bottom - rect.top) };
    }
  }
  return true;
}

/**
 * How far the LR/RL transform stretches the flow axis: the diagram's own nodes' average
 * width over their average height, never below 1. Edge labels and groups do not count, so a
 * label cannot stretch the flow axis.
 */
export function flowAxisStretch(
  nodes: readonly { width?: number; height?: number; isGroup?: boolean; isEdgeLabel?: boolean }[]
): number {
  const scaledNodes = nodes.filter((n) => !n.isGroup && !n.isEdgeLabel);
  if (scaledNodes.length === 0) {
    return 1;
  }
  let totalWidth = 0;
  let totalHeight = 0;
  for (const n of scaledNodes) {
    totalWidth += n.width ?? 0;
    totalHeight += n.height ?? 0;
  }
  const avgWidth = totalWidth / scaledNodes.length;
  const avgHeight = totalHeight / scaledNodes.length;
  return avgHeight > 0 ? Math.max(1, avgWidth / avgHeight) : 1;
}

const LANE_TITLE_BAND = 36;
// v12's band is 36 wide for its 21px title; a taller (rotated) title keeps the 15 to spare.
const LANE_TITLE_SPARE = 15;

/** The width of the left title band: v12's 36, or the tallest lane title and 15 to spare. */
export function leftTitleBandWidth(lanes: readonly Node[]): number {
  let band = LANE_TITLE_BAND;
  for (const lane of lanes) {
    if (lane.titleSize) {
      band = Math.max(band, topLaneTitleBandHeight(lane) + LANE_TITLE_SPARE);
    }
  }
  return band;
}

/** Rotates the TB layout onto LR: ranks run along x, stretched by `flowAxisStretch`. */
function rotateContent(layout: LayoutData, contentNodes: LayoutNode[], titleBandSize: number) {
  let minX = Infinity;
  let minY = Infinity;
  for (const n of contentNodes) {
    minX = Math.min(minX, n.x ?? 0);
    minY = Math.min(minY, n.y ?? 0);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return false;
  }
  const horizontalScaleFactor = flowAxisStretch(contentNodes);
  const rotate = (p: { x?: number; y?: number }) => {
    const x0 = p.x ?? 0;
    const y0 = p.y ?? 0;
    p.x = (y0 - minY) * horizontalScaleFactor + titleBandSize;
    p.y = x0 - minX;
  };
  for (const n of contentNodes) {
    rotate(n);
  }
  for (const e of layout.edges) {
    for (const p of e.points ?? []) {
      rotate(p);
    }
  }
  return true;
}

interface LaneBounds {
  lane: LayoutNode;
  contentTop: number;
  contentBottom: number;
  centerY: number;
}

interface LaneGeometry {
  laneLeft: number;
  laneWidth: number;
  verticalMargin: number;
  titleBandSize: number;
}

function placeLanes(laneBounds: LaneBounds[], geometry: LaneGeometry): void {
  const { laneLeft, laneWidth, verticalMargin, titleBandSize } = geometry;
  const centerX = laneLeft + laneWidth / 2;
  laneBounds.sort((a, b) => a.centerY - b.centerY);

  for (let i = 0; i < laneBounds.length; i++) {
    const curr = laneBounds[i]!;
    const prev = laneBounds[i - 1];
    const next = laneBounds[i + 1];
    const laneTop = prev
      ? (prev.contentBottom + curr.contentTop) / 2
      : curr.contentTop - verticalMargin;
    const laneBottom = next
      ? (curr.contentBottom + next.contentTop) / 2
      : curr.contentBottom + verticalMargin;

    curr.lane.x = centerX;
    curr.lane.y = (laneTop + laneBottom) / 2;
    curr.lane.width = laneWidth;
    curr.lane.height = Math.max(0, laneBottom - laneTop);
    curr.lane.swimlaneContentTop = curr.contentTop;
    curr.lane.groupTitleRect = {
      left: laneLeft,
      right: laneLeft + titleBandSize,
      top: laneTop,
      bottom: laneBottom,
    };
  }
}

export function applyLrDirectionTransform(
  layout: LayoutData,
  direction: Direction = 'LR'
): boolean {
  const nodes = layout.nodes;
  const contentNodes = nodes.filter((n) => !n.isGroup);
  const laneModel = buildLaneModel(nodes);
  const laneNodes = nodes.filter((n) => laneModel.isLane(n.id));
  const titleBandSize = leftTitleBandWidth(laneNodes);

  if (!rotateContent(layout, contentNodes, titleBandSize)) {
    return false;
  }
  // RL mirrors the content before the lanes are sized, so the title band stays on the left.
  if (direction === 'RL') {
    mirrorAxis(layout, 'x');
  }

  recomputeNestedGroupBounds(nodes);

  if (laneNodes.length === 0) {
    return true;
  }

  const childrenByLane = new Map<string, LayoutNode[]>();
  for (const n of nodes) {
    if (laneModel.isLane(n.id)) {
      continue;
    }
    const laneId = laneModel.laneIdOf(n.id);
    if (!laneId) {
      continue;
    }
    const bucket = childrenByLane.get(laneId) ?? [];
    bucket.push(n);
    childrenByLane.set(laneId, bucket);
  }

  let maxPad = 0;
  for (const lane of laneNodes) {
    const pad = lane.padding ?? 0;
    if (pad > maxPad) {
      maxPad = pad;
    }
  }

  const laneBounds: LaneBounds[] = [];
  let globalMinXChild = Infinity;
  let globalMaxXChild = -Infinity;

  for (const lane of laneNodes) {
    const bounds = boundsForChildren(childrenByLane.get(lane.id) ?? []);
    if (!bounds) {
      continue;
    }
    globalMinXChild = Math.min(globalMinXChild, bounds.minX);
    globalMaxXChild = Math.max(globalMaxXChild, bounds.maxX);

    laneBounds.push({
      lane,
      contentTop: bounds.minY,
      contentBottom: bounds.maxY,
      centerY: (bounds.minY + bounds.maxY) / 2,
    });
  }

  if (globalMinXChild === Infinity || globalMaxXChild === -Infinity) {
    return true;
  }

  const fullContentWidth = Math.max(0, globalMaxXChild - globalMinXChild);
  const horizontalMargin = Math.max(maxPad, 10);
  const bodyWidth = fullContentWidth + 2 * horizontalMargin;
  const laneWidth = titleBandSize + bodyWidth;
  const bodyCenter = (globalMinXChild + globalMaxXChild) / 2;
  const bodyLeft = bodyCenter - bodyWidth / 2;
  const laneLeft = bodyLeft - titleBandSize;
  const verticalMargin = Math.max(maxPad, titleBandSize);

  placeLanes(laneBounds, { laneLeft, laneWidth, verticalMargin, titleBandSize });
  return true;
}
