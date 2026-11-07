// DDLT checks for `tree` (R-LAYOUT-8): engine-level invariants on generated trees, as
// `layered.spec.ts` does for `layered`. Mindmap's parser-produced fixtures join in its port.
import { describe, expect, it } from 'vitest';
import type { LayoutGraph, LayoutModel } from '../types.ts';
import { validateLayout } from '../validate.ts';
import { tree } from './index.ts';

/** A small deterministic generator (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Size = (i: number) => [number, number];

/** A tree of `n` nodes where node i's parent is `parentOf(i)`, an earlier node. */
function treeGraph(n: number, parentOf: (i: number) => number, size: Size): LayoutGraph {
  return {
    direction: 'LR',
    nodes: Array.from({ length: n }, (_, i) => {
      const [width, height] = size(i);
      return { id: `n${i}`, width, height };
    }),
    edges: Array.from({ length: n - 1 }, (_, k) => ({
      id: `e${k}`,
      source: `n${parentOf(k + 1)}`,
      target: `n${k + 1}`,
      minLen: 1,
    })),
    groups: [],
    spacing: { node: 10, rank: 40, edge: 10 },
    diagramPadding: 8,
  };
}

function randomTree(n: number, seed: number, outsized = 0): LayoutGraph {
  const r = rng(seed);
  // Parents drawn near the end make deep trees, anywhere make bushy ones.
  const parents = Array.from({ length: n }, (_, i) =>
    i === 0 ? -1 : r() < 0.5 ? Math.floor(r() * i) : Math.max(0, i - 1 - Math.floor(r() * 4))
  );
  const sizes = Array.from({ length: n }, (): [number, number] =>
    r() < outsized ? [400 + r() * 800, 200 + r() * 400] : [20 + r() * 180, 16 + r() * 50]
  );
  return treeGraph(
    n,
    (i) => parents[i]!,
    (i) => sizes[i]!
  );
}

/**
 * A random tree with some zero-size nodes, plus edges that are not tree edges: `n / 4` at random
 * and about half the sibling pairs. Each runs from an earlier node to a later one and comes after
 * every tree edge, so no node's first incoming edge changes.
 */
function randomGraph(n: number, seed: number): LayoutGraph {
  const g = randomTree(n, seed);
  const r = rng(seed + 1000);
  for (const node of g.nodes) {
    if (r() < 0.4) node.width = 0;
    if (r() < 0.2) node.height = 0;
  }
  for (let k = 0; k < n / 4; k++) {
    const a = Math.floor(r() * n);
    const b = Math.floor(r() * n);
    if (a === b) continue;
    const [s, t] = a < b ? [a, b] : [b, a];
    g.edges.push({ id: `x${k}`, source: `n${s}`, target: `n${t}`, minLen: 1 });
  }
  // Edges between siblings too: stacked one above the other, at the same x when equally wide.
  const last = new Map<string, number>();
  g.edges.slice(0, n - 1).forEach((e, k) => {
    const prev = last.get(e.source);
    if (prev !== undefined && r() < 0.5)
      g.edges.push({ id: `s${k}`, source: `n${prev}`, target: e.target, minLen: 1 });
    last.set(e.source, k + 1);
  });
  return g;
}

const unit: Size = () => [60, 24];
const FIXTURES: [string, LayoutGraph][] = [
  ['one node', treeGraph(1, () => 0, unit)],
  ['root and one branch', treeGraph(2, () => 0, unit)],
  ['deep chain', treeGraph(1_000, (i) => i - 1, unit)],
  ['wide fan off the root', treeGraph(400, () => 0, unit)],
  ['wide fan one level down', treeGraph(400, (i) => (i < 3 ? 0 : 1), unit)],
  ['two chains off the root', treeGraph(200, (i) => (i <= 2 ? 0 : i - 2), unit)],
  [
    'outsized root',
    treeGraph(
      20,
      (i) => Math.floor((i - 1) / 3),
      (i) => (i === 0 ? [900, 700] : [40, 20])
    ),
  ],
  [
    'outsized leaves',
    treeGraph(
      30,
      (i) => Math.floor((i - 1) / 4),
      (i) => (i % 5 === 4 ? [500, 400] : [40, 20])
    ),
  ],
  [
    'parent taller than its children',
    treeGraph(
      12,
      (i) => (i < 3 ? 0 : 1),
      (i) => (i === 1 ? [40, 600] : [40, 20])
    ),
  ],
  [
    'zero-size nodes',
    treeGraph(
      30,
      (i) => Math.floor((i - 1) / 2),
      () => [0, 0]
    ),
  ],
  ...[1, 2, 3, 4, 5].map((s): [string, LayoutGraph] => [
    `random 300 (seed ${s})`,
    randomTree(300, s),
  ]),
  ['random 300 with outsized nodes', randomTree(300, 7, 0.1)],
  ['random 10,000', randomTree(10_000, 11)],
  ...[1, 2, 3].map((s): [string, LayoutGraph] => {
    // Labels on a third of the edges, some taller than the nodes they join.
    const g = randomTree(300, 40 + s);
    const r = rng(s);
    for (const e of g.edges)
      if (r() < 0.3) e.label = { width: 10 + r() * 80, height: 10 + r() * 90 };
    return [`random 300 with edge labels (seed ${s})`, g];
  }),
  ...Array.from({ length: 20 }, (_, s): [string, LayoutGraph] => [
    `random 200 with zero-size nodes and extra edges (seed ${s})`,
    randomGraph(200, 100 + s),
  ]),
];

function plain(model: LayoutModel): unknown {
  return { ...model, nodes: [...model.nodes], edges: [...model.edges], groups: [...model.groups] };
}

/** Problems with `tree`'s own promises: root centred, sides kept, parents centred (D281, D283). */
function treeProblems(graph: LayoutGraph, model: LayoutModel): string[] {
  const problems: string[] = [];
  // Tree edges only: each node's first incoming edge (the fixtures make no cycles).
  const kids = new Map<string, string[]>();
  const parented = new Set<string>();
  for (const e of graph.edges) {
    if (e.source === e.target || parented.has(e.target)) continue;
    parented.add(e.target);
    kids.set(e.source, [...(kids.get(e.source) ?? []), e.target]);
  }
  const at = (id: string) => model.nodes.get(id)!;
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
  const root = at(graph.nodes[0]!.id);
  const branches = kids.get(graph.nodes[0]!.id) ?? [];
  const right = branches.filter((b) => at(b).x > root.x);
  const left = branches.filter((b) => at(b).x < root.x);
  if (right.length + left.length !== branches.length)
    problems.push('a branch is level with the root');
  // The first branches go right, the rest left (D283).
  if (branches.slice(0, right.length).some((b) => !right.includes(b)))
    problems.push('the right side is not the first branches');
  for (const sideOf of [right, left]) {
    if (sideOf.length === 0) continue;
    const mid = (at(sideOf[0]!).y + at(sideOf.at(-1)!).y) / 2;
    if (!near(mid, root.y)) problems.push(`root not centred on a side: ${root.y} vs ${mid}`);
  }
  // Every node stays on its branch's side, further out than its parent, and a parent sits halfway
  // between its first and last child.
  const stack = branches.map((b) => [b, at(b).x > root.x ? 1 : -1] as const);
  while (stack.length > 0) {
    const [id, dir] = stack.pop()!;
    const c = kids.get(id) ?? [];
    for (const k of c) {
      if ((at(k).x - at(id).x) * dir <= 0) problems.push(`'${k}' is not further out than '${id}'`);
      stack.push([k, dir]);
    }
    if (c.length > 0 && !near(at(id).y, (at(c[0]!).y + at(c.at(-1)!).y) / 2))
      problems.push(`'${id}' is not centred on its children`);
  }
  return problems;
}

describe('tree: DDLT checks on generated trees', () => {
  it.each(FIXTURES)(
    '%s is a valid layout',
    (_, graph) => {
      const model = tree(graph);
      expect(validateLayout(graph, model)).toEqual([]);
      expect(treeProblems(graph, model)).toEqual([]);
    },
    60_000
  );

  it.each(FIXTURES)('%s lays out the same twice', (_, graph) => {
    const copy = JSON.parse(JSON.stringify(graph)) as LayoutGraph;
    expect(JSON.stringify(plain(tree(graph)))).toBe(JSON.stringify(plain(tree(copy))));
  });
});
