// Ported from Pele (https://github.com/obsidianmd/pele), src/layout/layered.ts at 3a2f075.
// Copyright (c) 2026 kepano. MIT License: see THIRD_PARTY_NOTICES in @mermaid-js/core.
// Changes from Pele: `const enum`s are `as const` objects, and index reads carry `!` for
// noUncheckedIndexedAccess. `NODE_INPUTS`/`EDGE_INPUTS`/`layoutInputs` are new. Length
// constants come from `opt.metrics` (D77), and `opt.grid` puts the layout on a grid (D140).
// The algorithm is otherwise unchanged.
// cspell:ignore kepano lnode lnodes indeg topo cand maxs Köpf
//
// Layered (Sugiyama-style) layout of one flat graph. Ranks run down the y axis; callers
// rotate the result for other directions.
//
// What the layout of edges aims for, most important first. Where two aims pull apart, the one
// higher up decides, and each names where it is carried out.
//
// 1. Lines can be told apart. No two touch or run along each other, and none runs through a
//    node or a label. Ends on one side of a node have places of their own (`spread`), and
//    curves that would pass within a few pixels turn at levels of their own (`assignTracks`).
// 2. Lines cross as little as the order of the nodes allows (`reduceCrossings`, and the order
//    of the levels in `assignTracks`).
// 3. An edge takes the shortest and simplest way: straight if it can, else one curve, else a
//    curve with a level run. One that passes several ranks runs in line with one of its ends
//    and turns once, at the other (`alignLabels`, `straighten`). Ends slide along their sides,
//    and nodes move a little, where that makes an edge straight (`settle`, `snap`).
// 4. An edge meets the middle of a side. An end with a side to itself stays there, and ends
//    that share a side sit around the middle in the order of where they lead. An end moves off
//    the middle only for the aims above (`settle`).
// 5. The drawing is balanced, and what is alike is drawn alike. A label sits midway along the
//    line that shows, the curves either side of it have much the same room to turn in, and a gap
//    whose curves mostly cross has them all as the same plain curve rather than each on a
//    level of its own (`headRoom` in `layered`, the crossed gaps in `assignTracks`).
// 6. An edge leaves and reaches a node square to it, and an arrowhead points straight at the
//    node (`routePath` in svg/edges.ts, which draws the routes).
// 7. Nodes keep the order they were written in, where nothing above says otherwise.
// 8. The drawing stays compact. A gap between ranks grows only to hold the levels in it, or
//    to let curves that cross do so at a clear angle.

import { emptyRanks, pastLabels, straighten } from './bends.ts';
import { emitRoutes, placeNodes } from './emit.ts';
import { placeEnds, spread } from './ends.ts';
import { rankBands } from './gaps.ts';
import {
  Kind,
  type Graph,
  type LEdge,
  type LNode,
  type LayeredOptions,
  type LayeredResult,
} from './graph.ts';
import { reduceCrossings, settlePositions } from './order.ts';
import { position } from './position.ts';
import { orient, rank } from './rank.ts';
import { scratch, u8 } from './scratch.ts';
import { buildGraph, stepOf } from './segments.ts';
import { buildPieces } from './tracks.ts';
export { orient, rank } from './rank.ts';
export { groupArranger, sortLayer } from './order.ts';
export { ease } from './tracks.ts';
export { Kind, type LEdge, type LNode, type LayeredOptions, type LayeredResult } from './graph.ts';

/** The fields of {@link LNode} and {@link LEdge} that `layered` reads. The others are its output. */
export const NODE_INPUTS = [
  'w',
  'h',
  'kind',
  'pin',
  'hint',
  'key',
  'span',
] as const satisfies readonly (keyof LNode)[];
export const EDGE_INPUTS = [
  'tail',
  'head',
  'minlen',
  'labelW',
  'labelH',
  'tailDx',
  'headDx',
  'tailFixed',
  'headFixed',
  'tailEnd',
  'headEnd',
] as const satisfies readonly (keyof LEdge)[];

/** Every input `layered` reads from `nodes` and `edges`. Equal inputs and options give equal layouts. */
export function layoutInputs(nodes: readonly LNode[], edges: readonly LEdge[]): number[] {
  const inputs: number[] = [];
  for (const n of nodes) for (const f of NODE_INPUTS) inputs.push(n[f]);
  for (const e of edges) for (const f of EDGE_INPUTS) inputs.push(+e[f]);
  return inputs;
}

export function lnode(w: number, h: number, kind: Kind = Kind.Node): LNode {
  return { w, h, kind, pin: 0, hint: NaN, key: NaN, span: 0, x: 0, y: 0, rank: 0 };
}

export function ledge(tail: number, head: number, minlen = 1, labelW = 0, labelH = 0): LEdge {
  return {
    tail,
    head,
    minlen,
    labelW,
    labelH,
    tailDx: 0,
    headDx: 0,
    tailFixed: false,
    headFixed: false,
    tailEnd: 0,
    headEnd: 0,
    reversed: false,
    points: [],
    labelX: 0,
    labelY: 0,
  };
}

// Its scratch arrays live until it returns (see scratch.ts); none is kept in what it gives back.
export function layered(nodes: LNode[], edges: LEdge[], opt: LayeredOptions): LayeredResult {
  return scratch(() => layOut(nodes, edges, opt));
}

// Writes the cross-flow positions and the bends of each edge, for `orderOnly`. Points are
// (rank, cross-flow position) pairs.
function orderOnlyLayout(
  g: Graph,
  nodes: LNode[],
  edges: LEdge[],
  opt: LayeredOptions,
  crossings: number,
  declared: number
): LayeredResult {
  const { real, RANK, direct, firstDummy, span } = g;
  const at = position(g, opt);
  for (let i = 0; i < real; i++) nodes[i]!.x = at[i]!;
  for (let ei = 0; ei < edges.length; ei++) {
    const e = edges[ei]!;
    const a = e.reversed ? e.head : e.tail;
    const b = e.reversed ? e.tail : e.head;
    const pts = [RANK[a]!, at[a]!];
    if (!direct[ei]! && firstDummy[ei]! >= 0)
      for (let d = firstDummy[ei]!, end = d + span[ei]! - 1; d < end; d++)
        pts.push(RANK[d]!, at[d]!);
    pts.push(RANK[b]!, at[b]!);
    e.points = pts;
  }
  return { width: 0, height: 0, crossings, declared };
}

function layOut(nodes: LNode[], edges: LEdge[], opt: LayeredOptions): LayeredResult {
  const real = nodes.length;
  if (real === 0) return { width: 0, height: 0 };
  if (real === 1 && edges.length === 0 && nodes[0]!.kind === Kind.Node) {
    const node = nodes[0]!;
    node.rank = 0;
    node.x = node.w / 2;
    node.y = node.h / 2;
    return { width: node.w, height: node.h };
  }
  const step = stepOf(edges, real);
  orient(nodes, edges);
  rank(nodes, edges, step);
  const g = buildGraph(nodes, edges, step, opt);
  let crossings = 0;
  let declared = 0;
  if (g.EF.length > 0 && g.maxRank > 0) {
    [crossings, declared] = reduceCrossings(g, nodes);
    settlePositions(g);
  }
  if (opt.orderOnly) return orderOnlyLayout(g, nodes, edges, opt, crossings, declared);

  if (g.EFK && g.ETK) spread(g, nodes);
  const xs = position(g, opt);
  const empty = emptyRanks(g);
  const labelAt = placeEnds(g, nodes, edges, xs, empty, opt);
  // A rank that holds nothing but the bends of edges is only there because some other edge has a
  // label or a twin. Its bends move onto the straight line between the ends of their edges, and
  // one that gets there is left out of the route, so that the edge is drawn as a single curve.
  const onLine = u8(g.n);
  if (empty && !opt.tracks) straighten(g, xs, empty, opt.apart ? 0 : opt.edgeSep, onLine);
  if (!opt.tracks) pastLabels(g, xs, opt.edgeSep, onLine);
  const pieces = buildPieces(g, xs, empty, onLine, opt);
  const b = rankBands(g, xs, empty, pieces, edges, opt);
  const [minX, maxX] = placeNodes(g, nodes, xs, b, opt);
  emitRoutes(g, nodes, edges, { xs, minX, onLine, pieces, labelAt, b, opt });
  return { width: maxX - minX, height: b.height };
}
