// Ported from Pele (https://github.com/obsidianmd/pele), src/layout/compound.ts at 3a2f075.
// Copyright (c) 2026 kepano. MIT License: see THIRD_PARTY_NOTICES in @mermaid-js/core.
// Changes from Pele: `const enum`s are `as const` objects, and index reads carry `!` for
// noUncheckedIndexedAccess. `snapshot`/`restore` copy objects instead of packed arrays, and the
// layout cache keys on `layoutInputs`. Length constants come from `opt.metrics` (D77). The
// algorithm is otherwise unchanged.
// cspell:ignore kepano lnode lnodes cnode
//
import { assignEdges, budgetPorts, levelsOf } from './compound-levels.ts';
import { orderByFlatLayout } from './compound-layer.ts';
import { placeOwnEdges, placeOwnLabels, setUpOwnEdges } from './compound-own.ts';
import { hintPorts, place } from './compound-place.ts';
import { restore, snapshot, type Compound } from './compound-state.ts';
import { routeCrossings, styleOf, type Style } from './crossings.ts';
import type { LayeredOptions } from './layered.ts';
import { pxProfile } from '../units.ts';

export type Dir = 'TB' | 'BT' | 'LR' | 'RL';

// The direction a diagram names, or top to bottom for anything else.
export function direction(dir: string | undefined): Dir {
  return dir === 'BT' || dir === 'LR' || dir === 'RL' ? dir : 'TB';
}

export interface CNode {
  w: number;
  h: number;
  parent: number;
  isGroup: boolean;
  dir: Dir | undefined;
  padX: number;
  padTop: number;
  padBottom: number;
  minW: number;
  // Declaration order; a group takes the smallest value among its members.
  seq: number;
  // How much of a side its edges may spread along, measured across the flow; 0 keeps them at its middle.
  span: number;
  // Room kept clear around a group's box in its parent, each way (a self-loop's, on the grid).
  loopW: number;
  loopH: number;
  x: number;
  y: number;
}

export interface CEdge {
  src: number;
  dst: number;
  minlen: number;
  labelW: number;
  labelH: number;
  // Sizes of the edge-end labels (D102), when the edge has them, and the room before each along
  // the edge (`endLabelAlong`, its marker or the head room, a gap to the middle label: D607).
  start?: { width: number; height: number; along: number };
  end?: { width: number; height: number; along: number };
  // x, y, axis triples; axis is 0 where the edge runs vertically into the point, 1 horizontally.
  route: number[];
  labelX: number;
  labelY: number;
}

export interface CompoundResult {
  width: number;
  height: number;
}

// Limit repeated layouts to small graphs.
const MAX_ORDERED_PORTS = 400;
const MAX_ORDERED_EDGES = 500;
// Crossing tolerance before trying independent group ordering.
const FLAT_SLACK = 1.5;
const FLAT_SPARE = 4;

// Match Mermaid: groups crossed by edges inherit their parent's direction.
export function inheritCrossedDirections(
  nodes: CNode[],
  ends: Iterable<readonly [number, number]>
): void {
  const ancestors = (i: number): Set<number> => {
    const set = new Set<number>();
    for (let p = nodes[i]!.parent; p >= 0 && !set.has(p); p = nodes[p]!.parent) set.add(p);
    return set;
  };
  for (const [src, dst] of ends) {
    if (src < 0 || dst < 0 || src === dst) continue;
    const a = ancestors(src);
    const b = ancestors(dst);
    for (const g of a) if (!b.has(g)) nodes[g]!.dir = undefined;
    for (const g of b) if (!a.has(g)) nodes[g]!.dir = undefined;
  }
}

export function shiftLayout(nodes: CNode[], edges: CEdge[], ox: number, oy: number): void {
  for (const c of nodes) {
    c.x += ox;
    c.y += oy;
  }
  for (const e of edges) {
    for (let k = 0; k < e.route.length; k += 3) {
      e.route[k]! += ox;
      e.route[k + 1]! += oy;
    }
    e.labelX += ox;
    e.labelY += oy;
  }
}

export function cnode(w: number, h: number, parent = -1): CNode {
  return {
    w,
    h,
    parent,
    isGroup: false,
    dir: undefined,
    padX: 0,
    padTop: 0,
    padBottom: 0,
    minW: 0,
    seq: 0,
    span: 0,
    loopW: 0,
    loopH: 0,
    x: 0,
    y: 0,
  };
}

// Whether a level is laid out once, or more than once to settle the order across groups.
function isOrdered(c: Compound): boolean {
  return c.ports > 1 && c.ports <= MAX_ORDERED_PORTS && c.edges.length <= MAX_ORDERED_EDGES;
}

// Places the levels with the order a flat layout gives, and again with their own when that has
// fewer crossings (the flat layout ignores group boxes). Returns the crossings of what is kept,
// or -1 where none were counted.
function chooseOrder(c: Compound, style: Style): number {
  const { nodes, edges, M } = c;
  c.keyed = c.flat;
  place(c);
  if (!c.flat) return -1;
  let crossings = routeCrossings(nodes, edges, style, M.fan);
  if (crossings > c.flatCrossings * FLAT_SLACK + FLAT_SPARE) {
    const first = snapshot(nodes, edges, c.order, c.total);
    c.keyed = false;
    place(c);
    const own = routeCrossings(nodes, edges, style, M.fan);
    if (own >= crossings) {
      c.keyed = true;
      c.total = restore(first, nodes, edges, c.order);
    } else crossings = own;
  }
  return crossings;
}

// Refines port order using routes outside each group, and lays out again if that is better. Skip
// this if independent ordering won; it rarely helps enough to justify another layout.
function refinePortOrder(c: Compound, style: Style, crossings: number): void {
  const { nodes, edges, M } = c;
  if (!hintPorts(c)) return;
  const before = crossings >= 0 ? crossings : routeCrossings(nodes, edges, style, M.fan);
  const first = before > 0 ? snapshot(nodes, edges, c.order, c.total) : undefined;
  if (!first) return;
  place(c);
  if (routeCrossings(nodes, edges, style, M.fan) >= before)
    c.total = restore(first, nodes, edges, c.order);
}

// A self-loop's label sits right of its node.
function placeLoopLabels(c: Compound): void {
  for (const ei of c.loops) {
    const e = c.edges[ei]!;
    const node = c.nodes[e.src]!;
    e.labelX = node.x + node.w / 2 + c.M.loopLabel + e.labelW / 2;
    e.labelY = node.y;
  }
}

// Lays out a graph whose nodes may be nested in groups. Each group is laid out on its own,
// in its own direction, and then placed in its parent as a single box. An edge that crosses
// a group's border passes through a port on the side facing its other end.
export function compoundLayout(
  nodes: CNode[],
  edges: CEdge[],
  rootDir: Dir,
  opt: LayeredOptions
): CompoundResult {
  const { levelOf, order, depth } = levelsOf(nodes, rootDir);
  const c: Compound = {
    nodes,
    edges,
    rootDir,
    opt,
    M: opt.metrics ?? pxProfile.engine,
    hooks: opt.grid,
    levelOf,
    order,
    depth,
    ports: 0,
    loops: [],
    stray: [],
    ownEdges: [],
    ownByGroup: new Map(),
    ownGapX: 0,
    ownGapY: 0,
    local: new Int32Array(nodes.length),
    ordered: false,
    key: new Float64Array(nodes.length).fill(NaN),
    keyed: false,
    flat: false,
    flatCrossings: 0,
    farHint: undefined,
    laid: new Map(),
    total: { width: 0, height: 0 },
  };
  c.ports = budgetPorts(c);
  assignEdges(c);
  setUpOwnEdges(c);
  c.ordered = isOrdered(c);
  c.flat = order.length > 1 && c.ordered && order.every((level) => level.dir === rootDir);
  orderByFlatLayout(c);
  const style = styleOf(opt);
  const crossings = chooseOrder(c, style);
  if (c.keyed === c.flat && c.ordered) refinePortOrder(c, style, crossings);
  placeOwnEdges(c);
  placeOwnLabels(c);
  placeLoopLabels(c);
  return c.total;
}
