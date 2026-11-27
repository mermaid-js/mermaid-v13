// Grid placement for `compass` (D326), ported from Pele (https://github.com/obsidianmd/pele,
// src/diagrams/architecture/layout.ts, `placeOnGrid`, MIT, (c) 2026 kepano; see
// THIRD_PARTY_NOTICES). Every node takes a cell, an edge `a:R -- L:b` puts b in the cell to the
// right of a, and a group is a solid rectangle of cells, so a group never encloses a node that is
// not in it. Each container (every group, innermost first, then the diagram) is laid out on its
// own, and a finished group is placed in its parent as one block. Integer arithmetic only: no
// randomness, no clock.
//
// Changed from Pele: plain index input (the caller orders groups parents first and resolves
// `in`), sides as indexes, edge ends that are groups (a flowchart edge to a subgraph: the link
// places the group's block), and Pele's closures split into methods of one class. The steps and
// their order are Pele's, with two additions (D720): a node a later placed link wants on another
// side moves there when every link into it still holds, and two members of a group that one
// outside node reaches through two sides are linked to each other the way those sides ask.

export interface GridInput {
  /** Number of nodes. */
  readonly nodes: number;
  /** Each node's group, -1 for none. */
  readonly nodeParent: Int32Array;
  /** Each group's parent group, -1 for none, always earlier in the list. */
  readonly groupParent: Int32Array;
  /** Edge ends as items: nodes 0..N-1, then groups N..N+G-1; sides as indexes (`LEFT`…). */
  readonly edges: readonly GridEdge[];
  /** Pairs of nodes in order, `row` placing each to the right of the one before. */
  readonly hints: readonly { row: boolean; a: number; b: number }[];
}

export interface GridEdge {
  readonly a: number;
  readonly b: number;
  readonly sa: number;
  readonly sb: number;
}

export interface Grid {
  // Cell of each node, in the order of the nodes passed in.
  col: Int32Array;
  row: Int32Array;
  // Cell rectangle of each group. A group with nothing in it takes one cell.
  groupCol: Int32Array;
  groupRow: Int32Array;
  groupCols: Int32Array;
  groupRows: Int32Array;
  groupEmpty: Uint8Array;
}

/** Side indexes: left, right, top, bottom. */
export const LEFT = 0;
export const RIGHT = 1;
export const TOP = 2;
export const BOTTOM = 3;
export const DX = [-1, 1, 0, 0] as const;
export const DY = [0, 0, -1, 1] as const;

// Blocks up to this many cells are found through the cell map; larger ones are compared one by one.
const SMALL = 64;
const OFFSET = 2 ** 25;
const SPAN = 2 ** 26;

type Lists = (number[] | undefined)[];

// A block's size (each under 2^24 cells) and slide direction (one of four) as one safe integer.
const SIZE = 2 ** 24;
const slideKey = (rw: number, rh: number, sx: number, sy: number): number =>
  ((rw * SIZE + rh) * 3 + sx + 1) * 3 + sy + 1;

class Placer {
  readonly N: number;
  readonly G: number;
  readonly root: number;
  // Items are nodes (0..N-1) then groups (N..N+G-1). Containers are groups (0..G-1) then the root.
  readonly parent: Int32Array;
  readonly depth: Int32Array;
  readonly kids: number[][] = [];
  // A link asks for one node to sit beside another. It belongs to the innermost container that
  // holds both ends, and there it relates the two children of that container the ends are in.
  readonly linkA: number[] = [];
  readonly linkB: number[] = [];
  readonly sideA: number[] = [];
  readonly sideB: number[] = [];
  readonly itemA: number[] = [];
  readonly itemB: number[] = [];
  readonly hintLinks: Lists;
  readonly edgeLinks: Lists;
  // Position of each item in its container, and its size in cells.
  readonly x: Int32Array;
  readonly y: Int32Array;
  readonly w: Int32Array;
  readonly h: Int32Array;
  readonly placed: Uint8Array;
  readonly order: number[] = [];
  readonly cells = new Map<number, number>();
  readonly large: number[] = [];
  // Slide memo: by the block's corner (packed as the cell map's keys), then by its size and the
  // direction it slides (packed as `slideKey`).
  readonly reach = new Map<number, Map<number, number>>();
  first = 0;
  // Links below this index are `align` hints, which are kept as written.
  hints = 0;
  ax = 0;
  ay = 0;

  constructor(input: GridInput) {
    const N = (this.N = input.nodes);
    const G = (this.G = input.groupParent.length);
    this.root = G;
    this.parent = new Int32Array(N + G).fill(G);
    this.depth = new Int32Array(G + 1);
    this.hintLinks = new Array<number[] | undefined>(N + G);
    this.edgeLinks = new Array<number[] | undefined>(N + G);
    this.x = new Int32Array(N + G);
    this.y = new Int32Array(N + G);
    this.w = new Int32Array(N + G).fill(1);
    this.h = new Int32Array(N + G).fill(1);
    this.placed = new Uint8Array(N + G);
    for (let c = 0; c <= G; c++) this.kids.push([]);
    for (let g = 0; g < G; g++) {
      const p = input.groupParent[g]!;
      if (p >= 0 && p !== g) {
        this.parent[N + g] = p;
        this.depth[g] = this.depth[p]! + 1;
      } else {
        this.depth[g] = 1;
      }
    }
    for (let i = 0; i < N; i++) {
      const p = input.nodeParent[i]!;
      if (p >= 0) this.parent[i] = p;
      this.kids[this.parent[i]!]!.push(i);
    }
    for (let g = 0; g < G; g++) this.kids[this.parent[N + g]!]!.push(N + g);
  }

  /** The innermost container holding `a` and `b`, and the two of its children they are in. */
  meet(a: number, b: number): [number, number, number] {
    const { N, parent, depth } = this;
    let ia = a;
    let ib = b;
    let ca = parent[a]!;
    let cb = parent[b]!;
    while (ca !== cb) {
      if (depth[ca]! >= depth[cb]!) {
        ia = N + ca;
        ca = parent[ia]!;
      } else {
        ib = N + cb;
        cb = parent[ib]!;
      }
    }
    return [ia, ib, ca];
  }

  /** Whether item `i` is inside container `c`. */
  inside(i: number, c: number): boolean {
    let p = this.parent[i]!;
    while (p !== c && p !== this.root) p = this.parent[this.N + p]!;
    return p === c;
  }

  addLink(a: number, b: number, sa: number, sb: number, lists: Lists): void {
    if (a === b) return;
    const [ia, ib] = this.meet(a, b);
    const k = this.linkA.length;
    this.linkA.push(a);
    this.linkB.push(b);
    this.sideA.push(sa);
    this.sideB.push(sb);
    this.itemA.push(ia);
    this.itemB.push(ib);
    (lists[ia] ??= []).push(k);
    (lists[ib] ??= []).push(k);
  }

  /** Sets `ax`, `ay` to `node`'s offset inside `item`, which holds it. */
  anchor(node: number, item: number): void {
    this.ax = 0;
    this.ay = 0;
    for (let cur = node; cur !== item; cur = this.N + this.parent[cur]!) {
      this.ax += this.x[cur]!;
      this.ay += this.y[cur]!;
    }
  }

  put(item: number, px: number, py: number): void {
    const { w, h } = this;
    this.x[item] = px;
    this.y[item] = py;
    this.placed[item] = 1;
    this.order.push(item);
    if (w[item]! * h[item]! > SMALL) {
      this.large.push(item);
      return;
    }
    for (let cy = py; cy < py + h[item]!; cy++) {
      for (let cx = px; cx < px + w[item]!; cx++)
        this.cells.set((cx + OFFSET) * SPAN + cy + OFFSET, item);
    }
  }

  overlaps(item: number, rx: number, ry: number, rw: number, rh: number): boolean {
    const { x, y, w, h } = this;
    return (
      x[item]! < rx + rw &&
      rx < x[item]! + w[item]! &&
      y[item]! < ry + rh &&
      ry < y[item]! + h[item]!
    );
  }

  collide(rx: number, ry: number, rw: number, rh: number): number {
    if (rw * rh > SMALL) {
      for (let i = this.first; i < this.order.length; i++)
        if (this.overlaps(this.order[i]!, rx, ry, rw, rh)) return this.order[i]!;
      return -1;
    }
    for (let cy = ry; cy < ry + rh; cy++) {
      for (let cx = rx; cx < rx + rw; cx++) {
        const hit = this.cells.get((cx + OFFSET) * SPAN + cy + OFFSET);
        if (hit !== undefined) return hit;
      }
    }
    for (const item of this.large) if (this.overlaps(item, rx, ry, rw, rh)) return item;
    return -1;
  }

  // How far a block must slide along (sx, sy) to be clear. Each step jumps past what it hit, and
  // the result is kept, because a later block starting from the same place cannot stop sooner.
  slide(rx: number, ry: number, rw: number, rh: number, sx: number, sy: number): number {
    const corner = (rx + OFFSET) * SPAN + ry + OFFSET;
    let memo = this.reach.get(corner);
    if (!memo) this.reach.set(corner, (memo = new Map<number, number>()));
    const key = slideKey(rw, rh, sx, sy);
    let k = memo.get(key) ?? 0;
    for (;;) {
      const hit = this.collide(rx + k * sx, ry + k * sy, rw, rh);
      if (hit < 0) break;
      // Jump past what it hit.
      if (sx > 0) k = this.x[hit]! + this.w[hit]! - rx;
      else if (sx < 0) k = rx + rw - this.x[hit]!;
      else if (sy > 0) k = this.y[hit]! + this.h[hit]! - ry;
      else k = ry + rh - this.y[hit]!;
    }
    memo.set(key, k);
    return k;
  }

  follow(from: number, k: number): void {
    const forward = this.itemA[k] === from;
    const to = forward ? this.itemB[k]! : this.itemA[k]!;
    if (this.placed[to]) return;
    const sp = forward ? this.sideA[k]! : this.sideB[k]!;
    const sq = forward ? this.sideB[k]! : this.sideA[k]!;
    this.anchor(forward ? this.linkA[k]! : this.linkB[k]!, from);
    const pax = this.ax;
    const pay = this.ay;
    this.anchor(forward ? this.linkB[k]! : this.linkA[k]!, to);
    let dx: number = DX[sp]!;
    let dy: number = DY[sp]!;
    let shiftX = 0;
    let shiftY = 0;
    const facing = DX[sp]! + DX[sq]! === 0 && DY[sp]! + DY[sq]! === 0;
    if (sp === sq) {
      // Like sides: the edge loops around, so the nodes stack across the direction it leaves in.
      dx = DX[sp] === 0 ? 1 : 0;
      dy = 1 - dx;
    } else if (!facing) {
      // A bend: one step along the side the edge leaves, one step back from the side it enters.
      shiftX = -DX[sq]!;
      shiftY = -DY[sq]!;
    }
    const { x, y, w, h } = this;
    let bx: number;
    let by: number;
    if (dx !== 0) {
      bx = dx > 0 ? x[from]! + w[from]! : x[from]! - w[to]!;
      by = y[from]! + pay + shiftY - this.ay;
    } else {
      by = dy > 0 ? y[from]! + h[from]! : y[from]! - h[to]!;
      bx = x[from]! + pax + shiftX - this.ax;
    }
    if (facing) {
      [bx, by] = this.lineUp(to, sp, sq, dx, bx, by);
    } else {
      const far = this.slide(bx, by, w[to]!, h[to]!, dx, dy);
      bx += dx * far;
      by += dy * far;
    }
    const [px, py] = k < this.hints ? [bx, by] : this.settle(to, from, k, bx, by);
    this.put(to, px, py);
  }

  /**
   * Where `to` goes when link `k` puts it at (`bx`, `by`) and other placed links into it ask for
   * another side of their far end (D720): moved by what they ask, then on that way to free cells.
   * It stays at (`bx`, `by`) when they already hold, or when no such place keeps every link. A
   * second link from `from` itself is drawn as a route of its own and does not move it.
   */
  settle(to: number, from: number, k: number, bx: number, by: number): [number, number] {
    const asked = this.asked(to, from, k, bx, by);
    if (!asked) return [bx, by];
    const [nx, ny] = asked;
    const sx = ny === 0 ? Math.sign(nx) : 0;
    const sy = Math.sign(ny);
    const far = this.slide(bx + nx, by + ny, this.w[to]!, this.h[to]!, sx, sy);
    const cx = bx + nx + sx * far;
    const cy = by + ny + sy * far;
    const fails = (j: number): boolean => !!this.need(j, to, cx, cy, j === k ? -1 : from);
    return (this.edgeLinks[to] ?? []).some(fails) ? [bx, by] : [cx, cy];
  }

  /**
   * The move the placed links into `to` other than `k` ask for when it is put at (`bx`, `by`):
   * the furthest each way. Undefined when none asks, or when two ask for opposite ways.
   */
  asked(to: number, from: number, k: number, bx: number, by: number): [number, number] | undefined {
    let nx = 0;
    let ny = 0;
    for (const j of this.edgeLinks[to] ?? []) {
      const need = j === k ? undefined : this.need(j, to, bx, by, from);
      if (!need) continue;
      if (need[0] * nx < 0 || need[1] * ny < 0) return undefined;
      nx = further(need[0], nx);
      ny = further(need[1], ny);
    }
    return nx === 0 && ny === 0 ? undefined : [nx, ny];
  }

  /**
   * How far `to`, put at (`px`, `py`), must move for link `j` to hold: its end beyond the side the
   * far end names, and the far end beyond its own side. Undefined when it holds, when the far end
   * is not placed yet or is `skip`, and for like sides, which never hold.
   */
  need(j: number, to: number, px: number, py: number, skip: number): [number, number] | undefined {
    const toIsB = this.itemB[j] === to;
    const other = toIsB ? this.itemA[j]! : this.itemB[j]!;
    const so = toIsB ? this.sideA[j]! : this.sideB[j]!;
    const st = toIsB ? this.sideB[j]! : this.sideA[j]!;
    if (other === to || other === skip || !this.placed[other] || so === st) return undefined;
    this.anchor(toIsB ? this.linkA[j]! : this.linkB[j]!, other);
    const o: [number, number] = [this.x[other]! + this.ax, this.y[other]! + this.ay];
    this.anchor(toIsB ? this.linkB[j]! : this.linkA[j]!, to);
    return shortfall(o, [px + this.ax, py + this.ay], so, st);
  }

  /**
   * Where a node reached through facing sides goes: in line with the middle of the placed nodes
   * that reach it through the same pair of sides, then moved sideways to the nearer free place.
   */
  lineUp(to: number, sp: number, sq: number, dx: number, x0: number, y0: number): [number, number] {
    let bx = x0;
    let by = y0;
    // When several placed nodes reach this one through the same pair of sides, line it up
    // with the middle one, not with whichever happened to be visited first.
    const list = this.edgeLinks[to];
    if (list !== undefined && list.length > 1) {
      const wanted: number[] = [];
      for (const j of list) {
        const at = this.wantedAt(j, to, sp, sq, dx);
        if (at !== undefined) wanted.push(at);
      }
      if (wanted.length > 1) {
        wanted.sort((p, q) => p - q);
        if (dx !== 0) by = wanted[(wanted.length - 1) >> 1]!;
        else bx = wanted[(wanted.length - 1) >> 1]!;
      }
    }
    // Taken: move sideways, to whichever side is nearer, so the edge can still leave straight.
    const { w, h } = this;
    const px = dx === 0 ? 1 : 0;
    const py = 1 - px;
    const forth = this.slide(bx, by, w[to]!, h[to]!, px, py);
    const back = forth === 0 ? 0 : this.slide(bx, by, w[to]!, h[to]!, -px, -py);
    const near = forth <= back ? forth : -back;
    return [bx + px * near, by + py * near];
  }

  /** Where link `j` wants `to` across the flow, when its other end is placed on the same sides. */
  wantedAt(j: number, to: number, sp: number, sq: number, dx: number): number | undefined {
    const toIsB = this.itemB[j] === to;
    const other = toIsB ? this.itemA[j]! : this.itemB[j]!;
    if (
      !this.placed[other] ||
      (toIsB ? this.sideA[j] : this.sideB[j]) !== sp ||
      (toIsB ? this.sideB[j] : this.sideA[j]) !== sq
    )
      return undefined;
    this.anchor(toIsB ? this.linkA[j]! : this.linkB[j]!, other);
    const at = dx !== 0 ? this.y[other]! + this.ay : this.x[other]! + this.ax;
    this.anchor(toIsB ? this.linkB[j]! : this.linkA[j]!, to);
    return at - (dx !== 0 ? this.ay : this.ax);
  }

  /** Places one connected part from `start`: hints as soon as a node is placed, then edges. */
  grow(start: number): void {
    const { order } = this;
    this.cells.clear();
    this.large.length = 0;
    this.reach.clear();
    this.put(start, 0, 0);
    // Declared alignments are followed as soon as a node is placed, ahead of any edge.
    let hintAt = this.first;
    let edgeAt = this.first;
    let linkAt = 0;
    for (;;) {
      if (hintAt < order.length) {
        const from = order[hintAt++]!;
        for (const k of this.hintLinks[from] ?? []) this.follow(from, k);
        continue;
      }
      if (edgeAt >= order.length) break;
      const list = this.edgeLinks[order[edgeAt]!];
      if (list === undefined || linkAt >= list.length) {
        edgeAt++;
        linkAt = 0;
        continue;
      }
      this.follow(order[edgeAt]!, list[linkAt++]!);
    }
  }

  layout(c: number): void {
    const items = this.kids[c]!;
    if (items.length === 0) return;
    this.order.length = 0;
    const starts: number[] = [];
    for (const start of items) {
      if (this.placed[start]) continue;
      this.first = this.order.length;
      starts.push(this.first);
      this.grow(start);
    }
    starts.push(this.order.length);
    const [width, height] = this.pack(starts);
    if (c < this.G) {
      this.w[this.N + c] = width;
      this.h[this.N + c] = height;
    }
  }

  // Unconnected parts go side by side, wrapping into rows that keep the whole roughly square.
  pack(starts: number[]): [number, number] {
    const { order, x, y, w, h } = this;
    const count = starts.length - 1;
    const minX = new Array<number>(count);
    const minY = new Array<number>(count);
    const partW = new Array<number>(count);
    const partH = new Array<number>(count);
    let area = 0;
    let widest = 0;
    for (let p = 0; p < count; p++) {
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (let i = starts[p]!; i < starts[p + 1]!; i++) {
        const item = order[i]!;
        x0 = Math.min(x0, x[item]!);
        y0 = Math.min(y0, y[item]!);
        x1 = Math.max(x1, x[item]! + w[item]!);
        y1 = Math.max(y1, y[item]! + h[item]!);
      }
      minX[p] = x0;
      minY[p] = y0;
      partW[p] = x1 - x0;
      partH[p] = y1 - y0;
      area += (x1 - x0) * (y1 - y0);
      widest = Math.max(widest, x1 - x0);
    }
    const limit = Math.max(widest, Math.ceil(Math.sqrt(area * 2)));
    let cx = 0;
    let cy = 0;
    let shelf = 0;
    let width = 0;
    for (let p = 0; p < count; p++) {
      if (cx > 0 && cx + partW[p]! > limit) {
        cy += shelf;
        cx = 0;
        shelf = 0;
      }
      for (let i = starts[p]!; i < starts[p + 1]!; i++) {
        const it = order[i]!;
        x[it] = x[it]! + cx - minX[p]!;
        y[it] = y[it]! + cy - minY[p]!;
      }
      cx += partW[p]!;
      shelf = Math.max(shelf, partH[p]!);
      width = Math.max(width, cx);
    }
    return [width, cy + shelf];
  }

  result(): Grid {
    const { N, G, root, parent, x, y } = this;
    const groupCol = new Int32Array(G);
    const groupRow = new Int32Array(G);
    const groupEmpty = new Uint8Array(G);
    for (let g = 0; g < G; g++) {
      const p = parent[N + g]!;
      groupCol[g] = x[N + g]! + (p === root ? 0 : groupCol[p]!);
      groupRow[g] = y[N + g]! + (p === root ? 0 : groupRow[p]!);
      if (this.kids[g]!.length === 0) groupEmpty[g] = 1;
    }
    const col = new Int32Array(N);
    const row = new Int32Array(N);
    for (let i = 0; i < N; i++) {
      const p = parent[i]!;
      col[i] = x[i]! + (p === root ? 0 : groupCol[p]!);
      row[i] = y[i]! + (p === root ? 0 : groupRow[p]!);
    }
    return {
      col,
      row,
      groupCol,
      groupRow,
      groupCols: this.w.slice(N),
      groupRows: this.h.slice(N),
      groupEmpty,
    };
  }
}

/**
 * The cell offset `follow` gives the end with side `sq` from the end with side `sp`: a step out of
 * `sp`, and for a bend a step back from `sq`. None for like sides, which loop.
 */
function offset(sp: number, sq: number): [number, number] | undefined {
  if (sp === sq) return undefined;
  if (DX[sp]! + DX[sq]! === 0 && DY[sp]! + DY[sq]! === 0) return [DX[sp]!, DY[sp]!];
  return [DX[sp]! - DX[sq]!, DY[sp]! - DY[sq]!];
}

/** `a` or `b`, whichever is further from 0; `b` on a tie. */
const further = (a: number, b: number): number => (Math.abs(a) > Math.abs(b) ? a : b);

/**
 * How far point `t` must move to lie at least one cell out of side `so` from point `o`, and one
 * cell back out of side `st` from itself; undefined when it already does.
 */
function shortfall(
  o: readonly [number, number],
  t: readonly [number, number],
  so: number,
  st: number
): [number, number] | undefined {
  const [ox, oy] = o;
  const [tx, ty] = t;
  let mx = 0;
  let my = 0;
  for (const [ux, uy] of [
    [DX[so]!, DY[so]!],
    [-DX[st]!, -DY[st]!],
  ] as const) {
    if (ux !== 0 && (tx - ox) * ux < 1) mx = ox + ux - tx;
    if (uy !== 0 && (ty - oy) * uy < 1) my = oy + uy - ty;
  }
  return mx === 0 && my === 0 ? undefined : [mx, my];
}

/**
 * The sides of a link that moves one cell `dx`, `dy` (signs): out across when it moves across,
 * else up or down; in from above or below when it moves up or down, else across. A diagonal is a
 * bend, as `follow` reads one.
 */
function stepSides(dx: number, dy: number): [number, number] {
  const sa = dx !== 0 ? [LEFT, RIGHT][(dx + 1) >> 1]! : [TOP, BOTTOM][(dy + 1) >> 1]!;
  const sb = dy !== 0 ? [BOTTOM, TOP][(dy + 1) >> 1]! : [RIGHT, LEFT][(dx + 1) >> 1]!;
  return [sa, sb];
}

/**
 * A group is placed whole, so of several links from one item outside it to items inside it, only
 * the first one followed used to decide where its members sit (D326's known gap). Two ends that
 * one outside item reaches through two sides are now linked to each other, in the places those
 * sides ask for, after every edge, so the block is built the way both sides can hold (D720).
 */
function addTwins(placer: Placer, edges: readonly GridEdge[]): void {
  // By outside item: the last end reached from it, and that end's offset from it.
  const last = new Map<number, [number, number, number]>();
  for (const e of edges) {
    addTwin(placer, last, e.a, e.sa, e.b, e.sb);
    addTwin(placer, last, e.b, e.sb, e.a, e.sa);
  }
}

/** `addTwins` for one end of an edge: `end`, reached from `o` through sides `so` and `se`. */
function addTwin(
  placer: Placer,
  last: Map<number, [number, number, number]>,
  o: number,
  so: number,
  end: number,
  se: number
): void {
  const off = offset(so, se);
  if (!off) return;
  const prev = last.get(o);
  last.set(o, [end, off[0], off[1]]);
  if (!prev || prev[0] === end || placer.inside(o, placer.meet(prev[0], end)[2])) return;
  const dx = Math.sign(off[0] - prev[1]);
  const dy = Math.sign(off[1] - prev[2]);
  if (dx === 0 && dy === 0) return;
  const [sa, sb] = stepSides(dx, dy);
  placer.addLink(prev[0], end, sa, sb, placer.edgeLinks);
}

export function placeOnGrid(input: GridInput): Grid {
  const placer = new Placer(input);
  for (const hint of input.hints) {
    placer.addLink(
      hint.a,
      hint.b,
      hint.row ? RIGHT : BOTTOM,
      hint.row ? LEFT : TOP,
      placer.hintLinks
    );
  }
  placer.hints = placer.linkA.length;
  // An edge between two like sides says least about where its ends go, so those come last.
  for (const likeSides of [false, true]) {
    for (const edge of input.edges) {
      if ((edge.sa === edge.sb) !== likeSides) continue;
      placer.addLink(edge.a, edge.b, edge.sa, edge.sb, placer.edgeLinks);
    }
  }
  addTwins(placer, input.edges);
  for (let c = placer.G - 1; c >= 0; c--) placer.layout(c);
  placer.layout(placer.root);
  return placer.result();
}
