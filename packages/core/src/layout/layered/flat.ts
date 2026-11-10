// cspell:ignore lnode lnodes ledges
import type {
  Dir,
  LayoutGraph,
  LayoutModel,
  LayoutModelEdge,
  LayoutModelNode,
  RoutePoint,
} from '../types.ts';
import type { LayoutMetrics } from '../units.ts';
import { layered as flatLayout, ledge, lnode, type LayeredOptions, type LEdge } from './layered.ts';
import { flowEnd, flowStart, gridLoop, ontoCells, selfLoop, sideOf } from './routes.ts';

// With no groups there are no compound ports, ordering keys or nested offsets. Build the
// mutable flat-layout state directly; LayoutGraph arrays and their records remain caller-owned.
export function runFlat(
  graph: LayoutGraph,
  dir: Dir,
  opt: LayeredOptions,
  grid: number,
  M: LayoutMetrics
): LayoutModel {
  const vertical = dir === 'TB' || dir === 'BT';
  const flip = dir === 'BT' || dir === 'RL';
  const index = new Map<string, number>();
  const lnodes = graph.nodes.map((n, i) => {
    index.set(n.id, i);
    const node = lnode(vertical ? n.width : n.height, vertical ? n.height : n.width);
    node.span = n.span ?? Math.max(0, node.w - 2 * M.corner);
    return node;
  });
  const loopCount = new Int32Array(lnodes.length);
  const loopsSeen = new Int32Array(lnodes.length);
  const loopRoom = grid ? new Float64Array(lnodes.length) : undefined;
  const edgeIndex = new Int32Array(graph.edges.length).fill(-1);
  const ledges: LEdge[] = [];
  graph.edges.forEach((e, i) => {
    const src = index.get(e.source)!;
    const dst = index.get(e.target)!;
    if (src === dst) {
      loopCount[src]!++;
      const label = (vertical ? e.label?.width : e.label?.height) ?? 0;
      // A loop reserves room across the flow, before positions are computed. Its visible box
      // retains the input size, just as in the compound path (including on the grid).
      const room = 2 * (M.loop + (label > 0 ? label + M.loopGap : 0));
      if (loopRoom) loopRoom[src]! += room;
      else lnodes[src]!.w += room;
      return;
    }
    const edge = ledge(
      src,
      dst,
      Math.max(1, Math.round(e.minLen)),
      (vertical ? e.label?.width : e.label?.height) ?? 0,
      (vertical ? e.label?.height : e.label?.width) ?? 0
    );
    if (e.startLabel)
      edge.tailEnd = (vertical ? e.startLabel.height : e.startLabel.width) + M.endLabelAlong;
    if (e.endLabel)
      edge.headEnd =
        (vertical ? e.endLabel.height : e.endLabel.width) + M.endLabelAlong + (opt.headRoom ?? 0);
    edgeIndex[i] = ledges.length;
    ledges.push(edge);
  });
  if (loopRoom) lnodes.forEach((node, i) => (node.w += loopRoom[i]!));
  const size = flatLayout(lnodes, ledges, opt);
  const across = (y: number): number => (flip ? size.height - y : y);
  const tx = (x: number, y: number): number => 0 + (vertical ? x : across(y));
  const ty = (x: number, y: number): number => 0 + (vertical ? across(y) : x);
  const margin = grid ? Math.ceil(graph.diagramPadding ?? 0) : (graph.diagramPadding ?? 0);
  const pad = margin - grid / 2;
  const nodes = new Map<string, LayoutModelNode>();
  graph.nodes.forEach((n, i) => {
    const node = lnodes[i]!;
    nodes.set(n.id, {
      x: tx(node.x, node.y) + pad,
      y: ty(node.x, node.y) + pad,
      width: n.width,
      height: n.height,
    });
  });
  const edges = new Map<string, LayoutModelEdge>();
  graph.edges.forEach((e, i) => {
    const sourceBox = nodes.get(e.source)!;
    const targetBox = nodes.get(e.target)!;
    if (e.source === e.target) {
      const src = index.get(e.source)!;
      const loop = grid ? gridLoop : selfLoop;
      edges.set(
        e.id,
        loop(sourceBox, !vertical, e.label, M, grid, {
          nth: loopsSeen[src]!++,
          count: loopCount[src]!,
        })
      );
      return;
    }
    const edge = ledges[edgeIndex[i]!]!;
    const points: RoutePoint[] = [];
    // Compound route assembly drops consecutive points less than 0.01 apart, before padding.
    let lastX = Infinity;
    let lastY = Infinity;
    for (let p = 0; p < edge.points.length; p += 2) {
      const x = tx(edge.points[p]!, edge.points[p + 1]!);
      const y = ty(edge.points[p]!, edge.points[p + 1]!);
      if (Math.abs(lastX - x) < 0.01 && Math.abs(lastY - y) < 0.01) continue;
      points.push({ x: x + pad, y: y + pad, axis: vertical ? 'v' : 'h' });
      lastX = x;
      lastY = y;
    }
    const source = sideOf(sourceBox, points[0], flowEnd(dir));
    const target = sideOf(targetBox, points.at(-1), flowStart(dir));
    const model: LayoutModelEdge = {
      points: grid ? ontoCells(points, source, target, grid) : points,
      ports: { source, target },
    };
    // The compound path transforms labels only when their original width is positive.
    if ((e.label?.width ?? 0) > 0)
      model.label = {
        x: tx(edge.labelX, edge.labelY) + pad,
        y: ty(edge.labelX, edge.labelY) + pad,
      };
    else if ((e.label?.height ?? 0) > 0) model.label = { x: pad, y: pad };
    edges.set(e.id, model);
  });
  return {
    width: (vertical ? size.width : size.height) + 2 * margin,
    height: (vertical ? size.height : size.width) + 2 * margin,
    nodes,
    edges,
    groups: new Map(),
    direction: dir,
  };
}
