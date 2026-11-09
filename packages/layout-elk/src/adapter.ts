/**
 * The ELK engine: `LayoutGraph` → ELK graph → `layoutSync` → `LayoutModel` (DESIGN §6.1), a
 * port of v12 develop's adapter (`rendering-util/layout-algorithms/elk/render.ts`).
 *
 * The graph builder (E3 #241) maps sizes, groups (padding, title, own direction), edge labels
 * and edge-end labels (D102), and spacing from `LayoutGraph.spacing`. It keeps v12's group rules:
 * a group with its own direction is laid out on its own (`SEPARATE_CHILDREN`) unless an edge
 * crosses its border, which puts it and every group up to the edge's common ancestor back in
 * the parent's layout (`INCLUDE_CHILDREN`), as v12's `configureCrossHierarchyEdges` does. Each
 * edge lives in its ends' common ancestor (`findCommonAncestor`) and edges reach ELK in v12's
 * nested order (`orderNestedEdgeEnds`). v12's fixed options (those no `elk.*` key sets) are
 * set too. The engine never measures: every length comes from the graph.
 *
 * The `elk.*` keys (E4 #242, D174) come from `ctx.config.elk` (the package's config fragment):
 * the presets and keys set ELK's options as v12's `createRootElkGraph` and
 * `buildSubgraphLayoutOptions` do (`options.ts`); `orientFeedbackEdges` hands the edges that
 * re-enter a group to ELK reversed and `keepEntryNodeOnTop` pins each recursive flow's entry to
 * the first layer (`passes.ts`); `straightenEdges` drops the port-to-channel step after layout
 * (`straighten.ts`). `elk.lineHops` changes how edges are drawn, not where they go: core draws
 * hops for every diagram (D537), and `elk.lineHops` is ELK's override of the shared key. A
 * group's `algorithm` is not applied (D174): `mermaid` warns.
 *
 * `elk.radial` needs a tree. ELK throws when no node is a root, and recurses without end (a stack
 * overflow) on a cycle under one, so the engine checks the edges first (`isEdgeTree`: no cycle, no
 * node with two parents). On a graph that is not a tree it lays the graph out with core's
 * `layered` and notes it (`takeNotes`), and the package's hook warns.
 *
 * Coordinates: every shape and edge is read in root coordinates (`elk.json.*Coords: ROOT`).
 * Only `x`, `y`, `width`, `height`, sections and labels are read back, never GWT's `$H` hash
 * counters, which differ from run to run.
 */
import type {
  Dir,
  LayoutEngine,
  LayoutGraph,
  LayoutModel,
  LayoutModelEdge,
  LayoutModelGroup,
  LayoutModelNode,
  Point,
  RoutePoint,
  Side,
} from '@mermaid-js/core/layout';
import { layered as layeredEngine } from '@mermaid-js/core/layout';
import type {
  ElkEdgeSection,
  ElkExtendedEdge,
  ElkLabel,
  ElkNode,
  LayoutOptions,
} from 'elkjs/lib/elk-api.js';
import { elkConfigOf, groupOptions, rootOptions, type ElkConfig } from './options.ts';
import { findCyclicEntryNodes, findSubgraphFeedbackEdges } from './passes.ts';
import { projectLabelOntoStraightenedRun, straightenEdgeTerminals } from './straighten.ts';
import { layoutSync } from './sync.ts';
import { ROOT, findCommonAncestor, orderNestedEdgeEnds, type Tree } from './tree.ts';

/** The ELK algorithms the package's layout names select (D171). */
export type ElkAlgorithm =
  | 'layered'
  | 'stress'
  | 'force'
  | 'mrtree'
  | 'sporeOverlap'
  | 'box'
  | 'rectpacking'
  | 'radial';

const DIRECTION: Record<Dir, string> = { TB: 'DOWN', BT: 'UP', LR: 'RIGHT', RL: 'LEFT' };

const padding = (top: number, right: number, bottom: number, left: number): string =>
  `[top=${top},left=${left},bottom=${bottom},right=${right}]`;

/**
 * Margin kept free at the ends of each side, so no port lands on a corner (v12
 * `PORTS_SURROUNDING`, 12 by measurement there: the corner is the one border point with no side
 * to leave from).
 */
const PORTS_SURROUNDING = padding(12, 12, 12, 12);

/**
 * v12's fixed root options: what no `elk.*` key or preset sets. The `layered.*` ones mean nothing
 * to the other algorithms.
 */
const FIXED_ROOT: LayoutOptions = {
  'elk.layered.unnecessaryBendpoints': 'true',
  'elk.layered.wrapping.multiEdge.improveCuts': 'true',
  'elk.layered.wrapping.multiEdge.improveWrappedEdges': 'true',
  'elk.layered.edgeRouting.selfLoopDistribution': 'EQUALLY',
  'elk.layered.mergeHierarchyEdges': 'true',
  'elk.spacing.portsSurrounding': PORTS_SURROUNDING,
};

/** v12's fixed group options (`buildSubgraphLayoutOptions`). */
const FIXED_GROUP: LayoutOptions = {
  // A node may shift so an edge can leave its port straight rather than bend at once.
  'elk.layered.nodePlacement.networkSimplex.nodeFlexibility': 'PORT_POSITION',
  'elk.spacing.portsSurrounding': PORTS_SURROUNDING,
};

/** The edge label kinds, as ELK label ids: `<edge id>\u0000c` and so on. */
const LABEL_KINDS = { label: 'c', startLabel: 's', endLabel: 'e' } as const;
const PLACEMENT = { c: 'CENTER', s: 'TAIL', e: 'HEAD' } as const;
const MARKER = { s: 'startMarker', e: 'endMarker' } as const;

interface Built {
  root: ElkNode;
  /** Only ELK layered places edge labels. */
  layered: boolean;
  nodes: Map<string, ElkNode>;
  edges: Map<string, ElkExtendedEdge>;
  /** Edges handed to ELK target first (`orientFeedbackEdges`); read back the other way round. */
  reversed: Set<string>;
}

/** Parent group of every node and group in `graph`. */
function treeOf(graph: LayoutGraph): Tree {
  const tree = new Map<string, string>();
  for (const item of [...graph.nodes, ...graph.groups])
    if (item.parent !== undefined) tree.set(item.id, item.parent);
  return tree;
}

/** Container chain of a node or group id, innermost first, ending at the root (`ROOT`). */
function containers(tree: Tree): (id: string) => string[] {
  return (id) => {
    const chain: string[] = [];
    for (let p = tree.get(id); p !== undefined; p = tree.get(p)) chain.push(p);
    chain.push(ROOT);
    return chain;
  };
}

type Handling = 'SEPARATE_CHILDREN' | 'INCLUDE_CHILDREN';

/**
 * How ELK lays out each group, as v12 decides it. A group with its own direction is laid
 * out on its own. An edge whose ends sit in different groups puts every group from each end up
 * to and including their common ancestor back into its parent's layout, since a group laid out
 * on its own cannot be crossed. Groups not listed inherit their parent's handling.
 */
function hierarchyHandling(graph: LayoutGraph, tree: Tree): Map<string, Handling> {
  const handling = new Map<string, Handling>();
  for (const g of graph.groups) if (g.direction) handling.set(g.id, 'SEPARATE_CHILDREN');
  const groups = new Set(graph.groups.map((g) => g.id));
  for (const e of graph.edges) {
    if (tree.get(e.source) === tree.get(e.target)) continue;
    const ancestor = findCommonAncestor(e.source, e.target, tree);
    for (const end of [e.source, e.target]) {
      for (let id: string | undefined = end; id !== undefined; id = tree.get(id)) {
        if (groups.has(id)) handling.set(id, 'INCLUDE_CHILDREN');
        if (id === ancestor) break;
      }
    }
  }
  return handling;
}

/**
 * Builds the ELK graph for `graph` with the `elk` config section `elk` (none: every key unset,
 * the `default` preset). Each edge sits in its ends' innermost common container.
 */
export function toElkGraph(
  graph: LayoutGraph,
  algorithm: ElkAlgorithm,
  elk: ElkConfig = {}
): Built {
  const layered = algorithm === 'layered';
  const tree = treeOf(graph);
  const spacing: LayoutOptions = {
    'elk.algorithm': algorithm,
    'elk.spacing.nodeNode': String(graph.spacing.node),
    'elk.layered.spacing.nodeNodeBetweenLayers': String(graph.spacing.rank),
    'elk.spacing.edgeEdge': String(graph.spacing.edge),
  };
  const pad = graph.diagramPadding ?? 0;
  const root: ElkNode = {
    id: ROOT,
    layoutOptions: {
      ...spacing,
      'elk.direction': DIRECTION[graph.direction],
      // As v12, for every algorithm: those that cannot lay out across group borders lay out
      // each group on its own whatever this says.
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      ...rootOptions(elk),
      ...FIXED_ROOT,
      'elk.json.shapeCoords': 'ROOT',
      'elk.json.edgeCoords': 'ROOT',
      'elk.padding': padding(pad, pad, pad, pad),
    },
    children: [],
    edges: [],
  };
  const nodes = new Map<string, ElkNode>([[ROOT, root]]);
  const handling = hierarchyHandling(graph, tree);
  const byId = new Map(graph.groups.map((g) => [g.id, g]));
  // The direction a group's contents run in: its own when ELK lays it out on its own, else its
  // parent's.
  const flow = new Map<string, Dir>();
  const flowOf = (id: string | undefined): Dir => {
    if (id === undefined) return graph.direction;
    const known = flow.get(id);
    if (known) return known;
    const g = byId.get(id)!;
    const dir = handling.get(id) === 'SEPARATE_CHILDREN' ? g.direction! : flowOf(g.parent);
    flow.set(id, dir);
    return dir;
  };
  // Whether ELK lays a group out on its own: its own handling, else its parent's (the root's is
  // INCLUDE_CHILDREN).
  const separate = (id: string | undefined): boolean => {
    if (id === undefined) return false;
    const own = handling.get(id);
    return own === undefined ? separate(byId.get(id)!.parent) : own === 'SEPARATE_CHILDREN';
  };
  for (const g of graph.groups) {
    const title = g.title ?? { width: 0, height: 0 };
    const { top, right, bottom, left } = g.padding;
    const own = handling.get(g.id);
    // The title sits in the top padding. ELK layered does not keep a compound node's minimum
    // size under INCLUDE_CHILDREN, so `widenForTitles` also widens frames after layout.
    nodes.set(g.id, {
      id: g.id,
      layoutOptions: {
        ...spacing,
        'elk.direction': DIRECTION[flowOf(g.id)],
        ...(own ? { 'elk.hierarchyHandling': own } : {}),
        ...groupOptions(elk, separate(g.id)),
        ...FIXED_GROUP,
        'elk.padding': padding(top + title.height, right, bottom, left),
        ...(title.width > 0
          ? {
              'elk.nodeSize.constraints': '[MINIMUM_SIZE]',
              'elk.nodeSize.minimum': `(${title.width + left + right}, 0)`,
            }
          : {}),
      },
      children: [],
      edges: [],
    });
  }
  for (const n of graph.nodes) nodes.set(n.id, { id: n.id, width: n.width, height: n.height });
  // Children in input order: groups first (as declared), then nodes.
  for (const item of [...graph.groups, ...graph.nodes])
    nodes.get(item.parent ?? ROOT)!.children!.push(nodes.get(item.id)!);

  // keepEntryNodeOnTop (off by default): each recursive flow's entry goes in the first layer.
  if (elk.keepEntryNodeOnTop) {
    for (const id of findCyclicEntryNodes([...graph.groups, ...graph.nodes], graph.edges)) {
      const n = nodes.get(id)!;
      n.layoutOptions = { ...n.layoutOptions, 'elk.layered.layering.layerConstraint': 'FIRST' };
    }
  }

  // orientFeedbackEdges (on by default): an edge that closes a cycle only through a collapsed
  // group goes to ELK the other way round, so ELK routes it downstream, not around the group.
  const flags =
    elk.orientFeedbackEdges === false
      ? graph.edges.map(() => false)
      : findSubgraphFeedbackEdges(graph.edges, tree);
  const ends = graph.edges.map((e, i) =>
    flags[i] ? { source: e.target, target: e.source } : { source: e.source, target: e.target }
  );
  const reversed = new Set(graph.edges.filter((_, i) => flags[i]).map((e) => e.id));

  const edges = new Map<string, ElkExtendedEdge>();
  for (const index of orderNestedEdgeEnds(ends, tree)) {
    const e = graph.edges[index]!;
    const turned = flags[index]!;
    const labels: ElkLabel[] = [];
    for (const kind of ['label', 'startLabel', 'endLabel'] as const) {
      const size = e[kind];
      if (!size) continue;
      const code = LABEL_KINDS[kind];
      // An end label clears the end's marker too, which ELK does not know about (v12 pads by
      // half the marker's width all round). The centre, which is all that is read back, stays.
      const marker = code === 'c' ? undefined : e[MARKER[code]];
      const room = marker ? marker.width : 0;
      labels.push({
        id: `${e.id}\u0000${code}`,
        text: code,
        width: size.width + room,
        height: size.height + room,
        layoutOptions: {
          // A reversed edge's tail is its real target.
          'elk.edgeLabels.placement':
            turned && code !== 'c' ? PLACEMENT[code === 's' ? 'e' : 's'] : PLACEMENT[code],
          ...(code === 'c' ? { 'elk.edgeLabels.inline': 'true' } : {}),
        },
      });
    }
    const edge: ElkExtendedEdge = {
      id: e.id,
      sources: [ends[index]!.source],
      targets: [ends[index]!.target],
      ...(labels.length ? { labels } : {}),
    };
    nodes.get(findCommonAncestor(e.source, e.target, tree))!.edges!.push(edge);
    edges.set(e.id, edge);
  }
  return { root, nodes, edges, layered, reversed };
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const centre = (r: Rect): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

/** The side of `r` that `p` lies on (or is nearest to). */
function sideOf(r: Rect, p: Point): Side {
  const d: [Side, number][] = [
    ['top', Math.abs(p.y - r.y)],
    ['bottom', Math.abs(p.y - (r.y + r.height))],
    ['left', Math.abs(p.x - r.x)],
    ['right', Math.abs(p.x - (r.x + r.width))],
  ];
  return d.reduce((best, cur) => (cur[1] < best[1] ? cur : best))[0];
}

/** Where the segment from the centre of `r` towards `to` leaves `r`. */
function border(r: Rect, to: Point): Point {
  const c = centre(r);
  const dx = to.x - c.x;
  const dy = to.y - c.y;
  if (dx === 0 && dy === 0) return { x: c.x, y: r.y + r.height };
  const t = Math.min(
    dx === 0 ? Infinity : r.width / 2 / Math.abs(dx),
    dy === 0 ? Infinity : r.height / 2 / Math.abs(dy)
  );
  return { x: c.x + dx * t, y: c.y + dy * t };
}

/** The route's points, each with the axis the route runs along into it. */
function routePoints(points: Point[]): RoutePoint[] {
  const axis = (a: Point, b: Point): 'v' | 'h' =>
    Math.abs(b.y - a.y) >= Math.abs(b.x - a.x) ? 'v' : 'h';
  return points.map((p, i) => ({
    x: p.x,
    y: p.y,
    axis: axis(points[i === 0 ? 0 : i - 1]!, points[i === 0 ? 1 : i]!),
  }));
}

const sectionPoints = (s: ElkEdgeSection): Point[] => [
  s.startPoint,
  ...(s.bendPoints ?? []),
  s.endPoint,
];

/** A point `along` (0–1) the polyline `points`, by length. */
function pointAlong(points: Point[], along: number): Point {
  const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i]!.x, p.y - points[i]!.y));
  let left = lengths.reduce((a, b) => a + b, 0) * along;
  for (let i = 0; i < lengths.length; i++) {
    const len = lengths[i]!;
    if (left <= len && len > 0) {
      const a = points[i]!;
      const b = points[i + 1]!;
      return { x: a.x + ((b.x - a.x) * left) / len, y: a.y + ((b.y - a.y) * left) / len };
    }
    left -= len;
  }
  return points[points.length - 1]!;
}

const near = (r: Rect, p: Point, slack = 1): boolean =>
  p.x >= r.x - slack &&
  p.x <= r.x + r.width + slack &&
  p.y >= r.y - slack &&
  p.y <= r.y + r.height + slack;

/** Group ids, innermost first. */
function innermostFirst(graph: LayoutGraph, chainOf: (id: string) => string[]): string[] {
  return graph.groups
    .map((g) => ({ id: g.id, depth: chainOf(g.id).length }))
    .sort((a, b) => b.depth - a.depth)
    .map((g) => g.id);
}

/**
 * Widens frames narrower than their titles (or than a child frame that grew), about their
 * centres. Returns each widened group's frame before it grew.
 */
function widenForTitles(
  graph: LayoutGraph,
  rects: Map<string, Rect>,
  chainOf: (id: string) => string[]
): Map<string, Rect> {
  const before = new Map<string, Rect>();
  const children = new Map<string, string[]>();
  for (const item of [...graph.nodes, ...graph.groups])
    if (item.parent !== undefined)
      children.set(item.parent, [...(children.get(item.parent) ?? []), item.id]);
  for (const id of innermostFirst(graph, chainOf)) {
    const g = graph.groups.find((x) => x.id === id)!;
    const r = rects.get(id)!;
    const { left, right } = g.padding;
    const need = (g.title?.width ?? 0) + left + right;
    const mid = r.x + r.width / 2;
    let x0 = Math.min(r.x, mid - need / 2);
    let x1 = Math.max(r.x + r.width, mid + need / 2);
    for (const c of children.get(id) ?? []) {
      const cr = rects.get(c)!;
      x0 = Math.min(x0, cr.x - left);
      x1 = Math.max(x1, cr.x + cr.width + right);
    }
    if (x0 < r.x || x1 > r.x + r.width) {
      before.set(id, r);
      rects.set(id, { ...r, x: x0, width: x1 - x0 });
    }
  }
  return before;
}

/** Moves a route end that sat on a widened frame's old left or right side out to the new one. */
function extendEnd(points: Point[], end: 'start' | 'end', old: Rect | undefined, now: Rect): void {
  if (!old) return;
  const i = end === 'start' ? 0 : points.length - 1;
  const p = points[i]!;
  let x: number | undefined;
  if (Math.abs(p.x - old.x) < 0.5) x = now.x;
  else if (Math.abs(p.x - (old.x + old.width)) < 0.5) x = now.x + now.width;
  if (x === undefined) return;
  const stub = { x, y: p.y };
  if (end === 'start') points.unshift(stub);
  else points.push(stub);
}

/** The centre of an edge label as ELK placed it, root coordinates; undefined when it did not. */
function elkLabel(built: Built, edgeId: string, kind: keyof typeof LABEL_KINDS): Point | undefined {
  const label = built.edges
    .get(edgeId)!
    .labels?.find((l) => l.id === `${edgeId}\u0000${LABEL_KINDS[kind]}`);
  return label?.x !== undefined && label.y !== undefined
    ? { x: label.x + (label.width ?? 0) / 2, y: label.y + (label.height ?? 0) / 2 }
    : undefined;
}

type Routes = Map<string, { points: Point[]; placedByElk: boolean }>;

/**
 * straightenEdges (on by default): the step at an edge's ends goes, both ports stay. Rewrites
 * `routes`; returns where each main label ELK placed on a run that moved went with it.
 */
function straighten(graph: LayoutGraph, built: Built, routes: Routes): Map<string, Point> {
  const labelMoved = new Map<string, Point>();
  const items = graph.edges.map((e) => {
    const { points, placedByElk } = routes.get(e.id)!;
    const c = placedByElk && e.label ? elkLabel(built, e.id, 'label') : undefined;
    return { id: e.id, points, ...(c && e.label ? { ...c, label: true, ...e.label } : {}) };
  });
  for (const { edge, runs } of straightenEdgeTerminals(items)) {
    routes.get(edge.id)!.points = edge.points;
    if (edge.x === undefined || edge.y === undefined) continue;
    const moved = projectLabelOntoStraightenedRun({ x: edge.x, y: edge.y }, runs);
    if (moved) labelMoved.set(edge.id, moved);
  }
  return labelMoved;
}

/**
 * The drawing is what it holds plus the padding: frames may have grown, and some algorithms
 * (mrtree) size the root before its groups. Returns the shift that puts it at the padding.
 */
function extent(
  pad: number,
  root: ElkNode,
  rects: Map<string, Rect>,
  routes: Routes
): { dx: number; dy: number; width: number; height: number } {
  const all = [...rects.values()];
  const xs = [
    ...all.flatMap((r) => [r.x, r.x + r.width]),
    ...[...routes.values()].flatMap((r) => r.points.map((p) => p.x)),
  ];
  const ys = [
    ...all.flatMap((r) => [r.y, r.y + r.height]),
    ...[...routes.values()].flatMap((r) => r.points.map((p) => p.y)),
  ];
  const dx = pad - Math.min(pad, ...xs);
  const dy = pad - Math.min(pad, ...ys);
  return {
    dx,
    dy,
    width: Math.max(root.width ?? 0, Math.max(0, ...xs) + pad) + dx,
    height: Math.max(root.height ?? 0, Math.max(0, ...ys) + pad) + dy,
  };
}

function readModel(graph: LayoutGraph, built: Built, elk: ElkConfig): LayoutModel {
  const chainOf = containers(treeOf(graph));
  const rects = new Map<string, Rect>();
  for (const [id, n] of built.nodes)
    if (id !== ROOT)
      rects.set(id, { x: n.x ?? 0, y: n.y ?? 0, width: n.width ?? 0, height: n.height ?? 0 });
  const elkRects = new Map(rects);
  const widened = widenForTitles(graph, rects, chainOf);

  const routes: Routes = new Map();
  for (const e of graph.edges) {
    const laid = built.edges.get(e.id)!;
    const from = elkRects.get(e.source)!;
    const to = elkRects.get(e.target)!;
    const elkPoints = (laid.sections ?? []).flatMap((s, i) =>
      sectionPoints(s).slice(i === 0 ? 0 : 1)
    );
    if (built.reversed.has(e.id)) elkPoints.reverse();
    // Some algorithms leave an edge unrouted, or route a nested one from somewhere else: then
    // the edge runs straight between the two boxes.
    const routed =
      elkPoints.length >= 2 &&
      near(from, elkPoints[0]!) &&
      near(to, elkPoints[elkPoints.length - 1]!);
    const points = routed ? elkPoints : [border(from, centre(to)), border(to, centre(from))];
    extendEnd(points, 'start', widened.get(e.source), rects.get(e.source)!);
    extendEnd(points, 'end', widened.get(e.target), rects.get(e.target)!);
    routes.set(e.id, { points, placedByElk: routed && built.layered });
  }

  const labelMoved =
    elk.straightenEdges === false ? new Map<string, Point>() : straighten(graph, built, routes);

  const { dx, dy, width, height } = extent(graph.diagramPadding ?? 0, built.root, rects, routes);
  const at = (p: Point): Point => ({ x: p.x + dx, y: p.y + dy });

  const nodes = new Map<string, LayoutModelNode>();
  for (const n of graph.nodes) {
    const r = rects.get(n.id)!;
    nodes.set(n.id, { ...at(centre(r)), width: r.width, height: r.height });
  }
  const groups = new Map<string, LayoutModelGroup>();
  for (const g of graph.groups) {
    const r = rects.get(g.id)!;
    const c = at(centre(r));
    const titleY = r.y + dy + g.padding.top / 2 + (g.title?.height ?? 0) / 2;
    groups.set(g.id, { ...c, width: r.width, height: r.height, title: { x: c.x, y: titleY } });
  }
  const edges = new Map<string, LayoutModelEdge>();
  for (const e of graph.edges) {
    const { points, placedByElk } = routes.get(e.id)!;
    const placed = (kind: keyof typeof LABEL_KINDS, along: number): Point | undefined => {
      if (!e[kind]) return undefined;
      const byElk = placedByElk
        ? ((kind === 'label' ? labelMoved.get(e.id) : undefined) ?? elkLabel(built, e.id, kind))
        : undefined;
      return at(byElk ?? pointAlong(points, along));
    };
    const model: LayoutModelEdge = {
      points: routePoints(points.map(at)),
      ports: {
        source: sideOf(rects.get(e.source)!, points[0]!),
        target: sideOf(rects.get(e.target)!, points[points.length - 1]!),
      },
    };
    const label = placed('label', 0.5);
    const startLabel = placed('startLabel', 0.1);
    const endLabel = placed('endLabel', 0.9);
    if (label) model.label = label;
    if (startLabel) model.startLabel = startLabel;
    if (endLabel) model.endLabel = endLabel;
    edges.set(e.id, model);
  }
  return {
    width,
    height,
    nodes,
    edges,
    groups,
    direction: graph.direction,
  };
}

/** Something the engine did instead of what was asked, for the package's hook to warn about. */
export interface EngineNote {
  readonly code: string;
  readonly message: string;
}

// Notes by the render's config object, the one `ctx.config` the engine and the hooks share.
const notes = new WeakMap<object, EngineNote[]>();

/** The notes the engine left for the render with `config`, once. */
export function takeNotes(config: object): EngineNote[] {
  const found = notes.get(config) ?? [];
  notes.delete(config);
  return found;
}

function note(config: object | undefined, n: EngineNote): void {
  if (config === undefined) return;
  const list = notes.get(config) ?? [];
  if (!list.some((x) => x.code === n.code)) list.push(n);
  notes.set(config, list);
}

/**
 * Whether the edges form a forest: every node and group has at most one parent and following
 * parents never comes back (no cycle, self loops included). ELK's radial recurses through
 * children, so it must never see a cycle.
 */
function isEdgeTree(graph: LayoutGraph): boolean {
  const parent = new Map<string, string>();
  for (const e of graph.edges) {
    if (e.source === e.target || parent.has(e.target)) return false;
    parent.set(e.target, e.source);
  }
  for (const start of parent.keys()) {
    const seen = new Set<string>([start]);
    for (let at = parent.get(start); at !== undefined; at = parent.get(at)) {
      if (seen.has(at)) return false;
      seen.add(at);
    }
  }
  return true;
}

const notATree = (e: unknown): boolean =>
  /not a tree/i.test(
    e instanceof Error ? e.message : String((e as { message?: unknown } | null)?.message)
  );

/**
 * The layout engine for one ELK algorithm. Synchronous, as the contract is (D172). It reads the
 * `elk` section from `ctx.config` (fragment defaults merged in).
 */
export function elkEngine(algorithm: ElkAlgorithm): LayoutEngine {
  return (graph, ctx) => {
    const elk = elkConfigOf(ctx?.config);
    // v12 never had `elk.radial` as a layout name, and ELK cannot lay out a graph that is not a tree.
    const notTree = (): LayoutModel => {
      note(ctx?.config, {
        code: 'ELK_RADIAL_NOT_A_TREE',
        message:
          'elk.radial needs a tree (no cycle, one parent per node), and this graph is not one, so it is drawn with layered.',
      });
      return layeredEngine(graph);
    };
    if (algorithm === 'radial' && !isEdgeTree(graph)) return notTree();
    const built = toElkGraph(graph, algorithm, elk);
    try {
      layoutSync(built.root);
    } catch (e) {
      // ELK: "The given graph is not a tree!" (no root at the top level, e.g. every node in a group).
      if (algorithm !== 'radial' || !notATree(e)) throw e;
      return notTree();
    }
    return readModel(graph, built, elk);
  };
}
