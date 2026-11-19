/**
 * Line hops (D537, #78): where two edges cross, the one that gives way draws a small arc (`arc`)
 * or a break (`gap`). Moved from the ELK plugin's hop module (itself v12 develop's
 * `lineJump.ts`): a pure function over the path data of edges drawn in one coordinate frame.
 *
 * Crossings are looked for on straight `L` runs only: a corner (`A`, `Q`) or a curve (`C`) is
 * drawn off its route points, so a crossing found there would be somewhere the stroke is not
 * (v12 skips smoothed curves and rounded corners for the same reason). Unlike v12, the corners
 * of an edge that hops keep their rounding: only the run that carries the hop is split. Also
 * unlike v12, crossings too close for a hop each share one merged hop instead of drawing none
 * (D656, #793).
 */
import { pathBuilder } from '../../svg/path.ts';
import type { PathData } from '../../svg/types.ts';
import type { Point } from '../types.ts';

/** `arc` draws a half circle over the crossing; `gap` breaks the line there. */
export type HopStyle = 'arc' | 'gap';

/** The arc's radius. Fixed, as in v12: a hop reads as one because every hop is the same size. */
const JUMP_RADIUS = 6;
/** Straight run kept between a hop and the end of its run, so it never touches a corner. */
const CORNER_JUMP_CLEARANCE = 2;
/** A hop squeezed below this share of the radius is not drawn: it would not clear the stroke. */
const MIN_USEFUL_RADIUS_RATIO = 0.6;
/** Crossings at a segment's very end are joins, not crossings. */
const ENDPOINT_EPSILON = 1e-6;

/** One command of a path, absolute. */
export interface PathCommand {
  op: 'M' | 'L' | 'C' | 'Q' | 'A' | 'Z';
  args: number[];
}

const ARITY = { M: 2, L: 2, C: 6, Q: 4, A: 7, Z: 0 } as const;

/** The commands of `d`, or undefined for anything but absolute M, L, C, Q, A and Z. */
export function parsePath(d: string): PathCommand[] | undefined {
  const tokens = d.match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? [];
  const out: PathCommand[] = [];
  let i = 0;
  while (i < tokens.length) {
    const op = tokens[i++]!;
    if (!(op in ARITY)) return undefined;
    const n = ARITY[op as keyof typeof ARITY];
    const args = tokens.slice(i, i + n).map(Number);
    if (args.length !== n || args.some((a) => !Number.isFinite(a))) return undefined;
    i += n;
    out.push({ op: op as PathCommand['op'], args });
  }
  return out.length > 0 && out[0]!.op === 'M' ? out : undefined;
}

/** A straight run of one edge: command `index` (an `L`) from `a` to `b`. */
interface Run {
  edge: number;
  index: number;
  a: Point;
  b: Point;
}

function runsOf(edge: number, commands: PathCommand[]): Run[] {
  const runs: Run[] = [];
  let at: Point = { x: 0, y: 0 };
  let start = at;
  commands.forEach((c, index) => {
    if (c.op === 'Z') {
      at = start;
      return;
    }
    const end = { x: c.args[c.args.length - 2]!, y: c.args[c.args.length - 1]! };
    if (c.op === 'L') runs.push({ edge, index, a: at, b: end });
    if (c.op === 'M') start = end;
    at = end;
  });
  return runs;
}

/** Where two runs cross inside both, with each one's parameter; null for joins and parallels. */
function crossing(a: Run, b: Run): { point: Point; tA: number; tB: number } | null {
  const dxA = a.b.x - a.a.x;
  const dyA = a.b.y - a.a.y;
  const dxB = b.b.x - b.a.x;
  const dyB = b.b.y - b.a.y;
  const denom = dxA * dyB - dyA * dxB;
  if (denom === 0) return null;
  const dx = b.a.x - a.a.x;
  const dy = b.a.y - a.a.y;
  const tA = (dx * dyB - dy * dxB) / denom;
  const tB = (dx * dyA - dy * dxA) / denom;
  if (
    tA <= ENDPOINT_EPSILON ||
    tA >= 1 - ENDPOINT_EPSILON ||
    tB <= ENDPOINT_EPSILON ||
    tB >= 1 - ENDPOINT_EPSILON
  )
    return null;
  return { point: { x: a.a.x + tA * dxA, y: a.a.y + tA * dyA }, tA, tB };
}

const horizontal = (r: Run): boolean => Math.abs(r.b.x - r.a.x) >= Math.abs(r.b.y - r.a.y);

interface Hop {
  /** Distance from the run's start. */
  d: number;
  point: Point;
  r: number;
  /** Half its length along the run: `r`, or more for a hop merged over close crossings. */
  w?: number;
}

/**
 * Which edge gives way at each crossing, per edge and command (v12 `findEdgeIntersections`):
 * of a horizontal and a vertical run, the horizontal one hops; otherwise the later edge does.
 */
function hopsOf(lines: (PathCommand[] | undefined)[]): Map<number, Map<number, Hop[]>> {
  const runs = lines.map((commands, edge) => (commands ? runsOf(edge, commands) : []));
  const out = new Map<number, Map<number, Hop[]>>();
  const add = (run: Run, t: number, point: Point): void => {
    const byCommand = out.get(run.edge) ?? new Map<number, Hop[]>();
    out.set(run.edge, byCommand);
    const list = byCommand.get(run.index) ?? [];
    byCommand.set(run.index, list);
    list.push({ d: t * Math.hypot(run.b.x - run.a.x, run.b.y - run.a.y), point, r: JUMP_RADIUS });
  };
  const between = (first: Run[], later: Run[]): void => {
    for (const a of first)
      for (const b of later) {
        const hit = crossing(a, b);
        if (!hit) continue;
        if (horizontal(a) !== horizontal(b) && horizontal(a)) add(a, hit.tA, hit.point);
        else add(b, hit.tB, hit.point);
      }
  };
  for (let i = 0; i < runs.length; i++)
    for (let j = i + 1; j < runs.length; j++) between(runs[i]!, runs[j]!);
  return out;
}

/** The hops of one run that are worth drawing, each with the radius it has room for. */
function fitted(hops: Hop[], length: number): Hop[] {
  const min = JUMP_RADIUS * MIN_USEFUL_RADIUS_RATIO;
  // Dropped before the neighbour pass, so a hop squeezed out by a run's end does not also
  // shrink its neighbours.
  const list = [...hops]
    .sort((a, b) => a.d - b.d)
    .filter((h) => {
      h.r = Math.min(h.r, Math.min(h.d, length - h.d) - CORNER_JUMP_CLEARANCE);
      return h.r >= min;
    });
  // The radius each has room for at the run's ends, before its neighbours squeeze it.
  const room = list.map((h) => h.r);
  for (let k = 0; k < list.length - 1; k++) {
    const gap = list[k + 1]!.d - list[k]!.d;
    if (list[k]!.r + list[k + 1]!.r > gap) {
      list[k]!.r = Math.min(list[k]!.r, gap / 2);
      list[k + 1]!.r = Math.min(list[k + 1]!.r, gap / 2);
    }
  }
  // Neighbours too close to carry a hop each carry one hop over them all (D656, #793; v12 drew
  // none), from the first crossing less a radius to the last plus one. A squeezed hop always
  // has a squeezed neighbour, so such a cluster has two or more crossings, and the hops beside
  // it, which draw as before, bound its radius.
  const out: Hop[] = [];
  for (let k = 0; k < list.length; k++) {
    const first = list[k]!;
    if (first.r >= min) {
      out.push(first);
      continue;
    }
    let j = k;
    while (list[j + 1] && list[j + 1]!.r < min) j++;
    const last = list[j]!;
    const before = list[k - 1];
    const after = list[j + 1];
    const r = Math.min(
      room[k]!,
      room[j]!,
      before ? first.d - before.d - before.r : JUMP_RADIUS,
      after ? after.d - last.d - after.r : JUMP_RADIUS
    );
    if (r >= min)
      out.push({
        d: (first.d + last.d) / 2,
        point: { x: (first.point.x + last.point.x) / 2, y: (first.point.y + last.point.y) / 2 },
        r,
        w: (last.d - first.d) / 2 + r,
      });
    k = j;
  }
  return out;
}

/** `commands` with the hops on their `L` runs, as path data, or undefined when none fits. */
function withHops(
  commands: PathCommand[],
  hops: Map<number, Hop[]>,
  style: HopStyle
): PathData | undefined {
  const b = pathBuilder();
  let drawn = 0;
  let at: Point = { x: 0, y: 0 };
  let start = at;
  commands.forEach((c, index) => {
    const [a0, a1, a2, a3, a4, a5, a6] = c.args;
    const end =
      c.op === 'Z' ? start : { x: c.args[c.args.length - 2]!, y: c.args[c.args.length - 1]! };
    if (c.op === 'L') {
      const length = Math.hypot(end.x - at.x, end.y - at.y);
      const ux = (end.x - at.x) / length;
      const uy = (end.y - at.y) / length;
      // Horizontal runs bump up and vertical runs bump right, whichever way they go (y down).
      const sweep = Math.abs(ux) >= Math.abs(uy) ? ux >= 0 : uy >= 0;
      for (const h of fitted(hops.get(index) ?? [], length)) {
        drawn++;
        const w = h.w ?? h.r;
        b.lineTo(h.point.x - ux * w, h.point.y - uy * w);
        const x = h.point.x + ux * w;
        const y = h.point.y + uy * w;
        // A merged hop is half an ellipse along the run, as tall as any other hop; one over
        // crossings at the same point is a plain hop.
        const turn = w - h.r > ENDPOINT_EPSILON ? (Math.atan(uy / ux) * 180) / Math.PI : 0;
        if (style === 'arc') b.arcTo(w, h.r, turn, false, sweep, x, y);
        else b.moveTo(x, y);
      }
      b.lineTo(end.x, end.y);
    } else if (c.op === 'M') {
      b.moveTo(a0!, a1!);
      start = end;
    } else if (c.op === 'C') b.curveTo(a0!, a1!, a2!, a3!, a4!, a5!);
    else if (c.op === 'Q') b.quadTo(a0!, a1!, a2!, a3!);
    else if (c.op === 'A') b.arcTo(a0!, a1!, a2!, a3 !== 0, a4 !== 0, a5!, a6!);
    else b.close();
    at = end;
  });
  return drawn > 0 ? b.done() : undefined;
}

/**
 * The edges' lines with their hops: one entry per line of `paths` (the path data of edges drawn
 * in one coordinate frame, in drawing order), the new path data where the line gives way at a
 * crossing, else undefined (also when no crossing on it has room for a hop). A line that is
 * not plain absolute path data neither hops nor is hopped over.
 */
export function hopPaths(paths: readonly string[], style: HopStyle): (PathData | undefined)[] {
  const lines = paths.map(parsePath);
  const out: (PathData | undefined)[] = paths.map(() => undefined);
  for (const [edge, byCommand] of hopsOf(lines))
    out[edge] = withHops(lines[edge]!, byCommand, style);
  return out;
}
