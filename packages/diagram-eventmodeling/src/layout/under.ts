/**
 * Relations drawn under their row (D659, amends D521): a same-lane relation that skips boxes of
 * its lane, and the self loop. Planned before the lanes are stacked, in depths below each lane's
 * top, so the lanes that hold them can grow while every box keeps v12's top.
 *
 * - A relation that skips boxes leaves its source's bottom, drops to a channel `underDrop` below
 *   the lowest box bottom it spans, runs across and rises into its target's bottom.
 * - Relations whose spans overlap take channels `underStep` apart, shorter spans higher; two
 *   that only meet at a box can share one.
 * - The ends on one box spread evenly between the ⅓ and ⅔ anchors of the relations between lanes
 *   (one end sits at ½): those whose other box is to the left first, then those to the right,
 *   each ordered so a deeper channel's legs stay outside a shallower one's run.
 * - A self loop hangs `selfLoopDepth` under its box's bottom right corner; a relation that runs
 *   under the loop takes a channel `underStep` below it.
 */
import { EVENTMODELING_METRICS as M, share, SOURCE_ANCHOR, TARGET_ANCHOR } from './metrics.ts';

/** What the plan reads of a box: its lane and size, and its x (boxes come in x order). */
export interface RowBox {
  readonly lane: number;
  readonly x: number;
  readonly width: number;
  readonly height: number;
}

/** An under route: the leg on the source and the target, and the channel below the lane top. */
export interface UnderRoute {
  readonly from: number;
  readonly to: number;
  readonly depth: number;
}

export interface UnderPlan {
  /** By relation index, each relation that skips a box of its lane. */
  readonly routes: ReadonlyMap<number, UnderRoute>;
  /** By lane, how far below its top the lowest channel or self loop reaches; 0 for none. */
  readonly depth: readonly number[];
}

/** A relation, by its source and target box. */
export interface UnderRelation {
  readonly source: number;
  readonly target: number;
}

interface Arc {
  readonly index: number;
  readonly lane: number;
  /** The places in the lane's row of the left and the right box, `a + 1 < b`. */
  readonly a: number;
  readonly b: number;
  /** The source is the left box. */
  readonly forward: boolean;
  depth: number;
  /** The legs' x on the left and on the right box. */
  left: number;
  right: number;
}

/** A box's bottom below its lane's top: boxes sit `lanePadding` below it (v12). */
const bottomOf = (b: RowBox): number => M.lanePadding + b.height;

export function planUnder(
  relations: readonly UnderRelation[],
  boxes: readonly RowBox[],
  laneCount: number
): UnderPlan {
  const rows: number[][] = Array.from({ length: laneCount }, () => []);
  const place: number[] = [];
  for (const [k, b] of boxes.entries()) {
    const row = rows[b.lane] as number[];
    place.push(row.length);
    row.push(k);
  }
  const depth: number[] = rows.map(() => 0);
  const looped = new Set<number>();
  for (const { source, target } of relations) {
    const b = boxes[source];
    if (source !== target || !b) continue;
    looped.add(source);
    depth[b.lane] = Math.max(depth[b.lane] ?? 0, bottomOf(b) + M.selfLoopDepth);
  }

  const arcs = arcsOf(relations, boxes, place);
  // `taken[lane][p]`: the deepest channel so far over the gap between places `p` and `p + 1`.
  const taken: number[][] = rows.map((row) => row.map(() => 0));
  for (const arc of arcs) {
    const row = rows[arc.lane] as number[];
    arc.depth = channel(arc, row, taken[arc.lane] as number[], boxes, looped);
    depth[arc.lane] = Math.max(depth[arc.lane] ?? 0, arc.depth);
  }
  spreadLegs(arcs, rows, boxes);

  const routes = new Map<number, UnderRoute>();
  for (const arc of arcs)
    routes.set(arc.index, {
      from: arc.forward ? arc.left : arc.right,
      to: arc.forward ? arc.right : arc.left,
      depth: arc.depth,
    });
  return { routes, depth };
}

/** The same-lane relations that skip a box, shorter spans first (they run higher), then left first. */
function arcsOf(
  relations: readonly UnderRelation[],
  boxes: readonly RowBox[],
  place: readonly number[]
): Arc[] {
  const arcs: Arc[] = [];
  for (const [index, { source, target }] of relations.entries()) {
    const s = boxes[source];
    const t = boxes[target];
    if (!s || !t || s.lane !== t.lane) continue;
    const from = place[source] ?? 0;
    const to = place[target] ?? 0;
    const a = Math.min(from, to);
    const b = Math.max(from, to);
    if (b - a > 1)
      arcs.push({ index, lane: s.lane, a, b, forward: from < to, depth: 0, left: 0, right: 0 });
  }
  return arcs.sort((p, q) => p.b - p.a - (q.b - q.a) || p.a - q.a);
}

/**
 * The arc's channel: `underDrop` under the lowest box it spans, `underStep` under a self loop it
 * runs past and under every channel already taken over one of its gaps; then it takes them.
 */
function channel(
  arc: Arc,
  row: readonly number[],
  gaps: number[],
  boxes: readonly RowBox[],
  looped: ReadonlySet<number>
): number {
  let y = 0;
  for (let p = arc.a; p <= arc.b; p++) {
    const k = row[p] as number;
    const box = boxes[k] as RowBox;
    y = Math.max(y, bottomOf(box) + M.underDrop);
    // The loop hangs under the right part of its box, so only a run past it goes lower.
    if (looped.has(k) && p < arc.b) y = Math.max(y, bottomOf(box) + M.selfLoopDepth + M.underStep);
  }
  for (let p = arc.a; p < arc.b; p++) {
    const g = gaps[p] ?? 0;
    if (g > 0) y = Math.max(y, g + M.underStep);
  }
  for (let p = arc.a; p < arc.b; p++) gaps[p] = Math.max(gaps[p] ?? 0, y);
  return y;
}

/**
 * Each box's ends, evenly between its ⅓ and ⅔ anchors: those whose other box is to the left
 * first, shallow to deep, then those to the right, deep to shallow, so no leg crosses the run of
 * a shallower channel.
 */
function spreadLegs(
  arcs: readonly Arc[],
  rows: readonly number[][],
  boxes: readonly RowBox[]
): void {
  const ends = new Map<number, { arc: Arc; right: boolean }[]>();
  const add = (k: number, end: { arc: Arc; right: boolean }): void => {
    const list = ends.get(k);
    if (list) list.push(end);
    else ends.set(k, [end]);
  };
  for (const arc of arcs) {
    const row = rows[arc.lane] as number[];
    add(row[arc.a] as number, { arc, right: true });
    add(row[arc.b] as number, { arc, right: false });
  }
  const rank = (e: { arc: Arc; right: boolean }): number => (e.right ? -e.arc.depth : e.arc.depth);
  for (const [k, list] of ends) {
    const box = boxes[k] as RowBox;
    list.sort((p, q) => Number(p.right) - Number(q.right) || rank(p) - rank(q));
    const lo = share(box.width, TARGET_ANCHOR);
    const room = share(box.width, SOURCE_ANCHOR) - lo;
    for (const [i, { arc, right }] of list.entries()) {
      const x = box.x + lo + (room * (i + 1)) / (list.length + 1);
      if (right) arc.left = x;
      else arc.right = x;
    }
  }
}
