// Ported from Pele (https://github.com/obsidianmd/pele), src/layout/compound.ts at 3a2f075.
// Copyright (c) 2026 kepano. MIT License: see THIRD_PARTY_NOTICES in @mermaid-js/core.
// Changes from Pele: split out of `compound.ts` (D596): the levels of the group tree, the port
// budget and the sorting of edges into levels, which `compoundLayout` did inline. The algorithm is
// unchanged.
// cspell:ignore kepano
//
import type { CNode, Dir } from './compound.ts';
import { addPort, type Compound, type Level } from './compound-state.ts';

const MAX_PORTS = 40000;

function makeLevel(levelOf: Map<number, Level>, id: number, dir: Dir): Level {
  const level: Level = {
    id,
    dir,
    items: [],
    edges: [],
    own: [],
    ports: [],
    portOf: new Map(),
    routes: new Map(),
    x: 0,
    y: 0,
  };
  levelOf.set(id, level);
  return level;
}

// The group tree being walked: a level for the root and each group, a level's items in order.
interface Tree {
  nodes: CNode[];
  rootDir: Dir;
  children: number[][];
  placed: Uint8Array;
  depth: Int32Array;
  levelOf: Map<number, Level>;
  order: Level[];
}

// Adds a level for each group below the levels from `from` on, and sets the depth of each item.
function descend(t: Tree, from: number): void {
  const { nodes, children, placed, depth, levelOf, order } = t;
  for (let q = from; q < order.length; q++) {
    const level = order[q]!;
    for (const item of level.items) {
      placed[item] = 1;
      depth[item] = level.id < 0 ? 0 : depth[level.id]! + 1;
      if (nodes[item]!.isGroup) {
        const child = makeLevel(levelOf, item, nodes[item]!.dir ?? level.dir);
        child.items = children[item]!;
        order.push(child);
      }
    }
  }
}

// Groups that contain each other are unreachable from the root; lifts them out.
function liftOut(t: Tree, root: Level): void {
  const { nodes, children, placed, depth, levelOf, order } = t;
  for (let i = 0; i < nodes.length; i++) {
    if (placed[i]!) continue;
    const former = nodes[i]!.parent;
    children[former] = children[former]!.filter((c) => c !== i);
    nodes[i]!.parent = -1;
    root.items.push(i);
    placed[i] = 1;
    depth[i] = 0;
    if (nodes[i]!.isGroup) {
      const from = order.length;
      const child = makeLevel(levelOf, i, nodes[i]!.dir ?? t.rootDir);
      child.items = children[i]!;
      order.push(child);
      descend(t, from);
    }
  }
}

// The levels of the nodes' groups, and each node's depth. A group takes the least `seq` of its
// members, and a level's items are in `seq` order.
export function levelsOf(
  nodes: CNode[],
  rootDir: Dir
): { levelOf: Map<number, Level>; order: Level[]; depth: Int32Array } {
  const n = nodes.length;
  const levelOf = new Map<number, Level>();
  const order: Level[] = [];
  const root = makeLevel(levelOf, -1, rootDir);
  const children: number[][] = [];
  for (let i = 0; i < n; i++) children.push([]);
  const rootItems: number[] = [];
  for (let i = 0; i < n; i++) {
    const p = nodes[i]!.parent;
    if (p >= 0 && p < n && p !== i && nodes[p]!.isGroup) children[p]!.push(i);
    else {
      nodes[i]!.parent = -1;
      rootItems.push(i);
    }
  }
  root.items = rootItems;
  order.push(root);
  const depth = new Int32Array(n);
  const t: Tree = { nodes, rootDir, children, placed: new Uint8Array(n), depth, levelOf, order };
  descend(t, 0);
  liftOut(t, root);

  for (let q = order.length - 1; q > 0; q--) {
    const level = order[q]!;
    let seq = Infinity;
    for (const item of level.items) if (nodes[item]!.seq < seq) seq = nodes[item]!.seq;
    if (seq !== Infinity) nodes[level.id]!.seq = seq;
  }
  for (const level of order) level.items.sort((a, b) => nodes[a]!.seq - nodes[b]!.seq || a - b);
  return { levelOf, order, depth };
}

// Every group border an edge crosses costs a port. Past the budget, an edge is drawn between the
// groups that hold its ends, at the level they share. Returns the ports kept.
export function budgetPorts({ nodes, edges, depth }: Compound): number {
  let ports = 0;
  for (const e of edges) {
    let a = e.src;
    let b = e.dst;
    let crossed = 0;
    for (; depth[a]! > depth[b]!; crossed++) a = nodes[a]!.parent;
    for (; depth[b]! > depth[a]!; crossed++) b = nodes[b]!.parent;
    for (; a !== b && nodes[a]!.parent !== nodes[b]!.parent; crossed += 2) {
      a = nodes[a]!.parent;
      b = nodes[b]!.parent;
    }
    if (a === b) continue;
    if (ports + crossed > MAX_PORTS) {
      e.src = a;
      e.dst = b;
    } else {
      ports += crossed;
    }
  }
  return ports;
}

// Puts edge `ei` in the level it runs in, and a port in each level it crosses a border of.
function assignEdge(c: Compound, ei: number): void {
  const { nodes, edges, depth, levelOf, hooks } = c;
  const e = edges[ei]!;
  e.route = [];
  if (e.src === e.dst) {
    c.loops.push(ei);
    return;
  }
  let a = e.src;
  let b = e.dst;
  const aPath: number[] = [];
  const bPath: number[] = [];
  while (depth[a]! > depth[b]!) {
    aPath.push(a);
    a = nodes[a]!.parent;
  }
  while (depth[b]! > depth[a]!) {
    bPath.push(b);
    b = nodes[b]!.parent;
  }
  if (a === b) {
    // Unlabelled edges between a group and its own member, in px (#405, #415).
    if (hooks || e.labelW > 0) {
      c.stray.push(ei);
      return;
    }
    levelOf.get(a)!.own.push({ e: ei, a, b });
  } else {
    while (nodes[a]!.parent !== nodes[b]!.parent) {
      aPath.push(a);
      bPath.push(b);
      a = nodes[a]!.parent;
      b = nodes[b]!.parent;
    }
    levelOf.get(nodes[a]!.parent)!.edges.push({ e: ei, a, b });
  }
  for (const [path, out] of [
    [aPath, true],
    [bPath, false],
  ] as const) {
    for (const inner of path) addPort(levelOf.get(nodes[inner]!.parent)!, ei, inner, out, a, b);
  }
}

// Sorts every edge into its level, with the ports it needs.
export function assignEdges(c: Compound): void {
  for (let ei = 0; ei < c.edges.length; ei++) assignEdge(c, ei);
}
