/**
 * Arrowheads kept apart (#683, v12 mermaid-js/mermaid#8621). ELK spreads a side's implicit ports
 * evenly between its corner margins (`PORTS_SURROUNDING`), so four edges into a one-line node
 * end 3.6px apart and their arrowheads draw on top of each other. No ELK option widens that:
 * `portAlignment` CENTER (v12's lever) still keeps 6px on a 40px side, and a node's own
 * `portsSurrounding` is not read for its ports.
 *
 * So the engine reads the first layout and finds the sides where three or more arrowheads end
 * closer together than an arrowhead is wide (`crowdedEnds`). It lays the graph out again with
 * every end on such a node a `FIXED_POS` port: the crowded side's ends an arrowhead apart, in
 * the order ELK gave them, about where ELK had them; every other end where ELK put it. Pure
 * point maths over the first layout.
 */
import type { LayoutEdge, Point, Side } from '@mermaid-js/core/layout';

/**
 * How far apart two arrowhead tips have to be for the heads not to overlap: the width of the
 * point arrowhead the default theme draws (redux, 12.78). A constant, as `headRoom` is, so the
 * layout never moves with a theme (D154). A marker the graph names (`startMarker`/`endMarker`)
 * counts with its own width when it is wider.
 */
export const ARROWHEAD_WIDTH = 12.78;

/**
 * Fewer arrowheads than this are left to ELK, as v12 leaves them: spreading every join would
 * move a great many diagrams that were not asked to change.
 */
const FEWEST_TO_SPREAD = 3;

/** A spread end stays this far from the corner, so it is on its side and not on the corner. */
const END_CLEAR = 0.5;

/** One end of an edge pinned to its node: the side, and where on the box (from its top left). */
export interface PinnedPort {
  edge: string;
  end: 'source' | 'target';
  side: Side;
  x: number;
  y: number;
}

/** Node id → a port for every edge end on the node. */
export type Pinned = ReadonlyMap<string, readonly PinnedPort[]>;

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** An end as the first layout left it: on which side, how far along it (from top or left). */
interface EndAt extends PinnedPort {
  along: number;
  /** The width of the arrowhead drawn there; 0 when none is. */
  head: number;
}

/** The side of `r` that `p` lies on (or is nearest to). */
function sideOf(r: Box, p: Point): Side {
  const d: [Side, number][] = [
    ['top', Math.abs(p.y - r.y)],
    ['bottom', Math.abs(p.y - (r.y + r.height))],
    ['left', Math.abs(p.x - r.x)],
    ['right', Math.abs(p.x - (r.x + r.width))],
  ];
  return d.reduce((best, cur) => (cur[1] < best[1] ? cur : best))[0];
}

const across = (side: Side): boolean => side === 'left' || side === 'right';

/** A point `along` a side of a `width` × `height` box, from its top left. */
function onSide(side: Side, along: number, { width, height }: Box): { x: number; y: number } {
  if (across(side)) return { x: side === 'left' ? 0 : width, y: along };
  return { x: along, y: side === 'top' ? 0 : height };
}

/**
 * The width of the head at an end. The target end of every edge is taken to carry one (the
 * graph says how much room heads take, not which edges have one, so an open link counts too:
 * spreading it costs nothing); a source end only when the edge names a start marker.
 */
function headAt(e: LayoutEdge, end: 'source' | 'target'): number {
  const marker = end === 'source' ? e.startMarker : e.endMarker;
  if (end === 'source' && !marker) return 0;
  return Math.max(ARROWHEAD_WIDTH, marker?.width ?? 0);
}

/** Whether three or more heads on these ends (sorted along the side) sit closer than one is wide. */
function crowded(ends: readonly EndAt[]): boolean {
  const heads = ends.filter((e) => e.head > 0);
  if (heads.length < FEWEST_TO_SPREAD) return false;
  const width = Math.max(...heads.map((e) => e.head));
  return heads.some((e, i) => i > 0 && e.along - heads[i - 1]!.along < width - 1e-6);
}

/**
 * The ends on one crowded side, an arrowhead apart (less where the side is too short for that),
 * in the order they had, centred where they were and kept on the side.
 */
function spread(ends: readonly EndAt[], box: Box): PinnedPort[] {
  const side = ends[0]!.side;
  const length = across(side) ? box.height : box.width;
  const width = Math.max(...ends.map((e) => e.head));
  const gap = Math.min(width, (length - 2 * END_CLEAR) / (ends.length - 1));
  const run = gap * (ends.length - 1);
  const mid = ends.reduce((sum, e) => sum + e.along, 0) / ends.length;
  const first = Math.min(Math.max(mid - run / 2, END_CLEAR), length - END_CLEAR - run);
  return ends.map((e, i) => ({
    edge: e.edge,
    end: e.end,
    side,
    ...onSide(side, first + gap * i, box),
  }));
}

/**
 * The nodes to lay out again with their ends pinned, from a first layout: the box of each node
 * (`boxes`) and the route of each edge, source to target (`routes`; an edge with none is left
 * out). A node is pinned when three or more arrowheads end on one of its sides closer together
 * than an arrowhead is wide. Groups, and nodes with ports of their own, belong in `skip`; a node
 * with a loop is never pinned.
 */
export function crowdedEnds(
  edges: readonly LayoutEdge[],
  boxes: ReadonlyMap<string, Box>,
  routes: ReadonlyMap<string, readonly Point[]>,
  skip: ReadonlySet<string>
): Map<string, PinnedPort[]> {
  // A loop is routed around its node's corner, which a port would not leave room for.
  const looped = new Set(edges.filter((e) => e.source === e.target).map((e) => e.source));
  const byNode = new Map<string, EndAt[]>();
  for (const e of edges) {
    const route = routes.get(e.id);
    if (!route || route.length < 2 || e.source === e.target) continue;
    for (const end of ['source', 'target'] as const) {
      const id = e[end];
      const box = boxes.get(id);
      if (!box || skip.has(id) || looped.has(id)) continue;
      const p = end === 'source' ? route[0]! : route.at(-1)!;
      const side = sideOf(box, p);
      const along = across(side) ? p.y - box.y : p.x - box.x;
      const list = byNode.get(id) ?? [];
      list.push({
        edge: e.id,
        end,
        side,
        ...onSide(side, along, box),
        along,
        head: headAt(e, end),
      });
      byNode.set(id, list);
    }
  }
  const pinned = new Map<string, PinnedPort[]>();
  for (const [id, ends] of byNode) {
    const box = boxes.get(id)!;
    const sides = new Map<Side, EndAt[]>();
    for (const e of ends) sides.set(e.side, [...(sides.get(e.side) ?? []), e]);
    // Sorted along the side; ends ELK put on one spot keep their edge order.
    for (const list of sides.values()) list.sort((a, b) => a.along - b.along);
    if (![...sides.values()].some(crowded)) continue;
    pinned.set(
      id,
      [...sides.values()].flatMap((list) =>
        crowded(list)
          ? spread(list, box)
          : list.map(({ edge, end, side, x, y }) => ({ edge, end, side, x, y }))
      )
    );
  }
  return pinned;
}
