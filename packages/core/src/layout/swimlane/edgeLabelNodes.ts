// Ported from v12 `swimlanes/edgeLabelNodes.ts` at upstream `c9b12739f` (D532). Changed: the label
// is a measured size (`LayoutEdge.label`), so the label node takes it as its own size; no logger,
// an edge with an unknown end is skipped silently (the adapter rejects one before this runs).
// Synthetic ids carry a `\0`, which no author id holds, so they cannot clash with the graph's.
// An edge that ends on a lane puts its label in that lane (v12 read the lane's own parent, none).
/**
 * Edge Label Nodes Transformation (label-as-waypoint variant)
 *
 * For each labelled edge, this transform creates an `\0edge-label\0…` node that
 * participates in the Sugiyama layout (so the label text gets a deterministic
 * position in a lane). Unlike the older split-edge model, it leaves the
 * original labelled edge in place and stamps `labelNodeId` on it — the router
 * uses that stamp to thread the original edge's single polyline through the
 * label node's center.
 *
 * Two `isLayoutOnly` virtual edges (A→label, label→B) are appended to the
 * layout so that Sugiyama's layering and ordering honour the label's position
 * between source and target. They are never routed or rendered: the router and
 * renderer skip any edge flagged with `isLayoutOnly`.
 */

import type { Edge, LayoutData, Node } from './layoutData.ts';

/** The id of the label node of edge `edgeId`. */
export const labelNodeIdOf = (edgeId: string): string => `\0edge-label\0${edgeId}`;

/** The container a label at `node` belongs in: the node's parent, or the node when it is a lane. */
const containerOf = (node: Node): string | undefined =>
  node.isGroup && !node.parentId ? node.id : node.parentId;

/**
 * Transforms edges with labels into label nodes + layout-only virtual edges.
 *
 * For each edge with a label:
 * 1. Creates a label node the size of the label.
 * 2. Assigns the label node to the source or target lane (cross-lane edges
 *    prefer the target lane for tighter routing).
 * 3. Stamps `labelNodeId` on the original edge.
 * 4. Appends two `isLayoutOnly: true` virtual edges (A→label, label→B) so
 *    Sugiyama places the label between source and target. The router skips
 *    these; only the original edge is routed (threading through the label
 *    node's center).
 *
 * @param data - The layout data to transform
 * @returns The transformed layout data with label nodes and virtual edges
 */
export function createEdgeLabelNodes(data: LayoutData): LayoutData {
  const nodesToAdd: Node[] = [];
  const layoutOnlyEdges: Edge[] = [];

  const nodeById = new Map<string, Node>();
  for (const node of data.nodes) {
    nodeById.set(node.id, node);
  }

  for (const edge of data.edges) {
    const label = edge.label;
    if (!label) {
      continue;
    }
    if (edge.isLayoutOnly) {
      continue;
    }
    // Guard against double-processing if the caller invokes us twice.
    if (edge.labelNodeId) {
      continue;
    }

    const sourceNode = nodeById.get(edge.start);
    const targetNode = nodeById.get(edge.end);

    if (!sourceNode || !targetNode) {
      continue;
    }

    const labelNodeId = labelNodeIdOf(edge.id);

    // For cross-lane edges, assign to the target lane for better routing:
    // it keeps the label closer to where the edge is heading and avoids long
    // detours back to the source lane.
    const isCrossLane = containerOf(sourceNode) !== containerOf(targetNode);
    const labelLane = isCrossLane ? containerOf(targetNode) : containerOf(sourceNode);

    const labelNode: Node = {
      id: labelNodeId,
      edgeStart: edge.start,
      edgeEnd: edge.end,
      shape: 'labelRect',
      width: label.width,
      height: label.height,
      isEdgeLabel: true,
      isDummy: true,
      isGroup: false,
      ...(labelLane === undefined ? {} : { parentId: labelLane }),
    };

    nodesToAdd.push(labelNode);

    // Stamp the original edge so the router can decompose routing through the
    // label's center when producing a single polyline.
    edge.labelNodeId = labelNodeId;

    // Layout-only virtual edges: Sugiyama uses these to place the label node
    // between source and target. They are not routed or rendered — consumers
    // must skip any edge with `isLayoutOnly: true`.
    layoutOnlyEdges.push(
      { id: `${edge.id}\0to-label`, start: edge.start, end: labelNodeId, isLayoutOnly: true },
      { id: `${edge.id}\0from-label`, start: labelNodeId, end: edge.end, isLayoutOnly: true }
    );
  }

  return {
    ...data,
    nodes: [...data.nodes, ...nodesToAdd],
    edges: [...data.edges, ...layoutOnlyEdges],
  };
}
