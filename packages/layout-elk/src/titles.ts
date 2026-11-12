/**
 * Edges kept off group titles (#683, v12 mermaid-js/mermaid#8645). ELK reserves a group's title
 * band in its top padding but routes straight through it: a compound node's label is no obstacle
 * to ELK, and no option makes it one. The title is drawn centred on the frame, which is the
 * column a straight edge into a centred node takes, so the edge runs through the title's text.
 *
 * After layout, the vertical run of a route that crosses a title moves sideways to the nearest
 * free column: a neighbouring run's column (which removes the jog between them), else just
 * beside the title. The label riding on the run goes with it. A run stays where ELK put it unless
 * every one of these holds: a run that ends on a node still meets a flat side of it, clear of the
 * corners; the legs either side stay horizontal, keep their heading and are gone or longer than
 * two arrowheads; the route crosses fewer titles; no other edge's vertical run is within two
 * arrowheads of it; and nothing new is crossed, hit or covered. Pure point maths over the routes.
 */
import type { Point as P } from '@mermaid-js/core/layout';
import { ARROWHEAD_WIDTH } from './spread.ts';
import {
  axisOf,
  crossingCount,
  labelBox,
  projectLabelOntoStraightenedRun,
  segmentHitsBox,
  type Box,
} from './straighten.ts';

/**
 * How far beside the title a slid run passes: 4px, plus half an arrowhead. The node under a title
 * starts a few px below it, so the head of an edge into that node reaches up beside the title;
 * the head clears it by 4px too.
 */
export const TITLE_GAP = 4 + ARROWHEAD_WIDTH / 2;

/** The least room between a slid run and another vertical run, or a leg's length: two heads. */
const SEPARATION = ARROWHEAD_WIDTH;

/**
 * Room a run end keeps from a node's corners: more than half an arrowhead, and than the corner
 * radius of a rounded box (the themes' `radius`, 5 at most), whose corner is not flat.
 */
const CORNER = 8;

/** A node a run may end on: its box, and whether its top and bottom are straight (rect, rounded). */
export interface SlideNode {
  id: string;
  box: Box;
  flat: boolean;
}

/** An edge as the pass reads and writes it: its route and its main label's centre and size. */
export interface SlideEdge {
  id: string;
  source: string;
  target: string;
  points: P[];
  label?: { x: number; y: number; width: number; height: number };
}

/** A stretch of a route that runs straight down or up, as indices into its points. */
interface Run {
  first: number;
  last: number;
}

function verticalRuns(points: readonly P[]): Run[] {
  const runs: Run[] = [];
  let first = 0;
  for (let i = 1; i <= points.length; i++) {
    if (i < points.length && axisOf(points[i - 1]!, points[i]!) === 'v') continue;
    if (i - 1 > first) runs.push({ first, last: i - 1 });
    first = i;
  }
  return runs;
}

const hits = (route: readonly P[], box: Box): boolean =>
  route.some((p, i) => i < route.length - 1 && segmentHitsBox(p, route[i + 1]!, box));

const overlap = (a: Box, b: Box): boolean =>
  a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;

const boxOf = (label: SlideEdge['label']): Box | undefined => label && labelBox(label, label);

/** The legs either side of a run, each as its far end and the run's end it leaves from. */
function legsOf(points: readonly P[], run: Run): { far: P; near: P }[] {
  return [
    { far: points[run.first - 1], near: points[run.first]! },
    { far: points[run.last + 1], near: points[run.last]! },
  ].filter((leg): leg is { far: P; near: P } => leg.far !== undefined);
}

/**
 * Where the run at `x` may go, best first: the columns of the legs' far ends, nearest first; then
 * either side of the title, nearest first, the right side winning a tie.
 */
function columns(title: Box, x: number, neighbours: number[]): number[] {
  const reach = (to: number) => Math.abs(to - x);
  const sides = [title.x2 + TITLE_GAP, title.x1 - TITLE_GAP].sort((a, b) => {
    const d = reach(a) - reach(b);
    return Math.abs(d) <= 1 ? 0 : d;
  });
  return [...neighbours.sort((a, b) => reach(a) - reach(b)), ...sides];
}

/** How often a route and its label meet each obstacle, by a key naming the obstacle. */
type Contacts = Map<string, number>;

interface Context {
  titles: readonly Box[];
  nodes: readonly SlideNode[];
  edges: readonly SlideEdge[];
}

function contactsOf(edge: SlideEdge, route: readonly P[], label: Box | undefined, ctx: Context) {
  const contacts: Contacts = new Map();
  const add = (key: string, n: number) => {
    if (n > 0) contacts.set(key, (contacts.get(key) ?? 0) + n);
  };
  const meets = (box: Box) => hits(route, box) || (!!label && overlap(label, box));
  for (const n of ctx.nodes) add(`node:${n.id}`, Number(meets(n.box)));
  ctx.titles.forEach((t, i) => add(`title:${i}`, Number(!!label && overlap(label, t))));
  for (const other of ctx.edges) {
    if (other === edge) continue;
    const theirs = boxOf(other.label);
    add(`label:${other.id}`, Number(!!theirs && meets(theirs)));
    add(`route:${other.id}`, crossingCount([...route], other.points));
    add(`route:${other.id}`, Number(!!label && hits(other.points, label)));
  }
  return contacts;
}

const addsContact = (before: Contacts, after: Contacts): boolean =>
  [...after].some(([key, n]) => n > (before.get(key) ?? 0));

/** Whether a run end that sits on a node still meets a flat side of it at `x`. */
function endsFit(edge: SlideEdge, run: Run, last: number, x: number, ctx: Context): boolean {
  const ends = [
    ...(run.first === 0 ? [edge.source] : []),
    ...(run.last === last ? [edge.target] : []),
  ];
  return ends.every((id) => {
    const n = ctx.nodes.find((node) => node.id === id);
    return !!n && n.flat && x >= n.box.x1 + CORNER && x <= n.box.x2 - CORNER;
  });
}

/** Whether the legs stay horizontal, keep their heading and are gone or longer than `SEPARATION`. */
function legsFit(points: readonly P[], run: Run, x: number): boolean {
  return legsOf(points, run).every(({ far, near }) => {
    const length = Math.abs(x - far.x);
    const heading = Math.sign(near.x - far.x) === Math.sign(x - far.x);
    return axisOf(far, near) === 'h' && (length < 0.01 || (heading && length > SEPARATION));
  });
}

/** Whether another edge has a vertical run within `SEPARATION` of the column from `a` to `b`. */
function crowds(a: P, b: P, edge: SlideEdge, ctx: Context): boolean {
  const [top, bottom] = [Math.min(a.y, b.y), Math.max(a.y, b.y)];
  return ctx.edges.some(
    (other) =>
      other !== edge &&
      verticalRuns(other.points).some(({ first, last }) => {
        const [p, q] = [other.points[first]!, other.points[last]!];
        return (
          Math.abs(p.x - a.x) < SEPARATION &&
          Math.min(p.y, q.y) < bottom &&
          top < Math.max(p.y, q.y)
        );
      })
  );
}

const withoutRepeats = (route: P[]): P[] =>
  route.filter((p, i) => i === 0 || p.x !== route[i - 1]!.x || p.y !== route[i - 1]!.y);

/** The route and label of `edge` with its run off the title, or undefined when it cannot move. */
function slide(edge: SlideEdge, ctx: Context): { points: P[]; label?: P } | undefined {
  const { points } = edge;
  const crossed = (route: readonly P[]) => ctx.titles.filter((t) => hits(route, t)).length;
  const titlesBefore = crossed(points);
  if (titlesBefore === 0) return undefined;
  let found: { run: Run; title: Box } | undefined;
  for (const run of verticalRuns(points)) {
    const title = ctx.titles.find((t) => segmentHitsBox(points[run.first]!, points[run.last]!, t));
    if (title) {
      found = { run, title };
      break;
    }
  }
  if (!found) return undefined;
  const { run, title } = found;
  const before = contactsOf(edge, points, boxOf(edge.label), ctx);
  const neighbours = legsOf(points, run).map(({ far }) => far.x);
  for (const x of columns(title, points[run.first]!.x, neighbours)) {
    const moved = points.map((p, i) => (i >= run.first && i <= run.last ? { x, y: p.y } : p));
    const runs = [
      {
        old: { a: points[run.first]!, b: points[run.last]! },
        new: { a: moved[run.first]!, b: moved[run.last]! },
      },
    ];
    // The label goes along only when it rides on the run.
    const old = runs[0]!.old;
    const rides =
      !!edge.label &&
      Math.abs(edge.label.x - old.a.x) < 1 &&
      edge.label.y >= Math.min(old.a.y, old.b.y) &&
      edge.label.y <= Math.max(old.a.y, old.b.y);
    const centre = rides ? projectLabelOntoStraightenedRun(edge.label!, runs) : undefined;
    const label = edge.label && centre ? { ...edge.label, ...centre } : edge.label;
    const route = withoutRepeats(moved);
    if (
      endsFit(edge, run, points.length - 1, x, ctx) &&
      legsFit(points, run, x) &&
      crossed(route) < titlesBefore &&
      !crowds(runs[0]!.new.a, runs[0]!.new.b, edge, ctx) &&
      !addsContact(before, contactsOf(edge, route, boxOf(label), ctx))
    )
      return { points: route, ...(centre ? { label: centre } : {}) };
  }
  return undefined;
}

/**
 * Moves each edge's run that crosses a title (`titles`, the boxes titles are drawn in) beside it,
 * where it may (see the file comment), in edge order: each edge is judged against the others as
 * they stand by then. Writes the moved edges' `points` and label centres; returns their ids.
 */
export function slideOffTitles(
  edges: SlideEdge[],
  titles: readonly Box[],
  nodes: readonly SlideNode[]
): string[] {
  if (titles.length === 0) return [];
  const ctx: Context = { titles, nodes, edges };
  const moved: string[] = [];
  for (const edge of edges) {
    const slid = slide(edge, ctx);
    if (!slid) continue;
    edge.points = slid.points;
    if (edge.label && slid.label) edge.label = { ...edge.label, ...slid.label };
    moved.push(edge.id);
  }
  return moved;
}
