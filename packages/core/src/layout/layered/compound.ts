// Ported from Pele (https://github.com/obsidianmd/pele), src/layout/compound.ts at 3a2f075.
// Copyright (c) 2026 kepano. MIT License: see THIRD_PARTY_NOTICES in @mermaid-js/core.
// Changes from Pele: `const enum`s are `as const` objects, and index reads carry `!` for
// noUncheckedIndexedAccess. `snapshot`/`restore` copy objects instead of packed arrays, and the
// layout cache keys on `layoutInputs`. Length constants come from `opt.metrics` (D77). The
// algorithm is otherwise unchanged.
// cspell:ignore kepano lnode lnodes cnode
//
import {
  Kind,
  floorTo,
  ease,
  edgeOn,
  midCell,
  layered,
  layoutInputs,
  ledge,
  lnode,
  orient,
  rank,
  type LEdge,
  type LNode,
  type LayeredOptions,
  type LayeredResult,
} from './layered.ts';
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
  // Sizes of the edge-end labels (D102), when the edge has them.
  start?: { width: number; height: number };
  end?: { width: number; height: number };
  // x, y, axis triples; axis is 0 where the edge runs vertically into the point, 1 horizontally.
  route: number[];
  labelX: number;
  labelY: number;
}

export interface CompoundResult {
  width: number;
  height: number;
}

const Side = { Top: 0, Right: 1, Bottom: 2, Left: 3 } as const;
type Side = (typeof Side)[keyof typeof Side];

interface PortEdge {
  e: number;
  inner: number;
  out: boolean;
  side: Side;
  // Cross-flow position outside the group from a previous layout; NaN if unknown.
  hint: number;
  px: number;
  py: number;
  route: number[];
}

interface LevelEdge {
  e: number;
  a: number;
  b: number;
}

interface Level {
  id: number;
  dir: Dir;
  items: number[];
  edges: LevelEdge[];
  ports: PortEdge[];
  portOf: Map<number, PortEdge>;
  routes: Map<number, number[]>;
  x: number;
  y: number;
}

const MAX_PORTS = 40000;

// Limit repeated layouts to small graphs.
const MAX_ORDERED_PORTS = 400;
const MAX_ORDERED_EDGES = 500;
// Crossing tolerance before trying independent group ordering.
const FLAT_SLACK = 1.5;
const FLAT_SPARE = 4;

interface Snapshot {
  nodes: Pick<CNode, 'x' | 'y' | 'w' | 'h'>[];
  edges: Pick<CEdge, 'route' | 'labelX' | 'labelY'>[];
  levels: { x: number; y: number; ports: Pick<PortEdge, 'px' | 'py'>[] }[];
  total: CompoundResult;
}

function snapshot(
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

function restore(s: Snapshot, nodes: CNode[], edges: CEdge[], levels: Level[]): CompoundResult {
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

// Tolerance for collinear points.
const IN_LINE = 0.5;
const CURVE_PIECES = 3;
const CORNER_PIECES = 2;
// Allow for a step, an S-curve, or a straight segment plus a rounded corner.
const STEP_PIECES = Math.max(3, CURVE_PIECES, CORNER_PIECES + 1);
// Match the renderer's corner handles.
const HANDLE = 0.62;
const MAX_INSERT = 128;
export const Style = { Curved: 0, Stepped: 1, Linear: 2 } as const;
export type Style = (typeof Style)[keyof typeof Style];
export function styleOf(opt: LayeredOptions): Style {
  if (opt.tracks) return Style.Stepped;
  return opt.straight ? Style.Linear : Style.Curved;
}
export function routeCrossings(
  nodes: CNode[],
  edges: CEdge[],
  style: Style = Style.Curved,
  // Crossings within this distance of a shared node are not counted (`LayoutMetrics.fan`).
  fan = pxProfile.engine.fan
): number {
  let size = 0;
  for (const e of edges)
    if (e.src !== e.dst && e.route.length > 3) size += (e.route.length / 3 - 1) * STEP_PIECES;
  const ax = new Float64Array(size);
  const ay = new Float64Array(size);
  const bx = new Float64Array(size);
  const by = new Float64Array(size);
  const low = new Float64Array(size);
  const high = new Float64Array(size);
  const owner = new Int32Array(size);
  // Endpoint flags: 1 for the first segment, 2 for the last.
  const ends = new Uint8Array(size);
  let count = 0;
  let top = Infinity;
  let bottom = -Infinity;
  let fromX = NaN;
  let fromY = NaN;
  let toX = NaN;
  let toY = NaN;
  const add = (ei: number, part: number, x0: number, y0: number, x1: number, y1: number): void => {
    const p = count - 1;
    const on =
      x0 === toX && y0 === toY && ((y1 === y0 && fromY === y0) || (x1 === x0 && fromX === x0));
    if (
      on &&
      owner[p]! === ei &&
      ends[p]! === part &&
      (x0 - fromX) * (x1 - x0) + (y0 - fromY) * (y1 - y0) > 0
    ) {
      count--;
      x0 = fromX;
      y0 = fromY;
    }
    fromX = x0;
    fromY = y0;
    toX = x1;
    toY = y1;
    ends[count] = part;
    ax[count] = Math.min(x0, x1);
    bx[count] = Math.max(x0, x1);
    ay[count] = x0 <= x1 ? y0 : y1;
    by[count] = x0 <= x1 ? y1 : y0;
    low[count] = Math.min(y0, y1);
    high[count] = Math.max(y0, y1);
    if (low[count]! < top) top = low[count]!;
    if (high[count]! > bottom) bottom = high[count]!;
    owner[count++] = ei;
  };
  for (let ei = 0; ei < edges.length; ei++) {
    const e = edges[ei]!;
    if (e.src === e.dst) continue;
    const r = e.route;
    const aligned = (k: number): boolean =>
      Math.abs(r[k]! - r[k - 3]!) < 0.01 || Math.abs(r[k + 1]! - r[k - 2]!) < 0.01;
    const length = (k: number): number =>
      Math.abs(r[k]! - r[k - 3]!) + Math.abs(r[k + 1]! - r[k - 2]!);
    const turns = (k: number): boolean =>
      style === Style.Curved &&
      k > 0 &&
      k < r.length - 3 &&
      aligned(k) &&
      aligned(k + 3) &&
      length(k) >= 0.01 &&
      length(k + 3) >= 0.01 &&
      Math.abs(r[k]! - r[k - 3]!) < 0.01 !== Math.abs(r[k + 3]! - r[k]!) < 0.01;
    let atX = r[0]!;
    let atY = r[1]!;
    for (let k = 3; k < r.length; k += 3) {
      const part = (k === 3 ? 1 : 0) | (k === r.length - 3 ? 2 : 0);
      const x0 = atX;
      const y0 = atY;
      const x1 = r[k]!;
      const y1 = r[k + 1]!;
      atX = x1;
      atY = y1;
      if (aligned(k) || style === Style.Linear) {
        if (!turns(k)) {
          add(ei, part, x0, y0, x1, y1);
          continue;
        }
        // Adjacent corners share a leg, so each gets half.
        const before = turns(k - 3) ? length(k) / 2 : length(k);
        const after = turns(k + 3) ? length(k + 3) / 2 : length(k + 3);
        const ux = (x1 - r[k - 3]!) / length(k);
        const uy = (y1 - r[k - 2]!) / length(k);
        const vx = (r[k + 3]! - x1) / length(k + 3);
        const vy = (r[k + 4]! - y1) / length(k + 3);
        const sx = x1 - ux * before;
        const sy = y1 - uy * before;
        add(ei, part, x0, y0, sx, sy);
        const c1x = x1 - ux * before * (1 - HANDLE);
        const c1y = y1 - uy * before * (1 - HANDLE);
        const c2x = x1 + vx * after * (1 - HANDLE);
        const c2y = y1 + vy * after * (1 - HANDLE);
        atX = x1 + vx * after;
        atY = y1 + vy * after;
        const turn = part | (k + 3 === r.length - 3 ? 2 : 0);
        let px = sx;
        let py = sy;
        for (let i = 1; i <= CORNER_PIECES; i++) {
          const t = i / CORNER_PIECES;
          const u = 1 - t;
          const x = u * u * u * sx + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * atX;
          const y = u * u * u * sy + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * atY;
          add(ei, turn, px, py, x, y);
          px = x;
          py = y;
        }
        continue;
      }
      if (style === Style.Stepped) {
        const down = r[k + 2]! === 0;
        const mx = down ? x0 : (x0 + x1) / 2;
        const my = down ? (y0 + y1) / 2 : y0;
        add(ei, part, x0, y0, mx, my);
        add(ei, part, mx, my, down ? x1 : mx, down ? my : y1);
        add(ei, part, down ? x1 : mx, down ? my : y1, x1, y1);
        continue;
      }
      // Approximate the rendered S-curve with straight segments.
      const down = r[k + 2]! === 0;
      const c = down ? ease(x1 - x0, y1 - y0) : ease(y1 - y0, x1 - x0);
      let px = x0;
      let py = y0;
      for (let i = 1; i <= CURVE_PIECES; i++) {
        const t = i / CURVE_PIECES;
        const u = 1 - t;
        const across = t * t * (3 - 2 * t);
        const along = 3 * c * t * u * u + 3 * (1 - c) * t * t * u + t * t * t;
        const x = x0 + (x1 - x0) * (down ? across : along);
        const y = y0 + (y1 - y0) * (down ? along : across);
        add(ei, part, px, py, x, y);
        px = x;
        py = y;
      }
    }
  }
  // Count each pair only in the first band shared by both segments.
  const bands = bottom > top ? Math.round(Math.sqrt(count)) : 1;
  const scale = bottom > top ? bands / (bottom - top) : 0;
  const bandOf = (y: number): number => Math.min(bands - 1, Math.floor((y - top) * scale));
  const first = new Int32Array(count);
  const bandStart = new Int32Array(bands + 1);
  for (let p = 0; p < count; p++) {
    first[p] = bandOf(low[p]!);
    for (let b = first[p]!, last = bandOf(high[p]!); b <= last; b++) bandStart[b + 1]!++;
  }
  for (let b = 0; b < bands; b++) bandStart[b + 1]! += bandStart[b]!;
  const fill = bandStart.slice(0, bands);
  const inBand = new Int32Array(bandStart[bands]!);
  for (let p = 0; p < count; p++)
    for (let b = first[p]!, last = bandOf(high[p]!); b <= last; b++) inBand[fill[b]!++] = p;
  // Edges merging into a shared endpoint run do not count as crossings.
  const runs = new Float64Array(edges.length * 8);
  const inLine = (r: number[], a: number, b: number, c: number): boolean =>
    (Math.abs(r[a]! - r[b]!) < IN_LINE && Math.abs(r[a]! - r[c]!) < IN_LINE) ||
    (Math.abs(r[a + 1]! - r[b + 1]!) < IN_LINE && Math.abs(r[a + 1]! - r[c + 1]!) < IN_LINE);
  for (let ei = 0; ei < edges.length; ei++) {
    const r = edges[ei]!.route;
    if (r.length < 6) continue;
    let k = 3;
    while (k + 3 < r.length && inLine(r, 0, k, k + 3)) k += 3;
    const last = r.length - 3;
    let j = last - 3;
    while (j >= 3 && inLine(r, last, j, j - 3)) j -= 3;
    runs.set([r[0]!, r[1]!, r[k]!, r[k + 1]!, r[j]!, r[j + 1]!, r[last]!, r[last + 1]!], ei * 8);
  }
  const onRun = (ei: number, end: number, x: number, y: number): boolean => {
    const o = ei * 8 + (end === 1 ? 0 : 4);
    const x0 = runs[o]!;
    const y0 = runs[o + 1]!;
    const dx = runs[o + 2]! - x0;
    const dy = runs[o + 3]! - y0;
    const length = dx * dx + dy * dy;
    const t = length > 0 ? Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / length)) : 0;
    return Math.hypot(x - x0 - t * dx, y - y0 - t * dy) < IN_LINE;
  };
  let total = 0;
  for (let band = 0; band < bands; band++) {
    const bandEnd = bandStart[band + 1]!;
    if (bandEnd - bandStart[band]! > MAX_INSERT)
      inBand.subarray(bandStart[band], bandEnd).sort((p, q) => ax[p]! - ax[q]! || p - q);
    else {
      for (let i = bandStart[band]! + 1; i < bandEnd; i++) {
        const p = inBand[i]!;
        let j = i;
        for (; j > bandStart[band]! && ax[inBand[j - 1]!]! > ax[p]!; j--)
          inBand[j] = inBand[j - 1]!;
        inBand[j] = p;
      }
    }
    for (let s = bandStart[band]!; s < bandEnd; s++) {
      const p = inBand[s]!;
      const dx = bx[p]! - ax[p]!;
      const dy = by[p]! - ay[p]!;
      const here = first[p]! === band;
      for (let t = s + 1; t < bandEnd; t++) {
        const q = inBand[t]!;
        if (ax[q]! > bx[p]!) break;
        if (
          high[q]! < low[p]! ||
          low[q]! > high[p]! ||
          owner[p]! === owner[q]! ||
          (!here && first[q]! !== band)
        )
          continue;
        const d1 = dx * (ay[q]! - ay[p]!) - dy * (ax[q]! - ax[p]!);
        const d2 = dx * (by[q]! - ay[p]!) - dy * (bx[q]! - ax[p]!);
        // Treat points on the line as one side to count segment-boundary crossings once.
        if (d1 > 0 === d2 > 0) continue;
        const ex = bx[q]! - ax[q]!;
        const ey = by[q]! - ay[q]!;
        const d3 = ex * (ay[p]! - ay[q]!) - ey * (ax[p]! - ax[q]!);
        const d4 = ex * (by[p]! - ay[q]!) - ey * (bx[p]! - ax[q]!);
        if (d3 > 0 === d4 > 0) continue;
        const ep = edges[owner[p]!]!;
        const eq = edges[owner[q]!]!;
        const at = d3 / (d3 - d4);
        const x = ax[p]! + at * dx;
        const y = ay[p]! + at * dy;
        // Exclude fan-in and fan-out at shared nodes.
        const fanned = (v: number, pe: number, qe: number): boolean =>
          ((ends[p]! & pe) !== 0 && (ends[q]! & qe) !== 0) ||
          (Math.abs(x - nodes[v]!.x) < nodes[v]!.w / 2 + fan &&
            Math.abs(y - nodes[v]!.y) < nodes[v]!.h / 2 + fan) ||
          (onRun(owner[p]!, pe, x, y) && onRun(owner[q]!, qe, x, y));
        if (ep.src === eq.src && fanned(ep.src, 1, 1)) continue;
        if (ep.src === eq.dst && fanned(ep.src, 1, 2)) continue;
        if (ep.dst === eq.src && fanned(ep.dst, 2, 1)) continue;
        if (ep.dst === eq.dst && fanned(ep.dst, 2, 2)) continue;
        total++;
      }
    }
  }
  return total;
}

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

// The middle of a cell on the top side of `b`, off its corners, nearest the middle and at least
// `pitch` (else one cell) from where other routes already end there.
function freeTop(b: CNode, edges: CEdge[], grid: number, pitch: number): number {
  const top = b.y - b.h / 2;
  const lo = b.x - b.w / 2 + 1.5 * grid;
  const hi = b.x + b.w / 2 - 1.5 * grid;
  const used: number[] = [];
  for (const e of edges) {
    const r = e.route;
    for (const k of r.length >= 6 ? [0, r.length - 3] : [])
      if (Math.abs(r[k + 1]! - top) < 1e-6 && r[k]! >= lo && r[k]! <= hi) used.push(r[k]!);
  }
  const mid = midCell(b.x, grid);
  const cells: number[] = [];
  for (let x = lo; x <= hi + 1e-6; x += grid) cells.push(x);
  cells.sort((p, q) => Math.abs(p - mid) - Math.abs(q - mid) || p - q);
  for (const gap of [Math.max(pitch, grid), grid])
    for (const x of cells) if (used.every((u) => Math.abs(u - x) >= gap - 1e-6)) return x;
  return mid;
}

// The left end of a run `w` long from `start` on, `gap` clear of every line at `xs`.
function clearOf(start: number, w: number, xs: readonly number[], gap: number): number {
  let at = start;
  for (const x of [...xs].sort((p, q) => p - q)) if (x > at - gap && x < at + w + gap) at = x + gap;
  return at;
}

// Where the routes run straight down (or up) through the rows from `y0` to `y1`.
function verticalsAcross(edges: CEdge[], y0: number, y1: number): number[] {
  const xs: number[] = [];
  for (const { route: r } of edges) {
    for (let k = 3; k < r.length; k += 3) {
      if (Math.abs(r[k]! - r[k - 3]!) > 1e-6) continue;
      const lo = Math.min(r[k + 1]!, r[k - 2]!);
      const hi = Math.max(r[k + 1]!, r[k - 2]!);
      if (lo < y1 - 1e-6 && hi > y0 + 1e-6) xs.push(r[k]!);
    }
  }
  return xs;
}

// Whether `e`'s source end (`out`) or target end lies inside group `item` rather than on it.
function endpointBelow(item: number, e: CEdge, out: boolean): boolean {
  return (out ? e.src : e.dst) !== item;
}

// An edge between a group and one of its own members (#198).
interface OwnEdge {
  ei: number;
  group: number;
  member: number;
  // Whether the group is the edge's source.
  fromGroup: boolean;
  // Whether it runs down from the group's top into the member's top: on the grid every one, in
  // px the labelled ones. An unlabelled one in px runs in from the group's side (#416).
  fromTop: boolean;
  // In px, the line's offset from its member's middle, across the line: a member's lines spread.
  offset: number;
}

// The edges between a group and its own member (`stray`), in that order.
function ownEdgesOf(
  stray: readonly number[],
  edges: readonly CEdge[],
  depth: Int32Array,
  grid: number,
  pitch: number
): OwnEdge[] {
  const out: OwnEdge[] = [];
  const byMember = new Map<number, OwnEdge[]>();
  for (const ei of stray) {
    const e = edges[ei]!;
    const fromGroup = depth[e.src]! < depth[e.dst]!;
    const [group, member] = fromGroup ? [e.src, e.dst] : [e.dst, e.src];
    const own: OwnEdge = {
      ei,
      group,
      member,
      fromGroup,
      fromTop: grid > 0 || e.labelW > 0,
      offset: 0,
    };
    out.push(own);
    if (!grid) {
      // The lines from the top spread across the member. The loops from the side nest, those
      // from the group apart from those to it.
      const key = own.fromTop ? member * 3 : member * 3 + (fromGroup ? 1 : 2);
      let lines = byMember.get(key);
      if (!lines) byMember.set(key, (lines = []));
      lines.push(own);
    }
  }
  for (const lines of byMember.values())
    lines.forEach(
      (own, k) => (own.offset = (own.fromTop ? k - (lines.length - 1) / 2 : k) * pitch)
    );
  return out;
}

// An unlabelled edge between a group and its own member, in px (#416): a loop from the group's
// side border, across the gap before the member's row and round into the member near its corner.
// One from the group comes in at the member's top, one to the group leaves at its bottom, on the
// nearer side no other node stands in. A line between the two middles would lie under the
// member. Undefined where both sides are taken.
function sideRoute(
  nodes: readonly CNode[],
  { group: g, member: m, fromGroup, offset }: OwnEdge,
  pitch: number
): number[] | undefined {
  const group = nodes[g]!;
  const member = nodes[m]!;
  const out = fromGroup ? -1 : 1;
  // The member's top for a line from the group, its bottom for a line to it.
  const edge = member.y + (out * member.h) / 2;
  // The loop's lane: inside the group's frame, however little room it has before the member.
  const room = group.h / 2 - pitch / 4;
  const lane = Math.max(
    group.y - room,
    Math.min(group.y + room, edge + out * (1.5 * pitch + offset))
  );
  const inset = Math.min(member.w / 4, pitch + offset);
  let best: number[] | undefined;
  let shortest = Infinity;
  for (const sign of [-1, 1]) {
    const border = group.x + (sign * group.w) / 2;
    const turn = member.x + sign * (member.w / 2 - inset);
    const run = Math.abs(border - turn);
    // Another node in the way of this side's loop.
    const taken = nodes.some(
      (n, i) =>
        i !== m &&
        !n.isGroup &&
        Math.abs(n.x - (border + turn) / 2) < (n.w + run) / 2 &&
        Math.abs(n.y - (lane + edge) / 2) < (n.h + Math.abs(lane - edge)) / 2
    );
    if (taken || run >= shortest) continue;
    shortest = run;
    best = fromGroup
      ? [border, lane, 0, turn, lane, 1, turn, edge, 0]
      : [turn, edge, 0, turn, lane, 0, border, lane, 1];
  }
  return best;
}

// What the band sizing of a level reads: its laid-out items, and `boxX`, an item's x in the
// level's box (before the box's own offset).
interface BandLevel {
  nodes: readonly CNode[];
  edges: readonly CEdge[];
  level: Level;
  lnodes: readonly LNode[];
  boxX: (ln: LNode) => number;
  grid: number;
}

// The height a band of `labelled` edges' labels, one a row `gapY` apart from `bandTop` below the
// group's top, adds below the group's top padding.
function ownBandHeight(
  labelled: readonly CEdge[],
  bandTop: number,
  gapY: number,
  padTop: number
): number {
  let height = 0;
  for (const e of labelled) height += e.labelH + gapY;
  return Math.max(0, bandTop + height - padTop);
}

// The rightmost x in the box where a line of `own` may land on its member's top (`freeTop` on
// the grid).
function rightmostOwnLine({ nodes, level, lnodes, boxX, grid }: BandLevel, own: OwnEdge[]): number {
  let rightmost = -Infinity;
  for (const { member: m, fromTop, offset } of own) {
    if (!fromTop) continue;
    // The member's middle in the box: through the item of this level that holds it.
    let d = m;
    let x = 0;
    while (nodes[d]!.parent !== level.id) {
      x += nodes[d]!.x - (d === m ? 0 : nodes[d]!.w / 2);
      d = nodes[d]!.parent;
    }
    const dx = boxX(lnodes[level.items.indexOf(d)]!);
    const mid = d === m ? dx : dx - nodes[d]!.w / 2 + x;
    const half = nodes[m]!.w / 2;
    const lineX = grid
      ? mid + half - (nodes[m]!.w >= 3 * grid ? 1.5 * grid : grid / 2)
      : mid + offset;
    rightmost = Math.max(rightmost, lineX);
  }
  return rightmost;
}

// Where the lines into the level's members through its top border cross the band.
function topBorderCrossings(
  { nodes, edges, level, lnodes, boxX }: BandLevel,
  dummies: Int32Array,
  levelOf: ReadonlyMap<number, Level>
): number[] {
  const crossing: number[] = [];
  level.ports.forEach((port, i) => {
    if (port.side !== Side.Top) return;
    const d = dummies[i]!;
    if (d >= 0) {
      crossing.push(boxX(lnodes[d]!));
      return;
    }
    let x = boxX(lnodes[level.items.indexOf(port.inner)]!);
    const item = nodes[port.inner]!;
    if (item.isGroup && endpointBelow(port.inner, edges[port.e]!, port.out))
      x += levelOf.get(port.inner)!.portOf.get(port.e * 2 + (port.out ? 0 : 1))!.px - item.w / 2;
    crossing.push(x);
  });
  return crossing;
}

// The box width, at least `boxW`, that keeps the labels' right edge `right` (from the content's
// left) `inset` inside the frame, with the content still centred.
function widenedForOwnLabels(
  boxW: number,
  contentW: number,
  right: number,
  inset: number,
  grid: number
): number {
  if (!grid) return Math.max(boxW, 2 * (right + inset) - contentW);
  let w = boxW;
  while (floorTo((w - contentW) / 2, grid) + right > w - inset + 1e-9) w += 2 * grid;
  return w;
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

const START_SIDE: Readonly<Record<Dir, Side>> = {
  TB: Side.Top,
  BT: Side.Bottom,
  LR: Side.Left,
  RL: Side.Right,
};

function startSide(dir: Dir): Side {
  return START_SIDE[dir];
}

function opposite(side: Side): Side {
  return ((side + 2) & 3) as Side;
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
  const M = opt.metrics ?? pxProfile.engine;
  const grid = opt.grid !== undefined && opt.grid > 0 ? opt.grid : 0;
  const n = nodes.length;
  const levelOf = new Map<number, Level>();
  const order: Level[] = [];
  const makeLevel = (id: number, dir: Dir): Level => {
    const level: Level = {
      id,
      dir,
      items: [],
      edges: [],
      ports: [],
      portOf: new Map(),
      routes: new Map(),
      x: 0,
      y: 0,
    };
    levelOf.set(id, level);
    return level;
  };
  const root = makeLevel(-1, rootDir);

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
  const placed = new Uint8Array(n);
  const descend = (from: number): void => {
    for (let q = from; q < order.length; q++) {
      const level = order[q]!;
      for (const item of level.items) {
        placed[item] = 1;
        depth[item] = level.id < 0 ? 0 : depth[level.id]! + 1;
        if (nodes[item]!.isGroup) {
          const child = makeLevel(item, nodes[item]!.dir ?? level.dir);
          child.items = children[item]!;
          order.push(child);
        }
      }
    }
  };
  descend(0);
  // Groups that contain each other are unreachable from the root; lift them out.
  for (let i = 0; i < n; i++) {
    if (placed[i]!) continue;
    const former = nodes[i]!.parent;
    children[former] = children[former]!.filter((c) => c !== i);
    nodes[i]!.parent = -1;
    root.items.push(i);
    placed[i] = 1;
    depth[i] = 0;
    if (nodes[i]!.isGroup) {
      const from = order.length;
      const child = makeLevel(i, nodes[i]!.dir ?? rootDir);
      child.items = children[i]!;
      order.push(child);
      descend(from);
    }
  }

  for (let q = order.length - 1; q > 0; q--) {
    const level = order[q]!;
    let seq = Infinity;
    for (const item of level.items) if (nodes[item]!.seq < seq) seq = nodes[item]!.seq;
    if (seq !== Infinity) nodes[level.id]!.seq = seq;
  }
  for (const level of order) level.items.sort((a, b) => nodes[a]!.seq - nodes[b]!.seq || a - b);

  // Every group border an edge crosses costs a port. Past the budget, an edge is drawn between
  // the groups that hold its ends, at the level they share.
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

  const loops: number[] = [];
  const stray: number[] = [];
  for (let ei = 0; ei < edges.length; ei++) {
    const e = edges[ei]!;
    e.route = [];
    if (e.src === e.dst) {
      loops.push(ei);
      continue;
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
      stray.push(ei);
      continue;
    }
    while (nodes[a]!.parent !== nodes[b]!.parent) {
      aPath.push(a);
      bPath.push(b);
      a = nodes[a]!.parent;
      b = nodes[b]!.parent;
    }
    levelOf.get(nodes[a]!.parent)!.edges.push({ e: ei, a, b });
    for (const [path, out] of [
      [aPath, true],
      [bPath, false],
    ] as const) {
      for (const inner of path) {
        const level = levelOf.get(nodes[inner]!.parent)!;
        const port: PortEdge = {
          e: ei,
          inner,
          out,
          side: Side.Top,
          hint: NaN,
          px: 0,
          py: 0,
          route: [],
        };
        level.ports.push(port);
        level.portOf.set(ei * 2 + (out ? 0 : 1), port);
      }
    }
  }

  // Edges between a group and its own member (#198), by group. Each runs down from the group's
  // top into the member's top; their labels sit in a band of rows at the top of the group, below
  // its title and above its content, right of every such line, one label a row. On the grid every
  // such edge runs so; in px the labelled ones do (an unlabelled one keeps its straight line).
  const ownEdges = ownEdgesOf(stray, edges, depth, grid, M.portPitch);
  const ownByGroup = new Map<number, OwnEdge[]>();
  for (const own of ownEdges) {
    let list = ownByGroup.get(own.group);
    if (!list) ownByGroup.set(own.group, (list = []));
    list.push(own);
  }
  const ownGapX = grid ? grid / 2 : Math.max(M.endLabelAcross, M.portPitch / 2);
  const ownGapY = grid ? 0 : M.loopGap;
  // Where the band starts below the group's top: on the grid the title is on the border row.
  const bandTop = (g: CNode): number => (grid ? grid : g.padTop);

  const local = new Int32Array(n);

  // The room an edge-end label takes along the flow of its level, with the room before it (D102).
  const endRoom = (
    size: { width: number; height: number } | undefined,
    vertical: boolean,
    head: boolean
  ): number =>
    size
      ? (vertical ? size.height : size.width) + M.endLabelAlong + (head ? (opt.headRoom ?? 0) : 0)
      : 0;
  const build = (
    level: Level,
    sized: boolean
  ): { lnodes: LNode[]; ledges: LEdge[]; dummies: Int32Array } => {
    const vertical = level.dir === 'TB' || level.dir === 'BT';
    const start = startSide(level.dir);
    const lnodes: LNode[] = [];
    const ledges: LEdge[] = [];
    level.items.forEach((item, i) => {
      local[item] = i;
      const node = nodes[item]!;
      const sw = node.w + node.loopW;
      const sh = node.h + node.loopH;
      const ln = sized ? lnode(vertical ? sw : sh, vertical ? sh : sw) : lnode(0, 0);
      // On the grid a group's ends may use its whole side off the corners, which it grows for.
      const inset = grid ? M.corner : node.padX;
      ln.span = node.isGroup
        ? Math.min(node.span, (vertical ? node.w : node.h) - 2 * inset)
        : node.span;
      ln.key = keyed ? key[item]! : NaN;
      lnodes.push(ln);
    });
    const held = (item: number, ei: number, out: boolean): boolean =>
      nodes[item]!.isGroup && endpointBelow(item, edges[ei]!, out);
    const offset = (item: number, ei: number, out: boolean): number => {
      if (!sized || !nodes[item]!.isGroup || !endpointBelow(item, edges[ei]!, out)) return 0;
      const port = levelOf.get(item)!.portOf.get(ei * 2 + (out ? 0 : 1))!;
      return vertical ? port.px - nodes[item]!.w / 2 : port.py - nodes[item]!.h / 2;
    };
    for (const le of level.edges) {
      const e = edges[le.e]!;
      const edge = ledge(local[le.a]!, local[le.b]!, e.minlen);
      if (sized) {
        edge.labelW = vertical ? e.labelW : e.labelH;
        edge.labelH = vertical ? e.labelH : e.labelW;
        edge.tailDx = offset(le.a, le.e, true);
        edge.headDx = offset(le.b, le.e, false);
        edge.tailFixed = held(le.a, le.e, true);
        edge.headFixed = held(le.b, le.e, false);
        if (le.a === e.src) edge.tailEnd = endRoom(e.start, vertical, false);
        if (le.b === e.dst) edge.headEnd = endRoom(e.end, vertical, true);
      }
      ledges.push(edge);
    }
    const dummies = new Int32Array(level.ports.length).fill(-1);
    level.ports.forEach((port, i) => {
      if (port.side === start || port.side === opposite(start)) {
        const d = lnodes.length;
        const ln = lnode(0, 0, port.side === start ? Kind.StartPort : Kind.EndPort);
        ln.key = keyed ? key[port.out ? edges[port.e]!.dst : edges[port.e]!.src]! : NaN;
        ln.hint = Number.isNaN(port.hint) && keyed && farHint ? farHint(level, port) : port.hint;
        lnodes.push(ln);
        dummies[i] = d;
        const edge = port.out ? ledge(local[port.inner]!, d) : ledge(d, local[port.inner]!);
        const e = edges[port.e]!;
        if (port.out) {
          edge.tailDx = offset(port.inner, port.e, true);
          edge.tailFixed = held(port.inner, port.e, true);
          if (sized && port.inner === e.src) edge.tailEnd = endRoom(e.start, vertical, false);
        } else {
          edge.headDx = offset(port.inner, port.e, false);
          edge.headFixed = held(port.inner, port.e, false);
          if (sized && port.inner === e.dst) edge.headEnd = endRoom(e.end, vertical, true);
        }
        ledges.push(edge);
      } else {
        lnodes[local[port.inner]!]!.pin =
          port.side === Side.Top || port.side === Side.Left ? -1 : 1;
      }
    });
    return { lnodes, ledges, dummies };
  };

  const ordered = ports > 1 && ports <= MAX_ORDERED_PORTS && edges.length <= MAX_ORDERED_EDGES;

  // Use a flat layout to coordinate node and port order across groups.
  const key = new Float64Array(n).fill(NaN);
  let keyed = false;
  let flatCrossings = 0;
  let farHint: ((level: Level, port: PortEdge) => number) | undefined;
  let flat = order.length > 1 && ordered;
  for (const level of order) if (level.dir !== rootDir) flat = false;
  if (flat) {
    const vertical = rootDir === 'TB' || rootDir === 'BT';
    const leaf = new Int32Array(n).fill(-1);
    const group = new Int32Array(n).fill(-1);
    const lnodes: LNode[] = [];
    const of: number[] = [];
    const parent: number[] = [];
    for (let i = 0; i < n; i++) {
      if (!nodes[i]!.isGroup) continue;
      group[i] = parent.length;
      parent.push(-1);
    }
    for (let i = 0; i < n; i++) {
      const p = nodes[i]!.parent;
      if (nodes[i]!.isGroup) parent[group[i]!] = p >= 0 ? group[p]! : -1;
      else {
        leaf[i] = lnodes.length;
        lnodes.push(
          lnode(vertical ? nodes[i]!.w : nodes[i]!.h, vertical ? nodes[i]!.h : nodes[i]!.w)
        );
        of.push(p >= 0 ? group[p]! : -1);
      }
    }
    const ledges: LEdge[] = [];
    const ledgeOf = new Int32Array(edges.length).fill(-1);
    edges.forEach((e, ei) => {
      if (e.src === e.dst || leaf[e.src]! < 0 || leaf[e.dst]! < 0) return;
      ledgeOf[ei] = ledges.length;
      ledges.push(
        ledge(
          leaf[e.src]!,
          leaf[e.dst]!,
          e.minlen,
          vertical ? e.labelW : e.labelH,
          vertical ? e.labelH : e.labelW
        )
      );
    });
    const flatLayout = layered(lnodes, ledges, {
      ...opt,
      groups: { of: Int32Array.from(of), parent: Int32Array.from(parent) },
      orderOnly: true,
    });
    flatCrossings = Math.min(flatLayout.crossings ?? 0, flatLayout.declared ?? 0);
    const sum = new Float64Array(n);
    const count = new Int32Array(n);
    // Last rank occupied by each group.
    const last = new Int32Array(n).fill(-1);
    for (let i = 0; i < n; i++) {
      if (leaf[i]! < 0) continue;
      key[i] = lnodes[leaf[i]!]!.x;
      for (let p = nodes[i]!.parent; p >= 0; p = nodes[p]!.parent) {
        sum[p]! += key[i]!;
        count[p]!++;
        last[p] = Math.max(last[p]!, lnodes[leaf[i]!]!.rank);
      }
    }
    for (let i = 0; i < n; i++) if (count[i]! > 0) key[i] = sum[i]! / count[i]!;
    // Order outgoing ports at the group's last rank; break ties using the next rank.
    farHint = (level: Level, port: PortEdge): number => {
      const le = ledgeOf[port.e]!;
      if (le < 0 || level.id < 0 || !port.out || port.side !== opposite(startSide(level.dir)))
        return NaN;
      const points = ledges[le]!.points;
      let inside = key[edges[port.e]!.src]!;
      let outside = 0;
      for (let k = 0; k < points.length; k += 2) {
        if (points[k]! === last[level.id]!) inside = points[k + 1]!;
        if (points[k]! === last[level.id]! + 1) outside = points[k + 1]!;
      }
      return inside + outside * 1e-6;
    };
  }

  // Reuse unchanged levels across layout attempts.
  const laid = new Map<
    number,
    { given: number[]; lnodes: LNode[]; ledges: LEdge[]; size: LayeredResult }[]
  >();
  const layOut = (
    level: Level,
    lnodes: LNode[],
    ledges: LEdge[]
  ): { lnodes: LNode[]; ledges: LEdge[]; size: LayeredResult } => {
    if (!ordered) return { lnodes, ledges, size: layered(lnodes, ledges, opt) };
    const given = layoutInputs(lnodes, ledges);
    let past = laid.get(level.id);
    if (!past) laid.set(level.id, (past = []));
    for (const p of past) {
      let same = p.given.length === given.length;
      for (let i = 0; same && i < given.length; i++) same = Object.is(p.given[i]!, given[i]!);
      if (same) return p;
    }
    const done = { given, lnodes, ledges, size: layered(lnodes, ledges, opt) };
    past.push(done);
    return done;
  };

  let total: CompoundResult = { width: 0, height: 0 };
  const place = (): void => {
    // Rank parents first to determine which group sides edges cross.
    for (const level of order) {
      for (const port of level.ports) {
        if (nodes[port.inner]!.isGroup && endpointBelow(port.inner, edges[port.e]!, port.out)) {
          levelOf.get(port.inner)!.portOf.get(port.e * 2 + (port.out ? 0 : 1))!.side = port.side;
        }
      }
      if (level.edges.length === 0) continue;
      let needed = false;
      for (const le of level.edges) {
        const e = edges[le.e]!;
        if ((nodes[le.a]!.isGroup && e.src !== le.a) || (nodes[le.b]!.isGroup && e.dst !== le.b))
          needed = true;
      }
      if (!needed) continue;
      const { lnodes, ledges } = build(level, false);
      orient(lnodes, ledges);
      rank(lnodes, ledges, 1);
      const start = startSide(level.dir);
      level.edges.forEach((le, i) => {
        const e = edges[le.e]!;
        const aAbove = !ledges[i]!.reversed;
        if (nodes[le.a]!.isGroup && e.src !== le.a) {
          levelOf.get(le.a)!.portOf.get(le.e * 2)!.side = aAbove ? opposite(start) : start;
        }
        if (nodes[le.b]!.isGroup && e.dst !== le.b) {
          levelOf.get(le.b)!.portOf.get(le.e * 2 + 1)!.side = aAbove ? start : opposite(start);
        }
      });
    }

    // Lay out children first so their sizes are known.
    for (let q = order.length - 1; q >= 0; q--) {
      const level = order[q]!;
      const group = level.id >= 0 ? nodes[level.id]! : undefined;
      const vertical = level.dir === 'TB' || level.dir === 'BT';
      const flip = level.dir === 'BT' || level.dir === 'RL';
      const built = build(level, true);
      const { lnodes, ledges, size } = layOut(level, built.lnodes, built.ledges);
      const dummies = built.dummies;
      const contentW = vertical ? size.width : size.height;
      const contentH = vertical ? size.height : size.width;
      const padX = group ? group.padX : 0;
      const padTop = group ? group.padTop : 0;
      let boxW = Math.max(contentW + 2 * padX, group ? group.minW : 0);
      // On the grid a frame wider than its content (a long title) keeps the content centred:
      // the slack is a whole number of cells either side.
      if (grid && level.items.length > 0 && Math.round((boxW - contentW) / grid) % 2 !== 0)
        boxW += grid;
      const across = (ly: number): number => (flip ? size.height - ly : ly);
      // Room for the labels of the group's edges to its own members (#198): the band below the
      // title, and the width for them right of the lines.
      let bandH = 0;
      const own = group ? ownByGroup.get(level.id) : undefined;
      const labelled = own
        ? own.filter((o) => edges[o.ei]!.labelW > 0).map((o) => edges[o.ei]!)
        : [];
      if (group && own && labelled.length > 0) {
        const boxX = (ln: LNode): number => (vertical ? ln.x : across(ln.y));
        const band: BandLevel = { nodes, edges, level, lnodes, boxX, grid };
        bandH = ownBandHeight(labelled, bandTop(group), ownGapY, padTop);
        let widest = 0;
        for (const e of labelled) widest = Math.max(widest, e.labelW);
        const crossing = topBorderCrossings(band, built.dummies, levelOf);
        const lines = rightmostOwnLine(band, own);
        const right = clearOf(lines + ownGapX, widest, crossing, ownGapX) + widest;
        boxW = widenedForOwnLabels(boxW, contentW, right, grid ? grid : padX, grid);
      }
      const boxH = contentH + padTop + bandH + (group ? group.padBottom : 0);
      const offX = grid ? floorTo((boxW - contentW) / 2, grid) : (boxW - contentW) / 2;
      const offY = padTop + bandH;
      const tx = (lx: number, ly: number): number => offX + (vertical ? lx : across(ly));
      const ty = (lx: number, ly: number): number => offY + (vertical ? across(ly) : lx);
      const axis = vertical ? 0 : 1;
      const convert = (points: number[]): number[] => {
        const out: number[] = [];
        for (let i = 0; i < points.length; i += 2)
          out.push(tx(points[i]!, points[i + 1]!), ty(points[i]!, points[i + 1]!), axis);
        return out;
      };

      level.items.forEach((item, i) => {
        nodes[item]!.x = tx(lnodes[i]!.x, lnodes[i]!.y);
        nodes[item]!.y = ty(lnodes[i]!.x, lnodes[i]!.y);
      });
      level.edges.forEach((le, i) => {
        const edge = ledges[i]!;
        level.routes.set(le.e, convert(edge.points));
        const e = edges[le.e]!;
        if (e.labelW > 0) {
          e.labelX = tx(edge.labelX, edge.labelY);
          e.labelY = ty(edge.labelX, edge.labelY);
        }
      });
      let k = level.edges.length;
      level.ports.forEach((port, i) => {
        const item = nodes[port.inner]!;
        if (dummies[i]! >= 0) {
          const route = convert(ledges[k++]!.points);
          const at = port.out ? route.length - 3 : 0;
          let bx = route[at]!;
          let by = route[at + 1]!;
          if (port.side === Side.Top) by = 0;
          else if (port.side === Side.Bottom) by = boxH;
          else if (port.side === Side.Left) bx = 0;
          else bx = boxW;
          if (port.out) route.push(bx, by, axis);
          else route.unshift(bx, by, axis);
          port.px = bx;
          port.py = by;
          port.route = route;
          return;
        }
        let ix = item.x;
        let iy = item.y;
        if (item.isGroup && endpointBelow(port.inner, edges[port.e]!, port.out)) {
          const inner = levelOf.get(port.inner)!.portOf.get(port.e * 2 + (port.out ? 0 : 1))!;
          ix += inner.px - item.w / 2;
          iy += inner.py - item.h / 2;
        } else if (port.side === Side.Top) iy -= item.h / 2;
        else if (port.side === Side.Bottom) iy += item.h / 2;
        else if (port.side === Side.Left) ix -= item.w / 2;
        else ix += item.w / 2;
        // On the grid, a line runs through the middle of a cell (D78).
        if (grid && !(item.isGroup && endpointBelow(port.inner, edges[port.e]!, port.out))) {
          if (port.side === Side.Top || port.side === Side.Bottom) ix = midCell(ix, grid);
          else iy = midCell(iy, grid);
        }
        let bx = ix;
        let by = iy;
        if (port.side === Side.Top) by = 0;
        else if (port.side === Side.Bottom) by = boxH;
        else if (port.side === Side.Left) bx = 0;
        else bx = boxW;
        const a = port.side === Side.Top || port.side === Side.Bottom ? 0 : 1;
        port.px = bx;
        port.py = by;
        port.route = port.out ? [ix, iy, a, bx, by, a] : [bx, by, a, ix, iy, a];
      });

      if (group) {
        group.w = boxW;
        group.h = boxH;
      } else {
        total = { width: boxW, height: boxH };
      }
    }

    for (const level of order) {
      const ox = level.x;
      const oy = level.y;
      for (const item of level.items) {
        const node = nodes[item]!;
        node.x += ox;
        node.y += oy;
        if (node.isGroup) {
          const child = levelOf.get(item)!;
          child.x = node.x - node.w / 2;
          child.y = node.y - node.h / 2;
        }
      }
    }

    const append = (route: number[], part: number[], ox: number, oy: number): void => {
      for (let i = 0; i < part.length; i += 3) {
        const x = part[i]! + ox;
        const y = part[i + 1]! + oy;
        const len = route.length;
        if (
          len >= 3 &&
          Math.abs(route[len - 3]! - x) < 0.01 &&
          Math.abs(route[len - 2]! - y) < 0.01
        )
          continue;
        route.push(x, y, part[i + 2]!);
      }
    };

    for (const level of order) {
      for (const le of level.edges) {
        const e = edges[le.e]!;
        const route: number[] = [];
        const outward: Level[] = [];
        for (let item = e.src; nodes[item]!.parent !== level.id; item = nodes[item]!.parent) {
          outward.push(levelOf.get(nodes[item]!.parent)!);
        }
        for (const lv of outward) append(route, lv.portOf.get(le.e * 2)!.route, lv.x, lv.y);
        append(route, level.routes.get(le.e)!, level.x, level.y);
        const inward: Level[] = [];
        for (let item = e.dst; nodes[item]!.parent !== level.id; item = nodes[item]!.parent) {
          inward.push(levelOf.get(nodes[item]!.parent)!);
        }
        for (let i = inward.length - 1; i >= 0; i--) {
          append(route, inward[i]!.portOf.get(le.e * 2 + 1)!.route, inward[i]!.x, inward[i]!.y);
        }
        e.route = route;
        if (e.labelW > 0) {
          e.labelX += level.x;
          e.labelY += level.y;
        }
      }
    }
  };
  // The flat layout ignores group boxes, so independent ordering may yield fewer crossings.
  const style = styleOf(opt);
  keyed = flat;
  place();
  let crossings = -1;
  if (flat) {
    crossings = routeCrossings(nodes, edges, style, M.fan);
    if (crossings > flatCrossings * FLAT_SLACK + FLAT_SPARE) {
      const first = snapshot(nodes, edges, order, total);
      keyed = false;
      place();
      const own = routeCrossings(nodes, edges, style, M.fan);
      if (own >= crossings) {
        keyed = true;
        total = restore(first, nodes, edges, order);
      } else crossings = own;
    }
  }

  // Refine port order using routes outside each group. Skip this if independent ordering won;
  // it rarely helps enough to justify another layout.
  if (keyed === flat && ordered) {
    let again = false;
    for (const level of order) {
      if (level.id < 0) continue;
      const box = nodes[level.id]!;
      const vertical = level.dir === 'TB' || level.dir === 'BT';
      const end = opposite(startSide(level.dir));
      const seen: number[][] = [];
      for (const port of level.ports) {
        if (port.side !== end) continue;
        // Skip the straight run out of the port to find where the edge turns.
        const route = edges[port.e]!.route;
        const bx = level.x + port.px;
        const by = level.y + port.py;
        let at = -1;
        for (let k = 0; k < route.length && (at < 0 || port.out); k += 3)
          if (Math.abs(route[k]! - bx) < 0.01 && Math.abs(route[k + 1]! - by) < 0.01) at = k;
        if (at < 0) continue;
        const a = vertical ? 0 : 1;
        let next = port.out ? at + 3 : at - 3;
        while (
          next >= 0 &&
          next < route.length &&
          Math.abs(route[next + a]! - route[at + a]!) < IN_LINE
        )
          next += port.out ? 3 : -3;
        if (next < 0 || next >= route.length) continue;
        port.hint = route[next + a]! - (vertical ? box.x - box.w / 2 : box.y - box.h / 2);
        seen.push([vertical ? port.px : port.py, port.hint]);
      }
      seen.sort((p, q) => p[0]! - q[0]!);
      for (let i = 1; i < seen.length; i++) if (seen[i - 1]![1]! > seen[i]![1]!) again = true;
    }
    if (again) {
      const before = crossings >= 0 ? crossings : routeCrossings(nodes, edges, style, M.fan);
      const first = before > 0 ? snapshot(nodes, edges, order, total) : undefined;
      if (first) {
        place();
        if (routeCrossings(nodes, edges, style, M.fan) >= before)
          total = restore(first, nodes, edges, order);
      }
    }
  }

  for (const own of ownEdges) {
    const { ei, group: g, member: m, fromGroup, fromTop, offset } = own;
    const e = edges[ei]!;
    const a = nodes[e.src]!;
    const b = nodes[e.dst]!;
    e.route = [a.x, a.y, 0, b.x, b.y, 0];
    e.labelX = (a.x + b.x) / 2;
    e.labelY = (a.y + b.y) / 2;
    if (!fromTop) {
      e.route = sideRoute(nodes, own, M.portPitch) ?? e.route;
      continue;
    }
    // Between a group and its own member, either way: down from the group's top to the member's
    // top. On the grid it starts on the group's top border row (half a cell inside it, so the
    // route stays in the drawing), in a cell of the member's side no other edge ends in (D140);
    // clearing the way is the repair router's (#45, D78). In px it starts on the top border, or
    // below the title where the title is in its way.
    const group = nodes[g]!;
    const member = nodes[m]!;
    const top = member.y - member.h / 2;
    let x: number;
    let frame: number;
    if (grid) {
      x = freeTop(member, edges, grid, edgeOn(M.portPitch, grid));
      frame = group.y - group.h / 2 + grid;
    } else {
      x = member.x + offset;
      frame = group.y - group.h / 2;
      const title = Math.max(0, group.minW - 2 * group.padX) / 2;
      if (title > 0 && Math.abs(x - group.x) < title + M.endLabelAcross) frame += group.padTop;
    }
    e.route = fromGroup ? [x, frame, 0, x, top, 0] : [x, top, 0, x, frame, 0];
  }
  // Their labels: one a row in the band below the group's title, right of all its such lines
  // (#198). On the border row a label would cover the group's title and corners.
  for (const [g, own] of ownByGroup) {
    const group = nodes[g]!;
    let rightmostLine = -Infinity;
    for (const o of own)
      if (o.fromTop) rightmostLine = Math.max(rightmostLine, edges[o.ei]!.route[0]!);
    let y = group.y - group.h / 2 + bandTop(group);
    for (const { ei } of own) {
      const e = edges[ei]!;
      if (e.labelW <= 0) continue;
      const crossing = verticalsAcross(edges, y, y + e.labelH);
      e.labelX = clearOf(rightmostLine + ownGapX, e.labelW, crossing, ownGapX) + e.labelW / 2;
      e.labelY = y + e.labelH / 2;
      y += e.labelH + ownGapY;
    }
  }
  for (const ei of loops) {
    const e = edges[ei]!;
    const node = nodes[e.src]!;
    e.labelX = node.x + node.w / 2 + M.loopLabel + e.labelW / 2;
    e.labelY = node.y;
  }

  return total;
}
