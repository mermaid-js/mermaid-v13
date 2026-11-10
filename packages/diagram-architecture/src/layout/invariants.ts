/**
 * The spec's layout invariants (#525 "T0/T3 invariants") beyond core's `validateLayout` (which
 * checks finite numbers, overlaps, containment, the bounding box and that edges start and end at
 * their boxes): every edge leaves and enters by the sides it names, a facing edge between nodes
 * in line runs straight, and `align` members share their row or column, in order. Shared by the
 * package's specs and the parser-produced corpus spec in conformance
 * (`@mermaid-js/diagram-architecture/testing`).
 */
import type { LayoutGraph, LayoutModel, Point, Side } from '@mermaid-js/core/layout';

// Floating-point noise, not a length (core's `validateLayout` slack).
const SLACK = 0.5;

/** The side that faces each side: an `R`–`L` or `T`–`B` edge is a facing one. */
export const OPPOSITE_SIDE: Readonly<Record<Side, Side>> = {
  left: 'right',
  right: 'left',
  top: 'bottom',
  bottom: 'top',
};

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const rectOf = (b: { x: number; y: number; width: number; height: number }): Rect => ({
  x0: b.x - b.width / 2,
  y0: b.y - b.height / 2,
  x1: b.x + b.width / 2,
  y1: b.y + b.height / 2,
});

/** `p` lies on `side` of `r`. */
function onSide(r: Rect, side: Side, p: Point): boolean {
  const at = (a: number, b: number) => Math.abs(a - b) <= SLACK;
  const within = (v: number, lo: number, hi: number) => v >= lo - SLACK && v <= hi + SLACK;
  switch (side) {
    case 'left':
      return at(p.x, r.x0) && within(p.y, r.y0, r.y1);
    case 'right':
      return at(p.x, r.x1) && within(p.y, r.y0, r.y1);
    case 'top':
      return at(p.y, r.y0) && within(p.x, r.x0, r.x1);
    case 'bottom':
      return at(p.y, r.y1) && within(p.x, r.x0, r.x1);
  }
}

/**
 * Where each node's `left`/`right` ends meet it (its `anchorY` line) and its middle across, by
 * id. Build it once per laid-out graph: it indexes the graph's nodes.
 */
export function portLines(graph: LayoutGraph, model: LayoutModel): (id: string) => Point {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  return (id) => {
    const n = byId.get(id)!;
    const m = model.nodes.get(id)!;
    return { x: m.x, y: m.y - m.height / 2 + (n.anchorY ?? n.height / 2) };
  };
}

/** The edges between nodes in line whose named sides face each other, the target ahead. */
export function facingInLine(graph: LayoutGraph, model: LayoutModel): string[] {
  const portLine = portLines(graph, model);
  const out: string[] = [];
  for (const e of graph.edges) {
    const s = e.sides?.source;
    const t = e.sides?.target;
    if (!s || !t || OPPOSITE_SIDE[s] !== t || e.source === e.target) continue;
    if (!model.nodes.has(e.source) || !model.nodes.has(e.target)) continue;
    const a = portLine(e.source);
    const b = portLine(e.target);
    const across = s === 'left' || s === 'right';
    const dir = s === 'right' || s === 'bottom' ? 1 : -1;
    const ahead = across ? (b.x - a.x) * dir > 0 : (b.y - a.y) * dir > 0;
    const inLine = across ? Math.abs(a.y - b.y) <= SLACK : Math.abs(a.x - b.x) <= SLACK;
    if (ahead && inLine) out.push(e.id);
  }
  return out;
}

/** One message per broken invariant; empty when the layout keeps them all. */
export function architectureLayoutProblems(graph: LayoutGraph, model: LayoutModel): string[] {
  const problems: string[] = [];
  const portLine = portLines(graph, model);
  const parent = new Map<string, string | undefined>(graph.nodes.map((n) => [n.id, n.parent]));
  const boxOf = (id: string, border: boolean | undefined): Rect | undefined => {
    const g = border ? parent.get(id) : undefined;
    const b = g !== undefined ? model.groups.get(g) : (model.nodes.get(id) ?? model.groups.get(id));
    return b && rectOf(b);
  };

  // Sides as written.
  for (const e of graph.edges) {
    const placed = model.edges.get(e.id);
    if (!placed) continue; // validateLayout reports it
    const pts = placed.points;
    const ends = [
      ['source', e.source, e.sides?.source, e.border?.source, pts[0]],
      ['target', e.target, e.sides?.target, e.border?.target, pts[pts.length - 1]],
    ] as const;
    for (const [end, id, side, border, p] of ends) {
      if (!side || !p) continue;
      if (placed.ports[end] !== side)
        problems.push(`edge '${e.id}' ${end} port is ${placed.ports[end]}, not ${side}`);
      const r = boxOf(id, border);
      if (r && !onSide(r, side, p))
        problems.push(`edge '${e.id}' ${end} end is not on the ${side} side of its box`);
    }
  }

  // Facing edges between nodes in line run straight.
  for (const id of facingInLine(graph, model)) {
    const pts = model.edges.get(id)!.points;
    const first = pts[0]!;
    const straight =
      pts.every((p) => Math.abs(p.x - first.x) <= SLACK) ||
      pts.every((p) => Math.abs(p.y - first.y) <= SLACK);
    if (!straight) problems.push(`facing edge '${id}' between nodes in line is not straight`);
  }

  // `align` members share their row (port line) or column, in order.
  for (const hint of graph.align ?? []) {
    for (let i = 1; i < hint.members.length; i++) {
      const [x, y] = [hint.members[i - 1]!, hint.members[i]!];
      if (!model.nodes.has(x) || !model.nodes.has(y)) continue;
      const a = portLine(x);
      const b = portLine(y);
      const ok =
        hint.axis === 'row'
          ? Math.abs(a.y - b.y) <= SLACK && b.x > a.x
          : Math.abs(a.x - b.x) <= SLACK && b.y > a.y;
      if (!ok) problems.push(`align ${hint.axis}: '${x}' and '${y}' do not share it in order`);
    }
  }
  return problems;
}

/** The model as plain JSON, Maps in insertion order: two runs must give the same string. */
export function layoutBytes(model: LayoutModel): string {
  return JSON.stringify({
    ...model,
    nodes: [...model.nodes],
    edges: [...model.edges],
    groups: [...model.groups],
  });
}
