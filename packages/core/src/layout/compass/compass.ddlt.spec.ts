// DDLT checks for `compass` (R-LAYOUT-9): engine-level invariants on generated graphs, as
// `tree.ddlt.spec.ts` does for `tree`. The parser-produced fixtures (the architecture corpus
// through a test builder, and flowchart, class, state and ER with `layout: compass`) are in
// `packages/conformance/src/compass/`.
import { describe, expect, it } from 'vitest';
import type { LayoutGraph, LayoutModel, Side } from '../types.ts';
import { validateLayout } from '../validate.ts';
import { compass } from './index.ts';

/** A small deterministic generator (mulberry32), for the fixtures only. */
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

const SIDES: Side[] = ['left', 'right', 'top', 'bottom'];

/**
 * `n` nodes in up to `groups` nested groups, `m` edges with random sides (some without), some
 * border ends, labels and end labels, some edges to groups, and a few `align` hints.
 */
function randomGraph(n: number, m: number, groups: number, seed: number): LayoutGraph {
  const r = rng(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
  const gs = Array.from({ length: groups }, (_, i) => ({
    id: `g${i}`,
    ...(i > 0 && r() < 0.5 ? { parent: `g${Math.floor(r() * i)}` } : {}),
    padding: { top: 10 + r() * 40, right: 10 + r() * 40, bottom: 10 + r() * 40, left: 40 },
    ...(r() < 0.6 ? { title: { width: 20 + r() * 200, height: 10 + r() * 20 } } : {}),
  }));
  // Some groups listed after their children.
  if (r() < 0.5) gs.reverse();
  const nodes = Array.from({ length: n }, (_, i) => {
    const height = r() < 0.1 ? 0 : 20 + r() * 120;
    return {
      id: `n${i}`,
      width: r() < 0.1 ? 0 : 20 + r() * 160,
      height,
      ...(r() < 0.5 ? { anchorY: r() * height } : {}),
      ...(groups > 0 && r() < 0.6 ? { parent: `g${Math.floor(r() * groups)}` } : {}),
    };
  });
  const ends = [...nodes.map((x) => x.id), ...(r() < 0.5 ? gs.map((g) => g.id) : [])];
  const edges = Array.from({ length: m }, (_, k) => {
    const source = pick(ends);
    const target = r() < 0.05 ? source : pick(ends);
    const sides =
      r() < 0.8
        ? { source: pick(SIDES), ...(r() < 0.9 ? { target: pick(SIDES) } : {}) }
        : undefined;
    return {
      id: `e${k}`,
      source,
      target,
      minLen: 1,
      ...(sides ? { sides } : {}),
      ...(r() < 0.1 ? { border: { source: r() < 0.5, target: r() < 0.5 } } : {}),
      ...(r() < 0.3 ? { label: { width: 10 + r() * 80, height: 10 + r() * 30 } } : {}),
      ...(r() < 0.15 ? { startLabel: { width: 8 + r() * 20, height: 14 } } : {}),
      ...(r() < 0.15 ? { endLabel: { width: 8 + r() * 20, height: 14 } } : {}),
    };
  });
  const align = Array.from({ length: Math.floor(r() * 3) }, () => ({
    axis: pick(['row', 'column'] as const),
    members: Array.from({ length: 2 + Math.floor(r() * 3) }, () => pick(nodes).id),
  }));
  return {
    direction: pick(['TB', 'BT', 'LR', 'RL'] as const),
    nodes,
    edges,
    groups: gs,
    spacing: { node: 10, rank: 40, edge: 10 },
    diagramPadding: 8,
    ...(align.length > 0 ? { align } : {}),
  };
}

const FIXTURES: [string, LayoutGraph][] = [
  ...Array.from({ length: 30 }, (_, s): [string, LayoutGraph] => [
    `random 30 nodes, 40 edges, 6 groups (seed ${s})`,
    randomGraph(30, 40, 6, s),
  ]),
  ...Array.from({ length: 10 }, (_, s): [string, LayoutGraph] => [
    `random 120 nodes, 150 edges, 0 groups (seed ${s})`,
    randomGraph(120, 150, 0, 100 + s),
  ]),
  ['random 400 nodes, 500 edges, 30 groups', randomGraph(400, 500, 30, 7)],
  ['random 2,000 nodes, 2,000 edges, no groups', randomGraph(2_000, 2_000, 0, 9)],
];

function plain(model: LayoutModel): string {
  return JSON.stringify({
    ...model,
    nodes: [...model.nodes],
    edges: [...model.edges],
    groups: [...model.groups],
  });
}

describe('compass: DDLT checks on generated graphs', () => {
  it.each(FIXTURES)(
    '%s is a valid layout',
    (_, graph) => {
      expect(validateLayout(graph, compass(graph))).toEqual([]);
    },
    60_000
  );

  it.each(FIXTURES)('%s lays out the same twice', (_, graph) => {
    const copy = JSON.parse(JSON.stringify(graph)) as LayoutGraph;
    expect(plain(compass(copy))).toBe(plain(compass(graph)));
  });
});
