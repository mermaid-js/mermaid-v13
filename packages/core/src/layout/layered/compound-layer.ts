// Ported from Pele (https://github.com/obsidianmd/pele), src/layout/compound.ts at 3a2f075.
// Copyright (c) 2026 kepano. MIT License: see THIRD_PARTY_NOTICES in @mermaid-js/core.
// Changes from Pele: split out of `compound.ts` (D596): the graph `layered` gets for one level, the
// flat layout that orders the levels together, and the cache of levels laid out. The algorithm is unchanged.
// cspell:ignore kepano lnode lnodes cnode
//
import type { CEdge } from './compound.ts';
import { endpointBelow } from './compound-own.ts';
import {
  opposite,
  Side,
  startSide,
  type Compound,
  type Level,
  type PortEdge,
} from './compound-state.ts';
import {
  Kind,
  layered,
  layoutInputs,
  ledge,
  lnode,
  type LEdge,
  type LNode,
  type LayeredResult,
} from './layered.ts';

// The graph `layered` gets for a level: its items and edges, and for each port of the level the
// dummy node that stands for it (-1 where it has none).
export interface Layer {
  lnodes: LNode[];
  ledges: LEdge[];
  dummies: Int32Array;
}

const isVertical = (level: Level): boolean => level.dir === 'TB' || level.dir === 'BT';

// The room an edge-end label takes along the flow of its level, with the room before it (D102).
function endRoom(size: CEdge['start'], vertical: boolean): number {
  return size ? (vertical ? size.height : size.width) + size.along : 0;
}

function heldEnd(c: Compound, item: number, ei: number, out: boolean): boolean {
  return c.nodes[item]!.isGroup && endpointBelow(item, c.edges[ei]!, out);
}

// How far along the side of a group an edge's end sits from the group's middle, once sized.
function endOffset(
  c: Compound,
  level: Level,
  sized: boolean,
  item: number,
  ei: number,
  out: boolean
): number {
  const { nodes, edges, levelOf } = c;
  if (!sized || !nodes[item]!.isGroup || !endpointBelow(item, edges[ei]!, out)) return 0;
  const port = levelOf.get(item)!.portOf.get(ei * 2 + (out ? 0 : 1))!;
  return isVertical(level) ? port.px - nodes[item]!.w / 2 : port.py - nodes[item]!.h / 2;
}

function layerNodes(c: Compound, level: Level, sized: boolean): LNode[] {
  const { nodes, local, key, M, hooks } = c;
  const vertical = isVertical(level);
  const lnodes: LNode[] = [];
  level.items.forEach((item, i) => {
    local[item] = i;
    const node = nodes[item]!;
    const sw = node.w + node.loopW;
    const sh = node.h + node.loopH;
    const ln = sized ? lnode(vertical ? sw : sh, vertical ? sh : sw) : lnode(0, 0);
    // On the grid a group's ends may use its whole side off the corners, which it grows for.
    const inset = hooks ? M.corner : node.padX;
    ln.span = node.isGroup
      ? Math.min(node.span, (vertical ? node.w : node.h) - 2 * inset)
      : node.span;
    ln.key = c.keyed ? key[item]! : NaN;
    lnodes.push(ln);
  });
  return lnodes;
}

function layerEdges(c: Compound, level: Level, sized: boolean): LEdge[] {
  const { edges, local } = c;
  const vertical = isVertical(level);
  const ledges: LEdge[] = [];
  for (const le of level.edges) {
    const e = edges[le.e]!;
    const edge = ledge(local[le.a]!, local[le.b]!, e.minlen);
    if (sized) {
      edge.labelW = vertical ? e.labelW : e.labelH;
      edge.labelH = vertical ? e.labelH : e.labelW;
      edge.heads = e.heads ?? 1;
      edge.tailDx = endOffset(c, level, sized, le.a, le.e, true);
      edge.headDx = endOffset(c, level, sized, le.b, le.e, false);
      edge.tailFixed = heldEnd(c, le.a, le.e, true);
      edge.headFixed = heldEnd(c, le.b, le.e, false);
      if (le.a === e.src) edge.tailEnd = endRoom(e.start, vertical);
      if (le.b === e.dst) edge.headEnd = endRoom(e.end, vertical);
    }
    ledges.push(edge);
  }
  return ledges;
}

// The edge from a port's dummy node `d` (on a side the level's flow runs through) to the item the
// port is on.
function portEdge(c: Compound, level: Level, sized: boolean, port: PortEdge, d: number): LEdge {
  const { edges, local } = c;
  const vertical = isVertical(level);
  const edge = port.out ? ledge(local[port.inner]!, d) : ledge(d, local[port.inner]!);
  const e = edges[port.e]!;
  if (port.out) {
    edge.tailDx = endOffset(c, level, sized, port.inner, port.e, true);
    edge.tailFixed = heldEnd(c, port.inner, port.e, true);
    if (sized && port.inner === e.src) edge.tailEnd = endRoom(e.start, vertical);
  } else {
    edge.headDx = endOffset(c, level, sized, port.inner, port.e, false);
    edge.headFixed = heldEnd(c, port.inner, port.e, false);
    if (sized && port.inner === e.dst) edge.headEnd = endRoom(e.end, vertical);
  }
  return edge;
}

// Adds a dummy node and edge for each port on a side the level's flow runs through, and pins the
// item of any other.
function layerPorts(
  c: Compound,
  level: Level,
  sized: boolean,
  lnodes: LNode[],
  ledges: LEdge[]
): Int32Array {
  const { edges, local, key, farHint } = c;
  const start = startSide(level.dir);
  const dummies = new Int32Array(level.ports.length).fill(-1);
  level.ports.forEach((port, i) => {
    if (port.side === start || port.side === opposite(start)) {
      const d = lnodes.length;
      const ln = lnode(0, 0, port.side === start ? Kind.StartPort : Kind.EndPort);
      ln.key = c.keyed ? key[port.out ? edges[port.e]!.dst : edges[port.e]!.src]! : NaN;
      ln.hint = Number.isNaN(port.hint) && c.keyed && farHint ? farHint(level, port) : port.hint;
      lnodes.push(ln);
      dummies[i] = d;
      ledges.push(portEdge(c, level, sized, port, d));
    } else {
      lnodes[local[port.inner]!]!.pin = port.side === Side.Top || port.side === Side.Left ? -1 : 1;
    }
  });
  return dummies;
}

// The graph of `level` for `layered`; `sized` gives the items their boxes and the edges their
// labels, as against only the ranks.
export function buildLayer(c: Compound, level: Level, sized: boolean): Layer {
  const lnodes = layerNodes(c, level, sized);
  const ledges = layerEdges(c, level, sized);
  const dummies = layerPorts(c, level, sized, lnodes, ledges);
  return { lnodes, ledges, dummies };
}

// The leaves and groups of the nodes as a flat graph, with the edges between leaves, laid out
// ordering only. Nodes then take their mean x as `c.key`, and a group's far ports a `farHint`.
function flatLayout(c: Compound): void {
  const { nodes, edges, rootDir, key } = c;
  const n = nodes.length;
  const vertical = rootDir === 'TB' || rootDir === 'BT';
  const leaf = new Int32Array(n).fill(-1);
  const group = new Int32Array(n).fill(-1);
  const lnodes: LNode[] = [];
  const of: number[] = [];
  const parent: number[] = [];
  for (let i = 0; i < n; i++) {
    if (!nodes[i]!.isGroup) continue;
    group[i] = parent.length;
    parent.push(-1);
  }
  for (let i = 0; i < n; i++) {
    const p = nodes[i]!.parent;
    if (nodes[i]!.isGroup) parent[group[i]!] = p >= 0 ? group[p]! : -1;
    else {
      leaf[i] = lnodes.length;
      lnodes.push(
        lnode(vertical ? nodes[i]!.w : nodes[i]!.h, vertical ? nodes[i]!.h : nodes[i]!.w)
      );
      of.push(p >= 0 ? group[p]! : -1);
    }
  }
  const ledges: LEdge[] = [];
  const ledgeOf = new Int32Array(edges.length).fill(-1);
  edges.forEach((e, ei) => {
    if (e.src === e.dst || leaf[e.src]! < 0 || leaf[e.dst]! < 0) return;
    ledgeOf[ei] = ledges.length;
    ledges.push(
      ledge(
        leaf[e.src]!,
        leaf[e.dst]!,
        e.minlen,
        vertical ? e.labelW : e.labelH,
        vertical ? e.labelH : e.labelW
      )
    );
  });
  const flat = layered(lnodes, ledges, {
    ...c.opt,
    groups: { of: Int32Array.from(of), parent: Int32Array.from(parent) },
    orderOnly: true,
  });
  c.flatCrossings = Math.min(flat.crossings ?? 0, flat.declared ?? 0);
  const sum = new Float64Array(n);
  const count = new Int32Array(n);
  // Last rank occupied by each group.
  const last = new Int32Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    if (leaf[i]! < 0) continue;
    key[i] = lnodes[leaf[i]!]!.x;
    for (let p = nodes[i]!.parent; p >= 0; p = nodes[p]!.parent) {
      sum[p]! += key[i]!;
      count[p]!++;
      last[p] = Math.max(last[p]!, lnodes[leaf[i]!]!.rank);
    }
  }
  for (let i = 0; i < n; i++) if (count[i]! > 0) key[i] = sum[i]! / count[i]!;
  // Made by a factory, not written inline: V8 allocates a function literal assigned straight to a
  // property in old space, where it keeps this call's arrays alive through every scavenge until
  // the next full GC. A local (`const f = …; c.farHint = f`) works too, but terser and oxc fold it back.
  c.farHint = farHintOf(ledgeOf, ledges, key, edges, last);
}

// Order outgoing ports at the group's last rank; break ties using the next rank.
function farHintOf(
  ledgeOf: Int32Array,
  ledges: LEdge[],
  key: Float64Array,
  edges: readonly CEdge[],
  last: Int32Array
): (level: Level, port: PortEdge) => number {
  return (level: Level, port: PortEdge): number => {
    const le = ledgeOf[port.e]!;
    if (le < 0 || level.id < 0 || !port.out || port.side !== opposite(startSide(level.dir)))
      return NaN;
    const points = ledges[le]!.points;
    let inside = key[edges[port.e]!.src]!;
    let outside = 0;
    for (let k = 0; k < points.length; k += 2) {
      if (points[k]! === last[level.id]!) inside = points[k + 1]!;
      if (points[k]! === last[level.id]! + 1) outside = points[k + 1]!;
    }
    return inside + outside * 1e-6;
  };
}

// Use a flat layout to coordinate node and port order across groups, when `c.flat`.
export function orderByFlatLayout(c: Compound): void {
  if (c.flat) flatLayout(c);
}

// Lays out a level, reusing an earlier layout of the same inputs when the levels are laid out
// more than once.
export function layOutLevel(
  c: Compound,
  level: Level,
  lnodes: LNode[],
  ledges: LEdge[]
): { lnodes: LNode[]; ledges: LEdge[]; size: LayeredResult } {
  const { opt, laid } = c;
  if (!c.ordered) return { lnodes, ledges, size: layered(lnodes, ledges, opt) };
  const given = layoutInputs(lnodes, ledges);
  let past = laid.get(level.id);
  if (!past) laid.set(level.id, (past = []));
  for (const p of past) {
    let same = p.given.length === given.length;
    for (let i = 0; same && i < given.length; i++) same = Object.is(p.given[i]!, given[i]!);
    if (same) return p;
  }
  const done = { given, lnodes, ledges, size: layered(lnodes, ledges, opt) };
  past.push(done);
  return done;
}
