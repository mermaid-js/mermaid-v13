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
 * set too. The `elk.*` keys, presets and passes are E4 #242's; a group's `algorithm` is not
 * applied (D174). The engine never measures: every length comes from the graph.
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
import type {
  ElkEdgeSection,
  ElkExtendedEdge,
  ElkLabel,
  ElkNode,
  LayoutOptions,
} from 'elkjs/lib/elk-api.js';
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

/** Builds the ELK graph for `graph`. Each edge sits in its ends' innermost common container. */
export function toElkGraph(graph: LayoutGraph, algorithm: ElkAlgorithm): Built {
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

  const edges = new Map<string, ElkExtendedEdge>();
  for (const index of orderNestedEdgeEnds(graph.edges, tree)) {
    const e = graph.edges[index]!;
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
          'elk.edgeLabels.placement': PLACEMENT[code],
          ...(code === 'c' ? { 'elk.edgeLabels.inline': 'true' } : {}),
        },
      });
    }
    const edge: ElkExtendedEdge = {
      id: e.id,
      sources: [e.source],
      targets: [e.target],
      ...(labels.length ? { labels } : {}),
    };
    nodes.get(findCommonAncestor(e.source, e.target, tree))!.edges!.push(edge);
    edges.set(e.id, edge);
  }
  return { root, nodes, edges, layered };
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

function readModel(graph: LayoutGraph, built: Built): LayoutModel {
  const chainOf = containers(treeOf(graph));
  const rects = new Map<string, Rect>();
  for (const [id, n] of built.nodes)
    if (id !== ROOT)
      rects.set(id, { x: n.x ?? 0, y: n.y ?? 0, width: n.width ?? 0, height: n.height ?? 0 });
  const elkRects = new Map(rects);
  const widened = widenForTitles(graph, rects, chainOf);

  const routes = new Map<string, { points: Point[]; placedByElk: boolean }>();
  for (const e of graph.edges) {
    const elk = built.edges.get(e.id)!;
    const from = elkRects.get(e.source)!;
    const to = elkRects.get(e.target)!;
    const elkPoints = (elk.sections ?? []).flatMap((s, i) =>
      sectionPoints(s).slice(i === 0 ? 0 : 1)
    );
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

  // The drawing is what it holds plus the padding: frames may have grown, and some algorithms
  // (mrtree) size the root before its groups.
  const pad = graph.diagramPadding ?? 0;
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
  const width = Math.max(built.root.width ?? 0, Math.max(0, ...xs) + pad) + dx;
  const height = Math.max(built.root.height ?? 0, Math.max(0, ...ys) + pad) + dy;
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
    const elk = built.edges.get(e.id)!;
    const { points, placedByElk } = routes.get(e.id)!;
    const placed = (kind: keyof typeof LABEL_KINDS, along: number): Point | undefined => {
      if (!e[kind]) return undefined;
      const label = elk.labels?.find((l) => l.id === `${e.id}\u0000${LABEL_KINDS[kind]}`);
      if (placedByElk && label?.x !== undefined && label.y !== undefined)
        return at({ x: label.x + (label.width ?? 0) / 2, y: label.y + (label.height ?? 0) / 2 });
      return at(pointAlong(points, along));
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

/** The layout engine for one ELK algorithm. Synchronous, as the contract is (D172). */
export function elkEngine(algorithm: ElkAlgorithm): LayoutEngine {
  return (graph) => {
    const built = toElkGraph(graph, algorithm);
    layoutSync(built.root);
    return readModel(graph, built);
  };
}
