// Ported from Pele (https://github.com/obsidianmd/pele), src/layout/compound.ts at 3a2f075.
// Copyright (c) 2026 kepano. MIT License: see THIRD_PARTY_NOTICES in @mermaid-js/core.
// Changes from Pele: split out of `compound.ts` (D596): `place`, which lays every level out and
// puts the results in the plane in phases, and the pass that reads port hints off the routes.
// They share the `Compound` record. The algorithm is unchanged.
// cspell:ignore kepano lnode lnodes cnode
//
import type { CNode } from './compound.ts';
import { buildLayer, layOutLevel } from './compound-layer.ts';
import {
  bandTop,
  clearOf,
  endpointBelow,
  ownBandHeight,
  rightmostOwnLine,
  topBorderCrossings,
  type BandLevel,
} from './compound-own.ts';
import {
  appendRoute,
  opposite,
  Side,
  startSide,
  type Compound,
  type Level,
  type PortEdge,
} from './compound-state.ts';
import { IN_LINE } from './crossings.ts';
import type { GridHooks } from './grid.ts';
import { orient, type LEdge, type LNode, type LayeredResult } from './layered.ts';

const isVertical = (level: Level): boolean => level.dir === 'TB' || level.dir === 'BT';

// The side a port of group `port.inner` is on is its own port's, once that is known.
function innerPort(c: Compound, port: PortEdge): PortEdge {
  return c.levelOf.get(port.inner)!.portOf.get(port.e * 2 + (port.out ? 0 : 1))!;
}

// Rank parents first to determine which group sides edges cross.
function rankParents(c: Compound): void {
  const { nodes, edges, levelOf, order } = c;
  for (const level of order) {
    for (const port of level.ports) {
      if (nodes[port.inner]!.isGroup && endpointBelow(port.inner, edges[port.e]!, port.out)) {
        innerPort(c, port).side = port.side;
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
    const { lnodes, ledges } = buildLayer(c, level, false);
    orient(lnodes, ledges);
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
}

// One level laid out: its content and box, and where its content sits in the box.
interface Fit {
  level: Level;
  group: CNode | undefined;
  vertical: boolean;
  flip: boolean;
  lnodes: LNode[];
  ledges: LEdge[];
  dummies: Int32Array;
  size: LayeredResult;
  contentW: number;
  contentH: number;
  padTop: number;
  boxW: number;
  boxH: number;
  offX: number;
  offY: number;
}

const across = (f: Fit, ly: number): number => (f.flip ? f.size.height - ly : ly);
const tx = (f: Fit, lx: number, ly: number): number => f.offX + (f.vertical ? lx : across(f, ly));
const ty = (f: Fit, lx: number, ly: number): number => f.offY + (f.vertical ? across(f, ly) : lx);

// The route points (x, y, axis triples) of `points` (x, y pairs in the layout) in the level's box.
function convert(f: Fit, points: number[]): number[] {
  const axis = f.vertical ? 0 : 1;
  const out: number[] = [];
  for (let i = 0; i < points.length; i += 2)
    out.push(tx(f, points[i]!, points[i + 1]!), ty(f, points[i]!, points[i + 1]!), axis);
  return out;
}

// The height of the band for the labels of the group's edges to its own members (#198), below the
// title, and widens the box for them right of the lines.
function ownBand(c: Compound, f: Fit): number {
  const { nodes, edges, hooks, levelOf } = c;
  const { level, group, lnodes, vertical } = f;
  const own = group ? c.ownByGroup.get(level.id) : undefined;
  if (!group || !own) return 0;
  const labelled = own.filter((o) => edges[o.ei]!.labelW > 0).map((o) => edges[o.ei]!);
  if (labelled.length === 0) return 0;
  const boxX = (ln: LNode): number => (vertical ? ln.x : across(f, ln.y));
  const band: BandLevel = { nodes, edges, level, lnodes, boxX, hooks };
  const bandH = ownBandHeight(labelled, bandTop(c, group), c.ownGapY, f.padTop);
  let widest = 0;
  for (const e of labelled) widest = Math.max(widest, e.labelW);
  const crossing = topBorderCrossings(band, f.dummies, levelOf);
  const lines = rightmostOwnLine(band, own);
  const right = clearOf(lines + c.ownGapX, widest, crossing, c.ownGapX) + widest;
  f.boxW = hooks
    ? hooks.widen(f.boxW, f.contentW, right)
    : Math.max(f.boxW, 2 * (right + group.padX) - f.contentW);
  return bandH;
}

// Lays out `level`'s content and sizes its box: wide enough for the content, the group's least
// width and its own edges' labels, and tall enough for its padding and the band.
function fitLevel(c: Compound, level: Level): Fit {
  const { nodes, opt, hooks } = c;
  const group = level.id >= 0 ? nodes[level.id]! : undefined;
  const vertical = isVertical(level);
  const built = buildLayer(c, level, true);
  const { lnodes, ledges, size } = layOutLevel(c, level, built.lnodes, built.ledges);
  const contentW = vertical ? size.width : size.height;
  const contentH = vertical ? size.height : size.width;
  const padTop = group ? group.padTop : 0;
  let boxW = Math.max(contentW + 2 * (group ? group.padX : 0), group ? group.minW : 0);
  // On the grid a frame wider than its content (a long title) keeps the content centred:
  // the slack is a whole number of cells either side.
  if (hooks && level.items.length > 0) boxW = hooks.centred(boxW, contentW);
  const f: Fit = {
    level,
    group,
    vertical,
    flip: level.dir === 'BT' || level.dir === 'RL',
    lnodes,
    ledges,
    dummies: built.dummies,
    size,
    contentW,
    contentH,
    padTop,
    boxW,
    boxH: 0,
    offX: 0,
    offY: 0,
  };
  const bandH = ownBand(c, f) + opt.portSep * +level.ports.some((p) => p.below);
  f.boxH = contentH + padTop + bandH + (group ? group.padBottom : 0);
  f.offX = hooks ? hooks.floor((f.boxW - contentW) / 2) : (f.boxW - contentW) / 2;
  f.offY = padTop + bandH;
  return f;
}

// The route of a port that has a dummy node: the route `layered` found, to the box's border.
function dummyPortRoute(f: Fit, port: PortEdge, points: number[]): void {
  const route = convert(f, points);
  const at = port.out ? route.length - 3 : 0;
  let bx = route[at]!;
  let by = route[at + 1]!;
  if (port.side === Side.Top) by = port.below * f.padTop;
  else if (port.side === Side.Bottom) by = f.boxH;
  else if (port.side === Side.Left) bx = 0;
  else bx = f.boxW;
  if (port.out) route.push(bx, by, f.vertical ? 0 : 1);
  else route.unshift(bx, by, f.vertical ? 0 : 1);
  port.px = bx;
  port.py = by;
  port.route = route;
}

type Point = readonly [number, number];

// Where a straight port leaves its item: the item's own side.
function sideEnd(item: CNode, side: Side): Point {
  if (side === Side.Top) return [item.x, item.y - item.h / 2];
  if (side === Side.Bottom) return [item.x, item.y + item.h / 2];
  if (side === Side.Left) return [item.x - item.w / 2, item.y];
  return [item.x + item.w / 2, item.y];
}

// Where a straight port leaves a group that holds its edge's end: the group's own port.
function belowEnd(c: Compound, port: PortEdge, item: CNode): Point {
  const inner = innerPort(c, port);
  return [item.x + (inner.px - item.w / 2), item.y + (inner.py - item.h / 2)];
}

// On the grid, a line runs through the middle of a cell (D78).
function cellMiddle(hooks: GridHooks, side: Side, [ix, iy]: Point): Point {
  if (side === Side.Top || side === Side.Bottom) return [hooks.mid(ix), iy];
  return [ix, hooks.mid(iy)];
}

// The point of the box's border on the port's side, in line with `(ix, iy)`.
function borderPoint(f: Fit, side: Side, [ix, iy]: Point): Point {
  if (side === Side.Top) return [ix, 0];
  if (side === Side.Bottom) return [ix, f.boxH];
  if (side === Side.Left) return [0, iy];
  return [f.boxW, iy];
}

// Sets the port's border point and its route from `(ix, iy)` to it.
function setStraightRoute(f: Fit, port: PortEdge, item: Point): void {
  const [ix, iy] = item;
  const [bx, by] = borderPoint(f, port.side, item);
  const a = port.side === Side.Top || port.side === Side.Bottom ? 0 : 1;
  port.px = bx;
  port.py = by;
  port.route = port.out ? [ix, iy, a, bx, by, a] : [bx, by, a, ix, iy, a];
}

// Where a straight port leaves its item, on the grid at the middle of a cell.
function straightStart(c: Compound, port: PortEdge, item: CNode): Point {
  if (item.isGroup && endpointBelow(port.inner, c.edges[port.e]!, port.out))
    return belowEnd(c, port, item);
  const end = sideEnd(item, port.side);
  return c.hooks ? cellMiddle(c.hooks, port.side, end) : end;
}

// The route of a port on a side the flow does not run through: straight from its item to the border.
function straightPortRoute(c: Compound, f: Fit, port: PortEdge): void {
  setStraightRoute(f, port, straightStart(c, port, c.nodes[port.inner]!));
}

// Puts the level's items, edges and ports in its box.
function placeInBox(c: Compound, f: Fit): void {
  const { nodes, edges } = c;
  const { level, lnodes, ledges } = f;
  level.items.forEach((item, i) => {
    nodes[item]!.x = tx(f, lnodes[i]!.x, lnodes[i]!.y);
    nodes[item]!.y = ty(f, lnodes[i]!.x, lnodes[i]!.y);
  });
  level.edges.forEach((le, i) => {
    const edge = ledges[i]!;
    level.routes.set(le.e, convert(f, edge.points));
    const e = edges[le.e]!;
    if (e.labelW > 0) {
      e.labelX = tx(f, edge.labelX, edge.labelY);
      e.labelY = ty(f, edge.labelX, edge.labelY);
    }
  });
  let k = level.edges.length;
  level.ports.forEach((port, i) => {
    if (f.dummies[i]! >= 0) dummyPortRoute(f, port, ledges[k++]!.points);
    else straightPortRoute(c, f, port);
  });
}

// Lays out children first so their sizes are known.
function fitLevels(c: Compound): void {
  for (let q = c.order.length - 1; q >= 0; q--) {
    const f = fitLevel(c, c.order[q]!);
    placeInBox(c, f);
    if (f.group) {
      f.group.w = f.boxW;
      f.group.h = f.boxH;
    } else {
      c.total = { width: f.boxW, height: f.boxH };
    }
  }
}

// Moves each group's items by the group's own position, outermost first.
function offsetLevels(c: Compound): void {
  const { nodes, levelOf } = c;
  for (const level of c.order) {
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
}

// The levels from the one holding `item` up to `level`, nearest first, that an edge leaves or
// enters `level` through.
function levelsAbove(c: Compound, level: Level, item: number): Level[] {
  const { nodes, levelOf } = c;
  const up: Level[] = [];
  for (let at = item; at !== level.id && nodes[at]!.parent !== level.id; at = nodes[at]!.parent) {
    up.push(levelOf.get(nodes[at]!.parent)!);
  }
  return up;
}

// An edge of `level` as one route in the plane: out of its source's groups, across the level, and
// into its target's.
function routeInPlane(c: Compound, level: Level, ei: number): void {
  const e = c.edges[ei]!;
  const route: number[] = [];
  for (const lv of levelsAbove(c, level, e.src))
    appendRoute(route, lv.portOf.get(ei * 2)!.route, lv.x, lv.y);
  const own = level.portOf.get(ei * 2 + +(e.src === level.id));
  appendRoute(route, level.routes.get(ei) ?? own!.route, level.x, level.y);
  const inward = levelsAbove(c, level, e.dst);
  for (let i = inward.length - 1; i >= 0; i--)
    appendRoute(route, inward[i]!.portOf.get(ei * 2 + 1)!.route, inward[i]!.x, inward[i]!.y);
  e.route = route;
  if (e.labelW > 0) {
    e.labelX += level.x;
    e.labelY += level.y;
  }
}

// Lays every level out and puts the results in the plane. An edge between a group and its own
// member runs only through its ports: from the group's border inwards, level by level (outermost
// first in `order`), or outwards to it (#415).
export function place(c: Compound): void {
  rankParents(c);
  fitLevels(c);
  offsetLevels(c);
  for (const level of c.order)
    for (const le of [...level.edges, ...level.own]) routeInPlane(c, level, le.e);
}

// Where, in the group's box, the route of `port` goes on past the straight run out of the port,
// as an offset along the flow's cross axis, or NaN where there is no such turn.
function hintOf(c: Compound, level: Level, port: PortEdge): number {
  const box = c.nodes[level.id]!;
  const vertical = isVertical(level);
  // Skip the straight run out of the port to find where the edge turns.
  const route = c.edges[port.e]!.route;
  const bx = level.x + port.px;
  const by = level.y + port.py;
  let at = -1;
  for (let k = 0; k < route.length && (at < 0 || port.out); k += 3)
    if (Math.abs(route[k]! - bx) < 0.01 && Math.abs(route[k + 1]! - by) < 0.01) at = k;
  if (at < 0) return NaN;
  const a = vertical ? 0 : 1;
  const step = port.out ? 3 : -3;
  let next = at + step;
  while (next >= 0 && next < route.length && Math.abs(route[next + a]! - route[at + a]!) < IN_LINE)
    next += step;
  if (next < 0 || next >= route.length) return NaN;
  return route[next + a]! - (vertical ? box.x - box.w / 2 : box.y - box.h / 2);
}

// Sets the hints of the ports on the far side of `level`'s group, and whether two of them are out
// of order against the order they are in.
function hintLevel(c: Compound, level: Level): boolean {
  const vertical = isVertical(level);
  const end = opposite(startSide(level.dir));
  const seen: number[][] = [];
  for (const port of level.ports) {
    if (port.side !== end) continue;
    const hint = hintOf(c, level, port);
    if (Number.isNaN(hint)) continue;
    port.hint = hint;
    seen.push([vertical ? port.px : port.py, hint]);
  }
  seen.sort((p, q) => p[0]! - q[0]!);
  let unordered = false;
  for (let i = 1; i < seen.length; i++) if (seen[i - 1]![1]! > seen[i]![1]!) unordered = true;
  return unordered;
}

// Sets the hints of every group's far ports from the routes; true where some are out of order.
export function hintPorts(c: Compound): boolean {
  let again = false;
  for (const level of c.order) {
    if (level.id < 0) continue;
    if (hintLevel(c, level)) again = true;
  }
  return again;
}
