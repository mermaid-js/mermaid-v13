// Changes from Pele: split out of `compound.ts` (D596): the edges between a group and its own member (#198, #415), the band their labels sit in,
// and the helpers that place them. In px, such an edge ends clear of the other lines ending on the member's top
// (`freeAcross`, mermaid-js/mermaid#8824). Otherwise the algorithm is unchanged.
// cspell:ignore lnode lnodes cnode
//
import type { CEdge, CNode } from './compound.ts';
import { Side, type Compound, type Level } from './compound-state.ts';
import type { GridHooks } from './grid.ts';
import type { LNode } from './layered.ts';

// The left end of a run `w` long from `start` on, `gap` clear of every line at `xs`.
export function clearOf(start: number, w: number, xs: readonly number[], gap: number): number {
  let at = start;
  for (const x of [...xs].sort((p, q) => p - q)) if (x > at - gap && x < at + w + gap) at = x + gap;
  return at;
}

// Where the routes run straight down (or up) through the rows from `y0` to `y1`.
export function verticalsAcross(edges: CEdge[], y0: number, y1: number): number[] {
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
export function endpointBelow(item: number, e: CEdge, out: boolean): boolean {
  return (out ? e.src : e.dst) !== item;
}

// An edge between a group and one of its own members that runs down from the group's top into
// the member's top (#198): on the grid every one, in px the labelled ones (an unlabelled one is
// laid out through a port on the group's border, #415).
export interface OwnEdge {
  ei: number;
  group: number;
  member: number;
  // Whether the group is the edge's source.
  fromGroup: boolean;
  // In px, the line's across-flow offset from its member's middle: a member's lines spread.
  offset: number;
}

// The edges between a group and its own member (`stray`), in that order.
export function ownEdgesOf(
  stray: readonly number[],
  edges: readonly CEdge[],
  depth: Int32Array,
  hooks: GridHooks | undefined,
  pitch: number
): OwnEdge[] {
  const out: OwnEdge[] = [];
  const byMember = new Map<number, OwnEdge[]>();
  for (const ei of stray) {
    const e = edges[ei]!;
    const fromGroup = depth[e.src]! < depth[e.dst]!;
    const [group, member] = fromGroup ? [e.src, e.dst] : [e.dst, e.src];
    const own: OwnEdge = { ei, group, member, fromGroup, offset: 0 };
    out.push(own);
    if (!hooks) {
      let lines = byMember.get(member);
      if (!lines) byMember.set(member, (lines = []));
      lines.push(own);
    }
  }
  for (const lines of byMember.values())
    lines.forEach((own, k) => (own.offset = (k - (lines.length - 1) / 2) * pitch));
  return out;
}

// What the band sizing of a level reads: its laid-out items, and `boxX`, an item's x in the
// level's box (before the box's own offset).
export interface BandLevel {
  nodes: readonly CNode[];
  edges: readonly CEdge[];
  level: Level;
  lnodes: readonly LNode[];
  boxX: (ln: LNode) => number;
  hooks: GridHooks | undefined;
}

// The height a band of `labelled` edges' labels, one a row `gapY` apart from `top` below the
// group's top, adds below the group's top padding.
export function ownBandHeight(
  labelled: readonly CEdge[],
  top: number,
  gapY: number,
  padTop: number
): number {
  let height = 0;
  for (const e of labelled) height += e.labelH + gapY;
  return Math.max(0, top + height - padTop);
}

// The rightmost x in the box where a line of `own` may land on its member's top (`freeTop` on
// the grid).
export function rightmostOwnLine(
  { nodes, level, lnodes, boxX, hooks }: BandLevel,
  own: OwnEdge[]
): number {
  let rightmost = -Infinity;
  for (const { member: m, offset } of own) {
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
    const lineX = hooks ? mid + half - hooks.ownLineInset(nodes[m]!.w) : mid + offset;
    rightmost = Math.max(rightmost, lineX);
  }
  return rightmost;
}

// Where the lines into the level's members through its top border cross the band.
export function topBorderCrossings(
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

// Sets up the own-member edges of `c`: by group, with the gaps their labels keep. Edges between a
// group and its own member (#198), by group. Each runs down from the group's top into the
// member's top; their labels sit in a band of rows at the top of the group, below its title and
// above its content, right of every such line, one label a row. On the grid every such edge runs
// so; in px the labelled ones do (an unlabelled one is in `Level.own`, #415).
export function setUpOwnEdges(c: Compound): void {
  const { M, hooks } = c;
  c.ownEdges = ownEdgesOf(c.stray, c.edges, c.depth, hooks, M.portPitch);
  for (const own of c.ownEdges) {
    let list = c.ownByGroup.get(own.group);
    if (!list) c.ownByGroup.set(own.group, (list = []));
    list.push(own);
  }
  c.ownGapX = hooks ? hooks.cell / 2 : Math.max(M.endLabelAcross, M.portPitch / 2);
  c.ownGapY = hooks ? 0 : M.loopGap;
}

// Where the band starts below the group's top: on the grid the title is on the border row.
export function bandTop(c: Compound, g: CNode): number {
  return c.hooks ? c.hooks.cell : g.padTop;
}

// Where a line that wants to end at `want` on the top of `member` ends, so that it is not drawn
// on another line ending there (mermaid-js/mermaid#8824): the first place `pitch` clear of every
// x in `taken`, in steps of `pitch` from `want` to the right (the labels are on that side), else
// to the left, no nearer a corner than half a pitch. With no such place it stays at `want`.
function freeAcross(
  want: number,
  taken: readonly number[],
  pitch: number,
  member: Pick<CNode, 'x' | 'w'>
): number {
  for (const step of [pitch, -pitch]) {
    let x = want;
    while (taken.some((t) => Math.abs(t - x) < pitch - 1e-6)) x += step;
    if (2 * Math.abs(x - member.x) <= member.w - pitch) return x;
  }
  return want;
}

// The routes of the own-member edges: between a group and its own member, either way, down from
// the group's top to the member's top. On the grid it starts on the group's top border row (half
// a cell inside it, so the route stays in the drawing), in a cell of the member's side no other
// edge ends in (D140); clearing the way is the repair router's (#45, D78). In px it ends on the
// member's top where no other line ends (`freeAcross`), and starts on the top border, or below the
// title where the title is in its way.
export function placeOwnEdges(c: Compound): void {
  const { nodes, edges, hooks, M } = c;
  for (const { ei, group: g, member: m, fromGroup, offset } of c.ownEdges) {
    const e = edges[ei]!;
    const group = nodes[g]!;
    const member = nodes[m]!;
    const top = member.y - member.h / 2;
    let x: number;
    let frame: number;
    if (hooks) {
      x = hooks.ownTop(member, edges, M.portPitch);
      frame = group.y - group.h / 2 + hooks.cell;
    } else {
      // Where the other edges of the member, the own ones placed before this one too, end on its top.
      const taken = edges.flatMap((o, oi) => {
        // The end on the member: NaN, so no end, for an edge of another node.
        let k = o.src === m ? 0 : NaN;
        if (o.dst === m) k = o.route.length - 3;
        return oi !== ei && Math.abs(o.route[k + 1]! - top) < 1e-6 ? [o.route[k]!] : [];
      });
      x = freeAcross(member.x + offset, taken, M.portPitch, member);
      frame = group.y - group.h / 2;
      const title = Math.max(0, group.minW - 2 * group.padX) / 2;
      // The title's middle: the group's, or `title` in from the padding of the title's side.
      const mid = group.x + group.titleSide * (group.w / 2 - group.padX - title);
      if (!group.titleLow && title > 0 && Math.abs(x - mid) < title + M.endLabelAcross)
        frame += group.padTop;
    }
    e.route = fromGroup ? [x, frame, 0, x, top, 0] : [x, top, 0, x, frame, 0];
  }
}

// The labels of the own-member edges: one a row in the band below the group's title, right of all
// its such lines (#198). On the border row a label would cover the group's title and corners.
export function placeOwnLabels(c: Compound): void {
  const { nodes, edges, ownGapX, ownGapY } = c;
  for (const [g, own] of c.ownByGroup) {
    const group = nodes[g]!;
    let rightmostLine = -Infinity;
    for (const o of own) rightmostLine = Math.max(rightmostLine, edges[o.ei]!.route[0]!);
    let y = group.y - group.h / 2 + bandTop(c, group);
    for (const { ei } of own) {
      const e = edges[ei]!;
      if (e.labelW <= 0) continue;
      const crossing = verticalsAcross(edges, y, y + e.labelH);
      e.labelX = clearOf(rightmostLine + ownGapX, e.labelW, crossing, ownGapX) + e.labelW / 2;
      e.labelY = y + e.labelH / 2;
      y += e.labelH + ownGapY;
    }
  }
}
