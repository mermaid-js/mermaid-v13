// `LayoutEdge.sides` as hints (D327, D503): once `layered` has placed everything, an edge with an
// end that its named side does not already hold is drawn again from its ends: each on its side
// (the middle, or `anchorY` down a `left`/`right` side; an end layered already put there stays),
// a stub straight out, and right angles from stub to stub through the label. Ranks, order, boxes
// and labels stay; the drawing grows where a stub reaches past it. Limits: #525 GAPS (T0b).
import type { LayoutEdge, LayoutGraph, LayoutModel, RoutePoint, Side } from '../types.ts';
import type { LayoutMetrics } from '../units.ts';

/** The axis a side faces along, and which way is out of the box. */
export const OUTWARD: Readonly<Record<Side, { axis: 'x' | 'y'; sign: 1 | -1 }>> = {
  top: { axis: 'y', sign: -1 },
  bottom: { axis: 'y', sign: 1 },
  left: { axis: 'x', sign: -1 },
  right: { axis: 'x', sign: 1 },
};

// Points and boxes as tuples, so both axes go through one loop: [x, y], and a box's
// [x, y, half width, half height].
type P = [number, number];
type End = [P, Side, number[]];

const axisOf = (side: Side): number => +(OUTWARD[side].axis === 'y');

// `p` with its coordinate on axis `k` set to `v`.
function put(p: readonly number[], k: number, v: number): P {
  const q: P = [p[0]!, p[1]!];
  q[k] = v;
  return q;
}

// How bad a path is: a box it runs through or a leg straight back over the one before costs 9,
// a turn 1.
function cost(path: readonly P[], boxes: readonly number[][]): number {
  let n = 0;
  let d: number[] = [];
  for (let i = 1; i < path.length; i++) {
    const [p, q] = [path[i - 1]!, path[i]!];
    const e = [Math.sign(q[0] - p[0]), Math.sign(q[1] - p[1])];
    if (e[0] || e[1]) {
      if (d.length) n += e[0] === -d[0]! && e[1] === -d[1]! ? 9 : +(e[0] !== d[0] || e[1] !== d[1]);
      d = e;
      for (const b of boxes)
        if (
          [0, 1].every(
            (j) => Math.abs(p[j]! + q[j]! - 2 * b[j]!) < Math.abs(p[j]! - q[j]!) + 2 * b[j + 2]! - 1
          )
        )
          n += 9;
    }
  }
  return n;
}

// The corners from the last point of `seq` to `to` (then on to `after`): two, on a line through
// either point, midway, or `gap` past a box's edge, whichever path `cost`s least.
function link(seq: readonly P[], to: P, after: P[], boxes: readonly number[][], gap: number): P[] {
  const a = seq.at(-1)!;
  let best: P[] = [];
  let low = Infinity;
  for (const k of [0, 1]) {
    const lines = [to[k]!, a[k]!, (a[k]! + to[k]!) / 2];
    for (const b of boxes) lines.push(b[k]! - b[k + 2]! - gap, b[k]! + b[k + 2]! + gap);
    for (const v of lines) {
      const c = [put(a, k, v), put(to, k, v)];
      const n = cost([...seq.slice(-2), ...c, to, ...after], boxes);
      if (n < low) [low, best] = [n, c];
    }
  }
  // A corner on `to` itself would hide the way the route reaches it from the next link.
  return best.filter((c) => c[0] !== to[0] || c[1] !== to[1]);
}

// Where an end of `e` goes, and whether that moves it: onto its named side, at the side's middle
// where layered took another, and at `anchorY` down a named `left`/`right` side.
function place(e: LayoutEdge, which: 'source' | 'target', model: LayoutModel, anchor?: number) {
  const placed = model.edges.get(e.id)!;
  const r = which === 'source' ? placed.points[0]! : placed.points.at(-1)!;
  const named = e.sides?.[which];
  const side = named ?? placed.ports[which];
  const o = (model.nodes.get(e[which]) ?? model.groups.get(e[which]))!;
  const b = [o.x, o.y, o.width / 2, o.height / 2];
  const k = axisOf(side);
  let p: P = [r.x, r.y];
  if (side !== placed.ports[which]) p = put(b, k, b[k]! + OUTWARD[side].sign * b[k + 2]!);
  if (named && !k && anchor !== undefined) p[1] = b[1]! - b[3]! + anchor;
  return [[p, side, b] as End, p[0] !== r.x || p[1] !== r.y] as const;
}

/**
 * Draws the edges of `model` whose named sides (D503) it does not already hold again, in place:
 * a stub out of each side (`corner`, plus the start marker at the source and the arrowhead's room
 * and end marker at the target), then right angles from stub to stub through the label. Grows the
 * drawing where they reach into its margin. `index` maps ids to node indices.
 */
export function honourSides(
  graph: LayoutGraph,
  model: LayoutModel,
  M: LayoutMetrics,
  index: ReadonlyMap<string, number>,
  margin: number
): LayoutModel {
  const drawn: P[] = [];
  for (const e of graph.edges) {
    if (!e.sides) continue;
    const anchor = (id: string) => graph.nodes[index.get(id)!]?.anchorY;
    const [[ps, sSide, sb], sMoved] = place(e, 'source', model, anchor(e.source));
    const [[pt, tSide, tb], tMoved] = place(e, 'target', model, anchor(e.target));
    // A loop with both ends on one side keeps layered's loop.
    if ((!sMoved && !tMoved) || (e.source === e.target && sSide === tSide)) continue;
    const stub = (p: P, side: Side, length: number): P => {
      const k = axisOf(side);
      return put(p, k, p[k]! + OUTWARD[side].sign * (M.corner + length));
    };
    const qs = stub(ps, sSide, e.startMarker?.length ?? 0);
    const qt = stub(pt, tSide, (graph.headRoom ?? 0) + (e.endMarker?.length ?? 0));
    const placed = model.edges.get(e.id)!;
    const seq: P[] = [ps, qs];
    const at = placed.label;
    if (at) seq.push(...link(seq, [at.x, at.y], [], [sb, tb], M.corner), [at.x, at.y]);
    seq.push(...link(seq, qt, [pt], [sb, tb], M.corner), qt, pt);
    const points: RoutePoint[] = [];
    let prev: P | undefined;
    for (const p of seq) {
      if (prev?.[0] === p[0] && prev[1] === p[1]) continue;
      const flat = prev ? prev[1] === p[1] : !axisOf(sSide);
      points.push({ x: p[0], y: p[1], axis: flat ? 'h' : 'v' });
      drawn.push((prev = p));
    }
    model.edges.set(e.id, { ...placed, points, ports: { source: sSide, target: tSide } });
  }
  if (drawn.length === 0) return model;
  // Grow where a redrawn route reaches into the margin, moving everything over.
  const [dx, dy] = [0, 1].map((k) => Math.max(0, margin - Math.min(...drawn.map((p) => p[k]!))));
  model.width = Math.max(model.width, Math.max(...drawn.map((p) => p[0])) + margin) + dx!;
  model.height = Math.max(model.height, Math.max(...drawn.map((p) => p[1])) + margin) + dy!;
  const mv = (p: { x: number; y: number }): void => {
    p.x += dx!;
    p.y += dy!;
  };
  for (const n of model.nodes.values()) mv(n);
  for (const g of model.groups.values()) [g, g.title].forEach(mv);
  for (const p of model.edges.values()) [...p.points, ...(p.label ? [p.label] : [])].forEach(mv);
  return model;
}
