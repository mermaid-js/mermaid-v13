// Ported from Pele (https://github.com/obsidianmd/pele), src/layout/compound.ts at 3a2f075.
// Copyright (c) 2026 kepano. MIT License: see THIRD_PARTY_NOTICES in @mermaid-js/core.
// Changes from Pele: split out of `compound.ts` (D596): the types and the state record the phases of `compoundLayout` share. The algorithm is unchanged.
// cspell:ignore kepano lnode lnodes cnode
//
import type { LayoutMetrics } from '../units.ts';
import type { CEdge, CNode, CompoundResult, Dir } from './compound.ts';
import type { GridHooks } from './grid.ts';
import type { LEdge, LNode, LayeredOptions, LayeredResult } from './layered.ts';
import type { OwnEdge } from './compound-own.ts';

export const Side = { Top: 0, Right: 1, Bottom: 2, Left: 3 } as const;
export type Side = (typeof Side)[keyof typeof Side];

export interface PortEdge {
  e: number;
  inner: number;
  out: boolean;
  side: Side;
  // 1 for the top port of an edge between this level's group and its own member (#415): its end
  // sits below the title, as a labelled one's may (#198), with a band there for its run; else 0.
  below: number;
  // Cross-flow position outside the group from a previous layout; NaN if unknown.
  hint: number;
  px: number;
  py: number;
  route: number[];
}

export interface LevelEdge {
  e: number;
  a: number;
  b: number;
}

export interface Level {
  id: number;
  dir: Dir;
  items: number[];
  edges: LevelEdge[];
  ports: PortEdge[];
  portOf: Map<number, PortEdge>;
  routes: Map<number, number[]>;
  // Edges between the level's group and its own member (#405, #415): laid out only through
  // their ports, the one in this level in place of a route across it.
  own: LevelEdge[];
  x: number;
  y: number;
}

export interface Snapshot {
  nodes: Pick<CNode, 'x' | 'y' | 'w' | 'h'>[];
  edges: Pick<CEdge, 'route' | 'labelX' | 'labelY'>[];
  levels: { x: number; y: number; ports: Pick<PortEdge, 'px' | 'py'>[] }[];
  total: CompoundResult;
}

export function snapshot(
  nodes: CNode[],
  edges: CEdge[],
  levels: Level[],
  total: CompoundResult
): Snapshot {
  return {
    nodes: nodes.map(({ x, y, w, h }) => ({ x, y, w, h })),
    edges: edges.map(({ route, labelX, labelY }) => ({ route, labelX, labelY })),
    levels: levels.map(({ x, y, ports }) => ({
      x,
      y,
      ports: ports.map(({ px, py }) => ({ px, py })),
    })),
    total,
  };
}

export function restore(
  s: Snapshot,
  nodes: CNode[],
  edges: CEdge[],
  levels: Level[]
): CompoundResult {
  nodes.forEach((c, i) => Object.assign(c, s.nodes[i]));
  edges.forEach((e, i) => Object.assign(e, s.edges[i]));
  levels.forEach((level, i) => {
    const saved = s.levels[i]!;
    level.x = saved.x;
    level.y = saved.y;
    level.ports.forEach((port, j) => Object.assign(port, saved.ports[j]));
  });
  return s.total;
}

// Appends `part`, offset by (`ox`, `oy`), to `route`, without repeating the point it ends at.
export function appendRoute(route: number[], part: number[], ox: number, oy: number): void {
  for (let i = 0; i < part.length; i += 3) {
    const x = part[i]! + ox;
    const y = part[i + 1]! + oy;
    const len = route.length;
    if (len >= 3 && Math.abs(route[len - 3]! - x) < 0.01 && Math.abs(route[len - 2]! - y) < 0.01)
      continue;
    route.push(x, y, part[i + 2]!);
  }
}

// A port in `level` where edge `e` crosses the border of `inner`, leaving it (`out`) or entering,
// on its way between `a` and `b`. A crossing edge's side is set once the parents are ranked. An
// edge between a group and its own member (`a` = `b`, the group; #405, #415) has a port in every
// level from the group down to the member, so it is laid out inside the group like an edge that
// crosses it: in through the side the levels start at, or out through the side they end at.
export function addPort(
  level: Level,
  e: number,
  inner: number,
  out: boolean,
  a: number,
  b: number
): void {
  let side: Side = Side.Top;
  if (a === b) side = out ? opposite(startSide(level.dir)) : startSide(level.dir);
  const below = +(a === b && level.id === a && side === Side.Top);
  const port: PortEdge = { e, inner, out, side, below, hint: NaN, px: 0, py: 0, route: [] };
  level.ports.push(port);
  level.portOf.set(e * 2 + (out ? 0 : 1), port);
}

const START_SIDE: Readonly<Record<Dir, Side>> = {
  TB: Side.Top,
  BT: Side.Bottom,
  LR: Side.Left,
  RL: Side.Right,
};

export function startSide(dir: Dir): Side {
  return START_SIDE[dir];
}

export function opposite(side: Side): Side {
  return ((side + 2) & 3) as Side;
}

// A level laid out before, to reuse it when its inputs are the same.
export interface Laid {
  given: number[];
  lnodes: LNode[];
  ledges: LEdge[];
  size: LayeredResult;
}

// What one `compoundLayout` call works on, built up by its phases in order.
export interface Compound {
  nodes: CNode[];
  edges: CEdge[];
  rootDir: Dir;
  opt: LayeredOptions;
  M: LayoutMetrics;
  hooks: GridHooks | undefined;
  levelOf: Map<number, Level>;
  // The root level, then each group's, outermost first.
  order: Level[];
  depth: Int32Array;
  // Port count after the budget; edges between a node and itself; edges between a group and its
  // own member (#405, #415).
  ports: number;
  loops: number[];
  stray: number[];
  ownEdges: OwnEdge[];
  ownByGroup: Map<number, OwnEdge[]>;
  ownGapX: number;
  ownGapY: number;
  // An item's position in its level.
  local: Int32Array;
  // Whether the levels are laid out more than once (small graphs only).
  ordered: boolean;
  // A flat layout's x of each node, to coordinate order across groups.
  key: Float64Array;
  keyed: boolean;
  flat: boolean;
  flatCrossings: number;
  farHint: ((level: Level, port: PortEdge) => number) | undefined;
  laid: Map<number, Laid[]>;
  total: CompoundResult;
}
