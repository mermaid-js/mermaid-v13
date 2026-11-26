/**
 * `straightenEdges` (D174): v12 develop's post-pass that drops the small port-to-channel step at
 * an edge's ends (`render.ts` `straightenTerminalJogs`, `straightenEdgeTerminals`,
 * `projectLabelOntoStraightenedRun`). Pure point maths over the routes ELK gave back.
 */
import type { Point as P } from '@mermaid-js/core/layout';
import type { ElkNode } from 'elkjs/lib/elk-api.js';
import { sideOf, type Rect } from './geometry.ts';

/**
 * Largest port-to-channel step worth collapsing. ELK layered spreads ports evenly along a side,
 * then routes the edge down a channel whose row rarely lines up with the port: a staircase of a
 * few pixels at the border, whose two micro-bends read as a glitch once corners are rounded.
 */
const TERMINAL_JOG_MAX = 16;

/**
 * How far from the node the step may sit and still be the connector. On v12's corpus every
 * genuine connector turns 20–25 from the border; the ones to leave alone at 48, 112 and 173.
 */
const TERMINAL_RUN_MAX = 30;

/** Tolerance for "axis-aligned" and for "is a step": ELK leaves sub-pixel steps too. */
const JOG_EPS = 0.01;

/** Axis of an axis-aligned segment: `h`, `v`, or undefined when diagonal. */
export function axisOf(a: P, b: P): 'h' | 'v' | undefined {
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  if (dx > JOG_EPS && dy <= JOG_EPS) return 'h';
  if (dy > JOG_EPS && dx <= JOG_EPS) return 'v';
  return undefined;
}

/** A run the pass moved, before and after, so a label riding on it can follow. */
export interface StraightenedRun {
  old: { a: P; b: P };
  new: { a: P; b: P };
}

/** What the pass reads and writes on an edge: its route and its main label's centre and size. */
export interface StraightenEdge {
  points: P[];
  x?: number;
  y?: number;
  label?: unknown;
  width?: number;
  height?: number;
}

/**
 * Straightens the step at the front of `pts`, or returns null when it does not apply. The step
 * goes by pulling the channel onto the port's row, never the port onto the channel's: every
 * port stays where ELK put it. The run is only moved when its far end is not the other port.
 */
function straightenFront(pts: P[]): { points: P[]; run: StraightenedRun } | null {
  if (pts.length < 5) return null;
  const [p0, p1, p2, p3] = pts as [P, P, P, P];
  const axis = axisOf(p0, p1);
  if (!axis || axisOf(p2, p3) !== axis || axisOf(p1, p2) !== (axis === 'h' ? 'v' : 'h'))
    return null;
  // The step has to be next to the node to be the port-to-channel connector.
  if (Math.hypot(p1.x - p0.x, p1.y - p0.y) > TERMINAL_RUN_MAX) return null;
  const jog = axis === 'h' ? Math.abs(p2.y - p1.y) : Math.abs(p2.x - p1.x);
  if (jog < JOG_EPS || jog > TERMINAL_JOG_MAX) return null;
  // The route keeps going the same way after the step; otherwise it is a real turn.
  const forward =
    axis === 'h'
      ? Math.sign(p1.x - p0.x) === Math.sign(p3.x - p2.x)
      : Math.sign(p1.y - p0.y) === Math.sign(p3.y - p2.y);
  if (!forward) return null;
  // The whole run moves, not just its first segment, or a diagonal is left where they meet.
  let last = 3;
  while (last + 1 < pts.length && axisOf(pts[last]!, pts[last + 1]!) === axis) last++;
  // The far port must not be in the run: moving it is what this avoids.
  if (last === pts.length - 1) return null;
  const moved = [...pts];
  for (let i = 2; i <= last; i++)
    moved[i] = axis === 'h' ? { x: pts[i]!.x, y: p0.y } : { x: p0.x, y: pts[i]!.y };
  const run: StraightenedRun = {
    old: { a: pts[2]!, b: pts[last]! },
    new: { a: moved[2]!, b: moved[last]! },
  };
  // p1 and p2 are now collinear with p0 and the rest of the run.
  moved.splice(1, 2);
  return { points: moved, run };
}

/** Both ends' steps straightened, with the runs that moved. The same array when nothing does. */
function straightenTerminalJogsWithRuns(points: P[]): { points: P[]; runs: StraightenedRun[] } {
  const runs: StraightenedRun[] = [];
  let pts = points;
  const front = straightenFront(pts);
  if (front) {
    pts = front.points;
    runs.push(front.run);
  }
  const back = straightenFront([...pts].reverse());
  if (back) {
    pts = back.points.reverse();
    runs.push(back.run);
  }
  return { points: pts, runs };
}

/** The route with the step at either end straightened; `points` itself when nothing applies. */
export function straightenTerminalJogs(points: P[]): P[] {
  return straightenTerminalJogsWithRuns(points).points;
}

/** Do two segments cross at a point inside both? */
function segmentsCrossStrict(a1: P, a2: P, b1: P, b2: P): boolean {
  const side = (o: P, p: P, q: P) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  const d1 = side(b1, b2, a1);
  const d2 = side(b1, b2, a2);
  const d3 = side(a1, a2, b1);
  const d4 = side(a1, a2, b2);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

export function crossingCount(a: P[], b: P[]): number {
  let n = 0;
  for (let i = 0; i < a.length - 1; i++)
    for (let j = 0; j < b.length - 1; j++)
      if (segmentsCrossStrict(a[i]!, a[i + 1]!, b[j]!, b[j + 1]!)) n++;
  return n;
}

/** Where `p` projects onto the line through `a`–`b`, clamped to the segment (0 = a, 1 = b). */
function paramOnSegment(p: P, a: P, b: P): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;
  if (lenSq === 0) return 0;
  return Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq));
}

const pointAtParam = (a: P, b: P, t: number): P => ({
  x: a.x + t * (b.x - a.x),
  y: a.y + t * (b.y - a.y),
});

/**
 * A label that sat on one of the moved runs, on that run's new position. Only the moved runs are
 * searched: an unchanged segment elsewhere can sit nearer the label's old spot.
 */
export function projectLabelOntoStraightenedRun(label: P, runs: StraightenedRun[]): P | null {
  let best: { distSq: number; point: P } | null = null;
  for (const run of runs) {
    const t = paramOnSegment(label, run.old.a, run.old.b);
    const at = pointAtParam(run.old.a, run.old.b, t);
    const distSq = (at.x - label.x) ** 2 + (at.y - label.y) ** 2;
    if (!best || distSq < best.distSq)
      best = { distSq, point: pointAtParam(run.new.a, run.new.b, t) };
  }
  return best?.point ?? null;
}

export interface Box {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Whether segment a–b passes through the box (Liang-Barsky). */
export function segmentHitsBox(a: P, b: P, box: Box): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  for (const [p, q] of [
    [-dx, a.x - box.x1],
    [dx, box.x2 - a.x],
    [-dy, a.y - box.y1],
    [dy, box.y2 - a.y],
  ] as const) {
    if (p === 0) {
      if (q < 0) return false;
    } else if (p < 0) t0 = Math.max(t0, q / p);
    else t1 = Math.min(t1, q / p);
  }
  return t0 < t1;
}

export const labelBox = (c: P, size: { width: number; height: number }): Box => ({
  x1: c.x - size.width / 2,
  y1: c.y - size.height / 2,
  x2: c.x + size.width / 2,
  y2: c.y + size.height / 2,
});

/** Whether two boxes are closer than `gap` on both axes (with no gap: whether they overlap). */
const tooClose = (a: Box, b: Box, gap: number): boolean =>
  a.x1 < b.x2 + gap && b.x1 < a.x2 + gap && a.y1 < b.y2 + gap && b.y1 < a.y2 + gap;

/**
 * Straightens the step on every edge that has one, unless that adds a crossing with another
 * edge, puts a label over an edge, or brings two labels closer than `labelGap` (net counts, both
 * directions). The last is v12's label-against-label term (mermaid-js/mermaid#8580), with the gap
 * the built-in engine keeps between labels (`spacing.edge`, #1162): of a bidirectional labelled
 * pair whose runs both close in on their port rows, the second keeps its step. Runs over the
 * finished layout because the decision needs the other edges. Writes each changed edge's
 * `points` and returns, per changed edge, the runs that moved; the caller carries its label
 * along.
 */
export function straightenEdgeTerminals<E extends StraightenEdge>(
  edges: E[],
  labelGap = 0
): { edge: E; runs: StraightenedRun[] }[] {
  const routes = edges.map((edge) => edge.points);
  const labels = edges.map((edge) =>
    edge.x === undefined || edge.y === undefined || !edge.label || !edge.width || !edge.height
      ? undefined
      : { centre: { x: edge.x, y: edge.y }, size: { width: edge.width, height: edge.height } }
  );
  const covers = (route: P[], label: (typeof labels)[number]) => {
    const box = label && labelBox(label.centre, label.size);
    return (
      !!box && route.some((p, i) => i < route.length - 1 && segmentHitsBox(p, route[i + 1]!, box))
    );
  };
  const crowds = (a: (typeof labels)[number], b: (typeof labels)[number]) =>
    !!a && !!b && tooClose(labelBox(a.centre, a.size), labelBox(b.centre, b.size), labelGap);
  const changed: { edge: E; runs: StraightenedRun[] }[] = [];
  for (const [index, edge] of edges.entries()) {
    const original = routes[index]!;
    if (original.length < 5) continue;
    const { points: candidate, runs } = straightenTerminalJogsWithRuns(original);
    if (candidate === original) continue;
    // Where the label lands if this goes ahead: the caller carries it along.
    const label = labels[index];
    const moved = label && projectLabelOntoStraightenedRun(label.centre, runs);
    const candidateLabel = label && moved ? { centre: moved, size: label.size } : label;
    let before = 0;
    let after = 0;
    let coveredBefore = 0;
    let coveredAfter = 0;
    for (const [other, route] of routes.entries()) {
      if (other === index || route.length < 2) continue;
      before += crossingCount(original, route);
      after += crossingCount(candidate, route);
      coveredBefore +=
        Number(covers(route, label)) +
        Number(covers(original, labels[other])) +
        Number(crowds(label, labels[other]));
      coveredAfter +=
        Number(covers(route, candidateLabel)) +
        Number(covers(candidate, labels[other])) +
        Number(crowds(candidateLabel, labels[other]));
    }
    if (after > before || coveredAfter > coveredBefore) continue;
    edge.points = candidate;
    routes[index] = candidate;
    labels[index] = candidateLabel;
    changed.push({ edge, runs });
  }
  return changed;
}

/** An edge for `straightenRoutes`: its route and label, and its ends. */
export interface RouteEdge extends StraightenEdge {
  id: string;
  source: string;
  target: string;
  /** The boxes at its ends stay where they are: a self-loop (D719), or a route ELK did not place. */
  fixed: boolean;
  /** An end label, which ELK placed beside that end's box: the box stays where it is. */
  startLabel?: object;
  endLabel?: object;
}

/** What `straightenRoutes` reads besides the edges. */
export interface RouteOptions {
  /** Whether the step at an edge's ends goes (`straightenEdges`). */
  jogs: boolean;
  /** The gap two labels keep (`straightenEdgeTerminals`). */
  labelGap: number;
  /** Every box an edge ends on, by id; a box that moves onto its ends is replaced here. */
  boxes: Map<string, Rect>;
  /** Whether box `id` may move: a node (not a group) none of whose ports is pinned. */
  free: (id: string) => boolean;
  /** The length ELK keeps free at each end of a side (`PORTS_SURROUNDING`). */
  corner: number;
}

/**
 * Whether ELK node `n` may move onto its ends: a node, not a group (whose children and title
 * would stay behind), none of whose ports is pinned (`FIXED_POS`, placed by the adapter).
 */
export function movable(n: ElkNode): boolean {
  return !n.children && n.layoutOptions?.['elk.portConstraints'] !== 'FIXED_POS';
}

/**
 * How far `r` moves to sit centred on its ends `at`, or null when it stays: each end alone on
 * its side, every side shorter than the two corner margins and parallel, all ends the same way
 * off centre.
 */
function onto(r: Rect, at: P[], corner: number): P | null {
  const sides = at.map((p) => sideOf(r, p));
  const across = sides.every((s) => s === 'top' || s === 'bottom');
  if (new Set(sides).size < sides.length) return null;
  if (!across && !sides.every((s) => s === 'left' || s === 'right')) return null;
  if ((across ? r.width : r.height) >= 2 * corner) return null;
  const off = at.map((p) => (across ? p.x - r.x - r.width / 2 : p.y - r.y - r.height / 2));
  const d = off[0]!;
  if (Math.abs(d) < JOG_EPS || off.some((o) => Math.abs(o - d) > JOG_EPS)) return null;
  return across ? { x: d, y: 0 } : { x: 0, y: d };
}

/**
 * A small box moves onto its ends (#1303, D722). On a side shorter than its two corner margins
 * ELK cannot keep both, and puts a lone end `corner - 1` from the side's start whatever the
 * port alignment, then lines that end up with the far one: a 14 px start state sat 4 px beside
 * its edge. Moving the box, not the edge, keeps the edge on the far box's centre too. Two or
 * more ends on a side ELK spreads about the centre, and pinned ports are where the adapter put
 * them, so those boxes stay, as do those with a self-loop or an end ELK did not route. A group
 * stays (its children and title would not move with it), and so does a box with an end label,
 * which ELK placed beside it.
 */
function centreOnLoneEnds(edges: RouteEdge[], o: RouteOptions): void {
  const ends = new Map<string, P[]>();
  const stays = new Set<string>();
  for (const e of edges) {
    for (const [id, p, label] of [
      [e.source, e.points[0]!, e.startLabel],
      [e.target, e.points.at(-1)!, e.endLabel],
    ] as const) {
      ends.set(id, [...(ends.get(id) ?? []), p]);
      if (e.fixed || label) stays.add(id);
    }
  }
  for (const [id, at] of ends) {
    const r = o.boxes.get(id)!;
    const d = !stays.has(id) && o.free(id) ? onto(r, at, o.corner) : null;
    if (d) o.boxes.set(id, { ...r, x: r.x + d.x, y: r.y + d.y });
  }
}

/**
 * ELK's routes made good: the step at each end goes (`jogs`, `straightenEdgeTerminals`), and a
 * small box moves onto its ends (`centreOnLoneEnds`). Rewrites each edge's `points` and
 * `boxes`; returns where each main label on a run that moved went with it.
 */
export function straightenRoutes(edges: RouteEdge[], o: RouteOptions): Map<string, P> {
  const labelMoved = new Map<string, P>();
  if (o.jogs)
    for (const { edge, runs } of straightenEdgeTerminals(edges, o.labelGap)) {
      if (edge.x === undefined || edge.y === undefined) continue;
      const at = projectLabelOntoStraightenedRun({ x: edge.x, y: edge.y }, runs);
      if (at) labelMoved.set(edge.id, at);
    }
  centreOnLoneEnds(edges, o);
  return labelMoved;
}
