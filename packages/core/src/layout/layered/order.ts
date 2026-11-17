// Ported from Pele (https://github.com/obsidianmd/pele), src/layout/layered.ts at 3a2f075.
// Copyright (c) 2026 kepano. MIT License: see THIRD_PARTY_NOTICES in @mermaid-js/core.
// Changes from Pele: split out of `layered.ts`, and `reduceCrossings` is `searchOf`,
// `crossingCounter`, `sweep`, `transpose`, `explore` and `mirrored`. The algorithm is unchanged.
// cspell:ignore kepano lnode indeg
//
// The order of the nodes in each rank: where the search starts, and how it cuts down the crossings.
import { Kind, type Graph, type LNode } from './graph.ts';
import { copy, f64, i32, u8 } from './scratch.ts';

const MAX_SWEEPS = 24;

// Avoid the comparator overhead of built-in sort.
function sortByBary(
  list: Int32Array,
  count: number,
  bary: Float64Array,
  pos: Int32Array,
  right: boolean,
  spare: Int32Array
): void {
  const before = (a: number, b: number): boolean =>
    bary[a]! < bary[b]! ||
    (bary[a]! === bary[b]! && (right ? pos[a]! > pos[b]! : pos[a]! < pos[b]!));
  const RUN = 8;
  for (let s = 0; s < count; s += RUN) {
    for (let i = s + 1, end = Math.min(count, s + RUN); i < end; i++) {
      const item = list[i]!;
      let j = i - 1;
      while (j >= s && before(item, list[j]!)) {
        list[j + 1] = list[j]!;
        j--;
      }
      list[j + 1] = item;
    }
  }
  let from = list;
  let to = spare;
  for (let width = RUN; width < count; width *= 2) {
    for (let s = 0; s < count; s += 2 * width) {
      const mid = Math.min(count, s + width);
      const end = Math.min(count, s + 2 * width);
      let i = s;
      let j = mid;
      let k = s;
      while (i < mid && j < end) to[k++] = before(from[j]!, from[i]!) ? from[j++]! : from[i++]!;
      while (i < mid) to[k++] = from[i++]!;
      while (j < end) to[k++] = from[j++]!;
    }
    const t = from;
    from = to;
    to = t;
  }
  if (from !== list) for (let i = 0; i < count; i++) list[i] = from[i]!;
}

// Sorts `order[s..e)` by key, keeping the given order between equal keys (the sort is stable),
// and leaves a layer already in that order as it is. Does nothing and returns false for a layer
// of fewer than two nodes or with a NaN key. Exported for tests.
export function sortLayer(
  order: Int32Array,
  s: number,
  e: number,
  key: (v: number) => number
): boolean {
  if (e - s < 2) return false;
  let sorted = true;
  for (let i = s, last = -Infinity; i < e; i++) {
    const k = key(order[i]!);
    if (Number.isNaN(k)) return false;
    if (k < last) sorted = false;
    last = k;
  }
  if (!sorted)
    order.set(
      [...order.subarray(s, e)].sort((a, b) => key(a) - key(b)),
      s
    );
  return true;
}

// Keep groups contiguous, ordering each by its mean key. Exported for tests.
export function groupArranger(
  n: number,
  layerStart: Int32Array,
  order: Int32Array,
  pos: Int32Array,
  GRP: Int32Array | undefined,
  groupParent: Int32Array | undefined
): (r: number, key: Float64Array) => void {
  const groups = groupParent ? groupParent.length : 0;
  const depth = i32(groups);
  for (let gr = 0; gr < groups; gr++) for (let p = gr; p >= 0; p = groupParent![p]!) depth[gr]!++;
  const groupSum = f64(groups);
  const groupCount = i32(groups);
  const groupFirst = i32(groups);
  return (r: number, key: Float64Array): void => {
    const s = layerStart[r]!;
    const e = layerStart[r + 1]!;
    let odd = false;
    for (let i = s; i < e; i++) {
      for (let gr = GRP![order[i]!]!; gr >= 0; gr = groupParent![gr]!) {
        groupSum[gr] = 0;
        groupCount[gr] = 0;
      }
    }
    for (let i = s; i < e; i++) {
      const v = order[i]!;
      if (key[v]! - key[v]! !== 0) odd = true;
      for (let gr = GRP![v]!; gr >= 0; gr = groupParent![gr]!) {
        if (groupCount[gr]! === 0) groupFirst[gr] = i;
        groupSum[gr]! += key[v]!;
        groupCount[gr]!++;
      }
    }
    // Compare siblings in their nearest common group; group items use n + group ID.
    const value = (item: number): number =>
      item >= n ? groupSum[item - n]! / groupCount[item - n]! : key[item]!;
    const first = (item: number): number => (item >= n ? groupFirst[item - n]! : s + pos[item]!);
    const compare = (a: number, b: number): number => {
      let ia = a;
      let ib = b;
      let ca = GRP![a]!;
      let cb = GRP![b]!;
      let da = ca < 0 ? 0 : depth[ca]!;
      let db = cb < 0 ? 0 : depth[cb]!;
      for (; da > db; da--) {
        ia = n + ca;
        ca = groupParent![ca]!;
      }
      for (; db > da; db--) {
        ib = n + cb;
        cb = groupParent![cb]!;
      }
      while (ca !== cb) {
        ia = n + ca;
        ca = groupParent![ca]!;
        ib = n + cb;
        cb = groupParent![cb]!;
      }
      return value(ia) - value(ib) || first(ia) - first(ib);
    };
    // A row that is one wide, or already in the order the sort would give, is left as it is.
    // Non-finite keys always take the sort.
    let k = s + 1;
    while (k < e && compare(order[k - 1]!, order[k]!) < 0) k++;
    if (k < e || odd) order.set([...order.subarray(s, e)].sort(compare), s);
    for (let i = s; i < e; i++) pos[order[i]!] = i - s;
  };
}

// What the search for an order keeps: how crossings are counted, and what each sweep works in.
interface Search {
  nodes: LNode[];
  count: () => number;
  bary: Float64Array;
  moving: Int32Array;
  spare: Int32Array;
  arrange: (r: number, key: Float64Array) => void;
}

// Sorts the edges at `list[from..to)` by their offsets, if they are not all alike.
function byOffset(list: Int32Array, from: number, to: number, dx: Float64Array): boolean {
  for (let k = from + 1; k < to; k++) {
    if (dx[list[k]!]! === dx[list[from]!]!) continue;
    list.subarray(from, to).sort((a, b) => dx[a]! - dx[b]!);
    return true;
  }
  return false;
}

// The function that counts the crossings of the order `g` has now.
function crossingCounter(g: Graph, widest: number): () => number {
  const { n, EF, ET, EFD, ETD, maxRank, succStart, succE, predStart, predE, layerStart } = g;
  const { order, pos } = g;
  // With offsets, edges that reach one node at different offsets take separate places along it.
  const place = g.offsets ? i32(EF.length) : undefined;
  // Local offset indices and counts do not depend on node order.
  const placeIn = i32(place ? EF.length : 0);
  const places = i32(place ? n : 0);
  const leaving = place ? new Int32Array(succE) : succE;
  const mixed = u8(place ? n : 0);
  if (place) {
    const arriving = new Int32Array(predE);
    for (let v = 0; v < n; v++) {
      places[v] = 1;
      const sorted = byOffset(arriving, predStart[v]!, predStart[v + 1]!, ETD);
      for (let k = predStart[v]! + 1; sorted && k < predStart[v + 1]!; k++) {
        if (ETD[arriving[k]!]! !== ETD[arriving[k - 1]!]!) places[v]!++;
        placeIn[arriving[k]!] = places[v]! - 1;
      }
      if (byOffset(leaving, succStart[v]!, succStart[v + 1]!, EFD)) mixed[v] = 1;
    }
  }
  let size = 1;
  while (size < (place ? widest + EF.length : widest)) size <<= 1;
  const tree = i32(2 * size);
  const targets = i32(EF.length);

  // Gives the edges that arrive at rank `r + 1` their places along its nodes, and returns how
  // many places the rank has.
  const numberSouth = (r: number): number => {
    let next = 0;
    for (let i = layerStart[r + 1]!; i < layerStart[r + 2]!; i++) {
      const v = order[i]!;
      for (let k = predStart[v]!; k < predStart[v + 1]!; k++)
        place![predE[k]!] = next + placeIn[predE[k]!]!;
      next += places[v]!;
    }
    return next;
  };
  // Sorts the targets `t0..t` of the edges that leave node `v`.
  const sortTargets = (v: number, t0: number, t: number): void => {
    if (place && mixed[v]!) {
      const from = succStart[v]!;
      // Sort equal-offset edges by destination to avoid counting shared endpoints as crossings.
      for (let a = t0 + 1; a < t; a++) {
        const item = targets[a]!;
        const dx = EFD[leaving[from + a - t0]!]!;
        let b = a - 1;
        while (b >= t0 && EFD[leaving[from + b - t0]!]! === dx && targets[b]! > item) {
          targets[b + 1] = targets[b]!;
          b--;
        }
        targets[b + 1] = item;
      }
    } else if (t - t0 <= 12) {
      for (let a = t0 + 1; a < t; a++) {
        const item = targets[a]!;
        let b = a - 1;
        while (b >= t0 && targets[b]! > item) {
          targets[b + 1] = targets[b]!;
          b--;
        }
        targets[b + 1] = item;
      }
    } else {
      targets.subarray(t0, t).sort();
    }
  };
  // How many pairs of the first `t` targets are out of order, with `southLen` places to put them in.
  const inversions = (southLen: number, t: number): number => {
    let total = 0;
    let leaves = 1;
    while (leaves < southLen) leaves <<= 1;
    tree.fill(0, 0, 2 * leaves);
    for (let k = 0; k < t; k++) {
      let i = targets[k]! + leaves;
      tree[i]!++;
      while (i > 1) {
        if ((i & 1) === 0) total += tree[i + 1]!;
        i >>= 1;
        tree[i]!++;
      }
    }
    return total;
  };

  return (): number => {
    let total = 0;
    for (let r = 0; r < maxRank; r++) {
      const southLen = place ? numberSouth(r) : layerStart[r + 2]! - layerStart[r + 1]!;
      if (southLen < 2) continue;
      let t = 0;
      for (let i = layerStart[r]!; i < layerStart[r + 1]!; i++) {
        const v = order[i]!;
        const t0 = t;
        for (let k = succStart[v]!; k < succStart[v + 1]!; k++)
          targets[t++] = place ? place[leaving[k]!]! : pos[ET[succE[k]!]!]!;
        if (t - t0 >= 2) sortTargets(v, t0, t);
      }
      if (t >= 2) total += inversions(southLen, t);
    }
    return total;
  };
}

function searchOf(g: Graph, nodes: LNode[], widest: number): Search {
  const { n } = g;
  return {
    nodes,
    count: crossingCounter(g, widest),
    bary: f64(n),
    moving: i32(widest),
    spare: i32(widest),
    arrange: groupArranger(n, g.layerStart, g.order, g.pos, g.GRP, g.groupParent),
  };
}

function pinOf(g: Graph, nodes: LNode[], v: number): number {
  return v < g.real ? nodes[v]!.pin : 0;
}

// Sets `pos` from `order` in every rank.
export function settlePositions(g: Graph): void {
  const { maxRank, layerStart, order, pos } = g;
  for (let r = 0; r <= maxRank; r++)
    for (let i = layerStart[r]!; i < layerStart[r + 1]!; i++) pos[order[i]!] = i - layerStart[r]!;
}

// Gives every node of rank `r` its barycenter among the ends of its edges that lie `down` or up,
// and `moving` the ones that may move. Returns how many.
function rankBary(g: Graph, s: Search, r: number, down: boolean): number {
  const { real, W, EF, ET, EFD, ETD, layerStart, order, pos, offsets, GRP } = g;
  const { bary, moving } = s;
  const start = down ? g.predStart : g.succStart;
  const list = down ? g.predE : g.succE;
  const other = down ? EF : ET;
  const otherDx = down ? EFD : ETD;
  const first = layerStart[r]!;
  const last = layerStart[r + 1]!;
  let movable = 0;
  for (let i = first; i < last; i++) {
    const v = order[i]!;
    const pin = v < real ? s.nodes[v]!.pin : 0;
    if (pin !== 0) {
      bary[v] = pin * 1e9;
      moving[movable++] = v;
      continue;
    }
    const from = start[v]!;
    const to = start[v + 1]!;
    if (from === to) {
      if (GRP) {
        // Preserve relative position when there are no neighbours in the adjacent rank.
        const across = down
          ? layerStart[r]! - layerStart[r - 1]!
          : layerStart[r + 2]! - layerStart[r + 1]!;
        bary[v] = ((i - first) * across) / (last - first);
        continue;
      }
      bary[v] = -1;
      continue;
    }
    let sum = 0;
    for (let k = from; k < to; k++) {
      const u = other[list[k]!]!;
      sum += pos[u]!;
      if (offsets && W[u]! > 0) sum += otherDx[list[k]!]! / W[u]!;
    }
    bary[v] = sum / (to - from);
    moving[movable++] = v;
  }
  return movable;
}

function sweep(g: Graph, s: Search, down: boolean, biasRight: boolean): void {
  const { maxRank, layerStart, order, pos, fixed, GRP } = g;
  const { bary, moving, spare } = s;
  for (let step = 1; step <= maxRank; step++) {
    const r = down ? step : maxRank - step;
    if (fixed[r]!) continue;
    const movable = rankBary(g, s, r, down);
    if (GRP) {
      s.arrange(r, bary);
      continue;
    }
    if (movable < 2) continue;
    sortByBary(moving, movable, bary, pos, biasRight, spare);
    let k = 0;
    const first = layerStart[r]!;
    const last = layerStart[r + 1]!;
    for (let i = first; i < last; i++) if (bary[order[i]!]! !== -1) order[i] = moving[k++]!;
    for (let i = first; i < last; i++) pos[order[i]!] = i - first;
  }
}

// How many pairs of nodes in one rank are not in the order they were given.
function outOfOrder(g: Graph): number {
  const { real, maxRank, layerStart, order } = g;
  let total = 0;
  for (let r = 0; r <= maxRank; r++) {
    for (let i = layerStart[r]!; i < layerStart[r + 1]!; i++) {
      if (order[i]! >= real) continue;
      for (let j = i + 1; j < layerStart[r + 1]!; j++) if (order[j]! < order[i]!) total++;
    }
  }
  return total;
}

// Where an end of segment `e` lies along its node, in node widths from the first.
function endAt(g: Graph, e: number, up: boolean): number {
  const { W, EF, ET, EFD, ETD, pos } = g;
  const u = up ? EF[e]! : ET[e]!;
  return g.offsets && W[u]! > 0 ? pos[u]! + (up ? EFD[e]! : ETD[e]!) / W[u]! : pos[u]!;
}

// Crossings between a and b, assuming a is left of b.
function crossingsBetween(g: Graph, a: number, b: number): number {
  const { predStart, predE, succStart, succE } = g;
  let c = 0;
  for (let k = predStart[a]!; k < predStart[a + 1]!; k++) {
    const x = endAt(g, predE[k]!, true);
    for (let j = predStart[b]!; j < predStart[b + 1]!; j++) if (x > endAt(g, predE[j]!, true)) c++;
  }
  for (let k = succStart[a]!; k < succStart[a + 1]!; k++) {
    const x = endAt(g, succE[k]!, false);
    for (let j = succStart[b]!; j < succStart[b + 1]!; j++) if (x > endAt(g, succE[j]!, false)) c++;
  }
  return c;
}

// Adjacent swaps can remove crossings missed by barycenter sweeps.
function transpose(g: Graph, nodes: LNode[]): void {
  const { maxRank, layerStart, order, pos, fixed, GRP } = g;
  for (let pass = 0; pass < 8; pass++) {
    let improved = false;
    for (let r = 0; r <= maxRank; r++) {
      if (fixed[r]!) continue;
      const s = layerStart[r]!;
      for (let i = s; i + 1 < layerStart[r + 1]!; i++) {
        const a = order[i]!;
        const b = order[i + 1]!;
        if (pinOf(g, nodes, a) !== pinOf(g, nodes, b) || (GRP && GRP[a]! !== GRP[b]!)) continue;
        if (crossingsBetween(g, b, a) >= crossingsBetween(g, a, b)) continue;
        order[i] = b;
        order[i + 1] = a;
        pos[b] = i - s;
        pos[a] = i + 1 - s;
        improved = true;
      }
    }
    if (!improved) break;
  }
}

// One run of sweeps from `initial`, going down first or up first, and then, for a graph small
// enough, adjacent swaps. Leaves the best order found in `order`, and returns it and its crossings.
function explore(
  g: Graph,
  s: Search,
  initial: Int32Array,
  start: number,
  attempt: number,
  small: boolean
): [number, Int32Array] {
  const { order } = g;
  if (attempt > 0) {
    order.set(initial);
    settlePositions(g);
  }
  let found = start;
  const foundOrder = new Int32Array(initial);
  for (let i = 0, stale = 0; stale < 4 && i < MAX_SWEEPS; i++, stale++) {
    sweep(g, s, (i + attempt) % 2 === 0, i % 4 >= 2);
    const c = s.count();
    if (c < found) {
      found = c;
      foundOrder.set(order);
      stale = 0;
      if (c === 0) break;
    }
  }
  order.set(foundOrder);
  if (small && found > 0) {
    settlePositions(g);
    transpose(g, s.nodes);
    const c = s.count();
    if (c < found) {
      found = c;
      foundOrder.set(order);
    }
  }
  return [found, foundOrder];
}

// A drawing and its mirror image cross as often too. Of those two, the one that keeps more of the
// nodes in the order they were given stays in `order`.
function mirrored(g: Graph, s: Search, best: number, chosenOut: number, bestOrder: Int32Array) {
  const { maxRank, layerStart, order } = g;
  for (let r = 0; r <= maxRank; r++) order.subarray(layerStart[r], layerStart[r + 1]).reverse();
  settlePositions(g);
  if (s.count() > best || outOfOrder(g) >= chosenOut) order.set(bestOrder);
}

// Depth-first from the top so that subtrees start out contiguous.
function depthFirst(g: Graph): void {
  const { n, maxRank, RANK, ET, succStart, succE, layerStart, order } = g;
  const byRank = i32(n);
  const fill = copy(layerStart, maxRank + 1);
  for (let i = 0; i < n; i++) byRank[fill[RANK[i]!]!++] = i;
  for (let r = 0; r <= maxRank; r++) fill[r] = layerStart[r]!;
  const visited = u8(n);
  const stack: number[] = [];
  for (let k = 0; k < n; k++) {
    if (visited[byRank[k]!]!) continue;
    stack.push(byRank[k]!);
    while (stack.length > 0) {
      const v = stack.pop()!;
      if (visited[v]!) continue;
      visited[v] = 1;
      order[fill[RANK[v]!]!++] = v;
      for (let j = succStart[v + 1]! - 1; j >= succStart[v]!; j--) {
        const w = ET[succE[j]!]!;
        if (!visited[w]!) stack.push(w);
      }
    }
  }
}

// Puts the pinned nodes of each rank after those that are not, keeping the order otherwise.
function pinOrder(g: Graph, nodes: LNode[]): void {
  const { real, maxRank, layerStart, order } = g;
  let pinned = false;
  for (let i = 0; i < real; i++) if (nodes[i]!.pin !== 0) pinned = true;
  if (!pinned) return;
  for (let r = 0; r <= maxRank; r++) {
    const layer = [...order.subarray(layerStart[r], layerStart[r + 1])];
    const index = new Map<number, number>();
    layer.forEach((v, i) => index.set(v, i));
    layer.sort((a, b) => pinOf(g, nodes, a) - pinOf(g, nodes, b) || index.get(a)! - index.get(b)!);
    order.set(layer, layerStart[r]);
  }
}

// The order that the sweeps start from: depth-first, then by the key of each node where every
// node of a rank has one, then with pinned nodes last, and with border ports in the order of
// where their edges lead.
export function initialOrder(g: Graph, nodes: LNode[]): void {
  const { real, maxRank, layerStart, order, KEY, fixed } = g;
  depthFirst(g);
  const sortRank = (r: number, key: (v: number) => number): boolean =>
    sortLayer(order, layerStart[r]!, layerStart[r + 1]!, key);
  for (let r = 0; r <= maxRank; r++) sortRank(r, (v) => KEY[v]!);
  pinOrder(g, nodes);
  // Preserve port order to avoid crossings outside the group.
  const hint = (v: number): number =>
    v < real && (nodes[v]!.kind === Kind.StartPort || nodes[v]!.kind === Kind.EndPort)
      ? nodes[v]!.hint
      : NaN;
  for (const r of [0, maxRank]) if (sortRank(r, hint)) fixed[r] = 1;
}

// Returns [final crossings, crossings before grouping or reordering].
export function reduceCrossings(g: Graph, nodes: LNode[]): [number, number] {
  const { n, real, maxRank, layerStart, order, fixed, GRP } = g;
  let widest = 0;
  for (let r = 0; r <= maxRank; r++) widest = Math.max(widest, layerStart[r + 1]! - layerStart[r]!);
  if (widest < 2) return [0, 0];
  const s = searchOf(g, nodes, widest);
  const declared = s.count();
  if (GRP) {
    const at = f64(n);
    for (let r = 0; r <= maxRank; r++) {
      for (let i = layerStart[r]!; i < layerStart[r + 1]!; i++) at[order[i]!] = i - layerStart[r]!;
      s.arrange(r, at);
    }
  }
  let best = GRP ? s.count() : declared;
  if (best === 0) return [0, declared];
  const bestOrder = new Int32Array(order);
  // Require improvements over both the grouped and ungrouped starting orders.
  const start = Math.min(best, declared);
  // The sweeps are run twice from the same start, going down first and going up first. They
  // often end with as few crossings either way but a different order, and then the one that
  // keeps more of the nodes in the order they were given is the less surprising.
  // Only for graphs small enough to be read node by node: a second run costs as much as the first.
  const initial = new Int32Array(order);
  const small = n <= 600;
  let chosen: Int32Array = bestOrder;
  let chosenOut = Infinity;
  for (let attempt = 0; attempt < (small ? 2 : 1); attempt++) {
    const [found, foundOrder] = explore(g, s, initial, start, attempt, small);
    const out = small ? outOfOrder(g) : 0;
    if (attempt === 0 || found < best || (found === best && out < chosenOut)) {
      best = found;
      chosen = foundOrder;
      chosenOut = out;
    }
  }
  order.set(chosen);
  settlePositions(g);
  bestOrder.set(chosen);
  // The retained grouped order may exceed the ungrouped threshold; recount it.
  if (GRP) best = s.count();

  if (!small) return [best, declared];
  for (let i = 0; i < real; i++) if (nodes[i]!.pin !== 0) return [best, declared];
  if (chosenOut === 0 || fixed[0]! || fixed[maxRank]!) return [best, declared];
  mirrored(g, s, best, chosenOut, bestOrder);
  return [best, declared];
}
