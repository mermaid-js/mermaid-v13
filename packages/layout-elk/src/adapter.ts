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
 * Sides (D503): under ELK layered, each edge end that names a side (`LayoutEdge.sides`) gets its
 * own port on that side of its node or group, and the node `FIXED_SIDE`, so ELK places, orders
 * and routes around it; an end with no side is left to ELK. A node with `anchorY` that takes a
 * `left` or `right` end is `FIXED_POS` instead, so every end on it gets a port (a free one on
 * the flow's side): `left`/`right` ones about `anchorY`, `top`/`bottom` ones spread across the
 * side. An edge between a group and its own member gets none, as in `layered`. A group with ports
 * that is too narrow for its title is laid out again with room for it (`titleRoom`), so its ports
 * move with its sides. The other algorithms ignore ports, so they get none.
 *
 * Arrowheads (#683): where ELK ends three or more arrowheads on one side of a node closer together
 * than an arrowhead is wide, the graph is laid out again with that node's ends pinned an arrowhead
 * apart (`spread.ts`).
 *
 * Titles (#683): a run ELK routes through a group's title moves beside it (`titles.ts`).
 *
 * The group tree must be a tree: a group inside itself is refused (`checkTree`, #688), since the
 * walks up the tree would never end.
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
import { boxExit } from '@mermaid-js/core/layout/box-exit';

import type {
  ElkEdgeSection,
  ElkExtendedEdge,
  ElkLabel,
  ElkNode,
  ElkPort,
  LayoutOptions,
} from 'elkjs/lib/elk-api.js';
import { sideOf, type Rect } from './geometry.ts';
import { offHead } from './heads.ts';
import { elkConfigOf, groupOptions, rootOptions, type ElkConfig } from './options.ts';
import { findCyclicEntryNodes, findSubgraphFeedbackEdges } from './passes.ts';
import { crowdedEnds, LAST_LEG, type Pinned } from './spread.ts';
import { projectLabelOntoStraightenedRun, straightenEdgeTerminals } from './straighten.ts';
import { slideOffTitles, type SlideEdge, type SlideNode } from './titles.ts';
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
const PORT_SIDE: Record<Side, string> = {
  top: 'NORTH',
  bottom: 'SOUTH',
  left: 'WEST',
  right: 'EAST',
};

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
/** An edge end's port id: `<edge id>\u0000source` or `…target`. */
const portId = (edgeId: string, end: 'source' | 'target'): string => `${edgeId}\u0000${end}`;

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

/**
 * Refuses a group that sits inside itself. The builder walks up the group tree for every edge,
 * and on a loop those walks never end: a hang no caller can interrupt (#688).
 */
function checkTree(tree: Tree): void {
  for (const start of tree.keys()) {
    const seen = new Set<string>([start]);
    for (let at = tree.get(start); at !== undefined; at = tree.get(at)) {
      if (seen.has(at)) throw new RangeError(`layout: group '${at}' is inside itself`);
      seen.add(at);
    }
  }
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

/** The side a free end takes on a `FIXED_POS` node: out downstream, in upstream, as ELK does. */
const DOWNSTREAM: Record<Dir, Side> = { TB: 'bottom', BT: 'top', LR: 'right', RL: 'left' };
const UPSTREAM: Record<Dir, Side> = { TB: 'top', BT: 'bottom', LR: 'left', RL: 'right' };

/** Ends on a side keep this far from its corners, as `PORTS_SURROUNDING`. */
const CORNER = 12;

/**
 * Where the `i`th of `k` ports on `side` of a `width` × `height` box sits under `FIXED_POS`:
 * `top` and `bottom` ones spread across the side, `left` and `right` ones `step` apart about
 * `anchorY` (one alone on it), all clear of the corners where the box allows.
 */
function fixedAt(
  side: Side,
  [i, k]: [number, number],
  { width, height }: { width: number; height: number },
  anchorY: number,
  step: number
): Point {
  if (side === 'top' || side === 'bottom') {
    const m = Math.min(CORNER, width / 2);
    return { x: m + ((width - 2 * m) * (i + 1)) / (k + 1), y: side === 'top' ? 0 : height };
  }
  const m = Math.min(CORNER, height / 2);
  const gap = k > 1 ? Math.min(step, (height - 2 * m) / (k - 1)) : 0;
  const run = gap * (k - 1);
  const first = k > 1 ? Math.min(Math.max(anchorY - run / 2, m), height - m - run) : anchorY;
  return { x: side === 'left' ? 0 : width, y: first + gap * i };
}

/** `layered`'s refusal of an `anchorY` (core `check()`), on every node. */
function checkAnchors(graph: LayoutGraph): void {
  for (const n of graph.nodes) {
    const a = n.anchorY;
    if (a === undefined) continue;
    if (!Number.isFinite(a) || a < 0)
      throw new RangeError(
        `layout: anchorY of node '${n.id}' must be a finite number >= 0, got ${a}`
      );
    if (a > n.height) throw new RangeError(`layout: anchorY of node '${n.id}' lies below its box`);
  }
}

type End = 'source' | 'target';

/**
 * The side each edge end meets under ELK layered (none under the other algorithms, which ignore
 * ports): the named one, except on an edge between a group and its own member, which keeps
 * ELK's route as `layered` keeps its own. On a `FIXED_POS` node (one with `anchorY` and a named
 * `left` or `right` end) every end needs a port, so a free end takes the flow's side.
 */
function endSides(
  graph: LayoutGraph,
  tree: Tree,
  layered: boolean,
  flowOf: (id: string | undefined) => Dir
): { sides: [Side | undefined, Side | undefined][]; fixed: Set<string> } {
  const chainOf = containers(tree);
  const groups = new Set(graph.groups.map((g) => g.id));
  const own = (e: LayoutGraph['edges'][number]): boolean =>
    (groups.has(e.source) && chainOf(e.target).includes(e.source)) ||
    (groups.has(e.target) && chainOf(e.source).includes(e.target));
  const sides = graph.edges.map((e): [Side | undefined, Side | undefined] =>
    layered && e.sides && !own(e) ? [e.sides.source, e.sides.target] : [undefined, undefined]
  );
  const fixed = new Set<string>();
  const anchored = new Set(graph.nodes.filter((n) => n.anchorY !== undefined).map((n) => n.id));
  graph.edges.forEach((e, i) =>
    sides[i]!.forEach((side, j) => {
      const id = j === 0 ? e.source : e.target;
      if ((side === 'left' || side === 'right') && anchored.has(id)) fixed.add(id);
    })
  );
  const parent = new Map(graph.nodes.map((n) => [n.id, n.parent]));
  graph.edges.forEach((e, i) => {
    const s = sides[i]!;
    if (s[0] === undefined && fixed.has(e.source)) s[0] = DOWNSTREAM[flowOf(parent.get(e.source))];
    if (s[1] === undefined && fixed.has(e.target)) s[1] = UPSTREAM[flowOf(parent.get(e.target))];
  });
  return { sides, fixed };
}

/**
 * Gives each edge end with a side (`endSides`) its own port on that side of its node or group in
 * `nodes`, and the node `FIXED_SIDE`, or `FIXED_POS` with the ports placed by `fixedAt`. Returns
 * the ids each edge leaves from and enters in ELK, `turned` ends swapped: the port, else the node.
 */
function sidePorts(
  graph: LayoutGraph,
  nodes: Map<string, ElkNode>,
  { sides, fixed }: ReturnType<typeof endSides>,
  turned: readonly boolean[],
  pins: Pinned
): { source: string; target: string }[] {
  const onSide = new Map<ElkNode, Side[]>();
  const portFor = (index: number, end: End): string => {
    const e = graph.edges[index]!;
    // An end a first layout crowded (`crowdedEnds`): a port where that pass put it.
    const pin = pins.get(e[end])?.find((p) => p.edge === e.id && p.end === end);
    if (pin) {
      const n = nodes.get(e[end])!;
      const port: ElkPort = {
        id: portId(e.id, end),
        width: 0,
        height: 0,
        x: pin.x,
        y: pin.y,
        layoutOptions: { 'elk.port.side': PORT_SIDE[pin.side] },
      };
      (n.ports ??= []).push(port);
      n.layoutOptions = { ...n.layoutOptions, 'elk.portConstraints': 'FIXED_POS' };
      return port.id;
    }
    const side = sides[index]![end === 'source' ? 0 : 1];
    if (!side) return e[end];
    const n = nodes.get(e[end])!;
    const port: ElkPort = {
      id: portId(e.id, end),
      width: 0,
      height: 0,
      layoutOptions: { 'elk.port.side': PORT_SIDE[side] },
    };
    (n.ports ??= []).push(port);
    const list = onSide.get(n);
    if (list) list.push(side);
    else onSide.set(n, [side]);
    return port.id;
  };
  const ends = graph.edges.map((_, i) => {
    const source = portFor(i, 'source');
    const target = portFor(i, 'target');
    return turned[i] ? { source: target, target: source } : { source, target };
  });
  const shapeOf = new Map(graph.nodes.map((n) => [n.id, n]));
  for (const [n, list] of onSide) {
    const pinned = fixed.has(n.id);
    n.layoutOptions = {
      ...n.layoutOptions,
      'elk.portConstraints': pinned ? 'FIXED_POS' : 'FIXED_SIDE',
    };
    if (!pinned) continue;
    const shape = shapeOf.get(n.id)!;
    const seen = new Map<Side, number>();
    n.ports!.forEach((p, i) => {
      const side = list[i]!;
      const k = list.filter((s) => s === side).length;
      const at = seen.get(side) ?? 0;
      seen.set(side, at + 1);
      Object.assign(p, fixedAt(side, [at, k], shape, shape.anchorY!, graph.spacing.edge));
    });
  }
  return ends;
}

/** What a first layout found for the second (`elkEngine`). */
export interface Again {
  /** Room each titled group with ports needs on either side (`titleRoom`). */
  grow: ReadonlyMap<string, number>;
  /** The nodes whose ends are pinned (`crowding`). */
  pins: Pinned;
}

/** The option each algorithm reads its edge length from. */
const EDGE_LENGTH_KEY: Partial<Record<ElkAlgorithm, string>> = {
  stress: 'elk.stress.desiredEdgeLength',
  radial: 'elk.radial.radius',
};

/**
 * The edge length stress and radial need to keep nodes apart (#417). Neither reads node size or
 * `elk.spacing.nodeNode`. The length is a target between centres.
 *
 * Boxes W x H with gap s are clear on any diagonal when the distance is at least
 * hypot(W + s, H + s), and W + H + s covers that whenever s^2 is at most 2 W H (the widest plus
 * the tallest node bounds every pair). That `pitch` is enough for a node with a few neighbours.
 * A node with n neighbours puts them around a ring of that length, and the ring's n chords must
 * each be at least one pitch: 2 R sin(pi / n) is at least pitch. The highest degree in the graph sets the
 * ring, and the length is the larger of the two.
 */
function clearEdgeLength(graph: LayoutGraph): number {
  const widest = Math.max(0, ...graph.nodes.map((n) => n.width));
  const tallest = Math.max(0, ...graph.nodes.map((n) => n.height));
  const pitch = widest + tallest + graph.spacing.node;
  const degree = new Map<string, number>();
  for (const e of graph.edges) {
    for (const end of [e.source, e.target]) degree.set(end, (degree.get(end) ?? 0) + 1);
  }
  const most = Math.max(0, ...degree.values());
  // Up to two neighbours sit opposite each other, and up to six fit on a ring of one pitch.
  return most > 2 ? Math.max(pitch, pitch / (2 * Math.sin(Math.PI / most))) : pitch;
}

/** The option each algorithm reads its edge length from, set to `length`. */
function edgeLengthOptions(algorithm: ElkAlgorithm, length: number): LayoutOptions {
  const key = EDGE_LENGTH_KEY[algorithm];
  return key === undefined ? {} : { [key]: String(length) };
}

const FIRST_PASS: Again = { grow: new Map(), pins: new Map() };

/**
 * Builds the ELK graph for `graph` with the `elk` config section `elk` (none: every key unset,
 * the `default` preset). Each edge sits in its ends' innermost common container. A second pass
 * gets what the first found (`again`).
 */
export function toElkGraph(
  graph: LayoutGraph,
  algorithm: ElkAlgorithm,
  elk: ElkConfig = {},
  { grow, pins }: Again = FIRST_PASS
): Built {
  checkAnchors(graph);
  const layered = algorithm === 'layered';
  const tree = treeOf(graph);
  checkTree(tree);
  const spacing: LayoutOptions = {
    'elk.algorithm': algorithm,
    'elk.spacing.nodeNode': String(graph.spacing.node),
    'elk.layered.spacing.nodeNodeBetweenLayers': String(graph.spacing.rank),
    'elk.spacing.edgeEdge': String(graph.spacing.edge),
    // Where an edge turns between two layers, at least an arrowhead's last leg from either node
    // (#1160): ELK's default, 10, is shorter than the arrowhead.
    'elk.layered.spacing.edgeNodeBetweenLayers': String(LAST_LEG),
    ...edgeLengthOptions(algorithm, clearEdgeLength(graph)),
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
    const [above, below] = titleHeights(g);
    // Room for the title, where a first pass found the frame too narrow for it (`titleRoom`).
    const extra = grow.get(g.id) ?? 0;
    // The title sits in the top padding, or in the bottom padding (`titlePosition`). ELK layered does not keep a compound node's minimum
    // size under INCLUDE_CHILDREN, so `widenForTitles` also widens frames after layout.
    nodes.set(g.id, {
      id: g.id,
      layoutOptions: {
        ...spacing,
        'elk.direction': DIRECTION[flowOf(g.id)],
        ...(own ? { 'elk.hierarchyHandling': own } : {}),
        ...groupOptions(elk, separate(g.id)),
        ...FIXED_GROUP,
        'elk.padding': padding(top + above, right + extra, bottom + below, left + extra),
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

  // Sides (D503): what each ELK edge leaves from and enters, a port where the end names a side.
  const elkEnds = sidePorts(graph, nodes, endSides(graph, tree, layered, flowOf), flags, pins);

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
      sources: [elkEnds[index]!.source],
      targets: [elkEnds[index]!.target],
      ...(labels.length ? { labels } : {}),
    };
    nodes.get(findCommonAncestor(e.source, e.target, tree))!.edges!.push(edge);
    edges.set(e.id, edge);
  }
  return { root, nodes, edges, layered, reversed };
}

const centre = (r: Rect): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

/** Where the segment from the centre of `r` towards `to` leaves `r`. */
function border(r: Rect, to: Point): Point {
  const c = centre(r);
  const dx = to.x - c.x;
  const dy = to.y - c.y;
  if (dx === 0 && dy === 0) return { x: c.x, y: r.y + r.height };
  const t = boxExit(r.width / 2, r.height / 2, dx, dy);
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

/** The route ELK gave edge `id`, every section joined, source to target. */
function elkRoute(built: Built, id: string): Point[] {
  const points = (built.edges.get(id)!.sections ?? []).flatMap((s, i) =>
    sectionPoints(s).slice(i === 0 ? 0 : 1)
  );
  if (built.reversed.has(id)) points.reverse();
  return points;
}

/** Whether `points` is a route from the box `from` to the box `to` (either unknown: any). */
const joins = (points: readonly Point[], from?: Rect, to?: Rect): boolean =>
  points.length >= 2 && (!from || near(from, points[0]!)) && (!to || near(to, points.at(-1)!));

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
  for (const { edge, runs } of straightenEdgeTerminals(items, graph.spacing.edge)) {
    routes.get(edge.id)!.points = edge.points;
    if (edge.x === undefined || edge.y === undefined) continue;
    const moved = projectLabelOntoStraightenedRun({ x: edge.x, y: edge.y }, runs);
    if (moved) labelMoved.set(edge.id, moved);
  }
  return labelMoved;
}

/** Whether a group's title sits in its bottom padding (`titlePosition`). */
function titleLow(g: LayoutGraph['groups'][number]): boolean {
  return g.titlePosition?.startsWith('bottom') === true;
}

/** The room a group's title takes above and below its content: on the title's side. */
function titleHeights(g: LayoutGraph['groups'][number]): [above: number, below: number] {
  const height = g.title?.height ?? 0;
  return titleLow(g) ? [0, height] : [height, 0];
}

/**
 * Where a group's title is drawn: in the middle of the top padding and centred on the frame, or
 * where `titlePosition` puts it, a title at the left or right in by that side's padding.
 */
function titleCentre(g: LayoutGraph['groups'][number], r: Rect): Point {
  const { top, bottom, left, right } = g.padding;
  const { width = 0, height = 0 } = g.title ?? {};
  const low = titleLow(g);
  const drop = (low ? bottom : top) / 2 + height / 2;
  let x = r.x + r.width / 2;
  if (g.titlePosition?.endsWith('left')) x = r.x + left + width / 2;
  if (g.titlePosition?.endsWith('right')) x = r.x + r.width - right - width / 2;
  return { x, y: low ? r.y + r.height - drop : r.y + drop };
}

/** Node shapes whose top and bottom are straight, so a run end may slide along them. */
const FLAT = new Set([undefined, 'rect', 'rounded']);

/**
 * Moves each ELK-routed run that crosses a group's title beside it (`slideOffTitles`), with the
 * main label riding on it. Rewrites `routes` and `labelMoved`.
 */
function offTitles(
  graph: LayoutGraph,
  built: Built,
  rects: Map<string, Rect>,
  routes: Routes,
  labelMoved: Map<string, Point>
): void {
  if (!built.layered) return;
  const titles = graph.groups.flatMap((g) => {
    if (!g.title?.width || !g.title.height) return [];
    const c = titleCentre(g, rects.get(g.id)!);
    const [w, h] = [g.title.width / 2, g.title.height / 2];
    return [{ x1: c.x - w, y1: c.y - h, x2: c.x + w, y2: c.y + h }];
  });
  if (titles.length === 0) return;
  const nodes: SlideNode[] = graph.nodes.map((n) => {
    const r = rects.get(n.id)!;
    return {
      id: n.id,
      box: { x1: r.x, y1: r.y, x2: r.x + r.width, y2: r.y + r.height },
      flat: FLAT.has(n.shape),
    };
  });
  const edges: SlideEdge[] = graph.edges.flatMap((e) => {
    const { points, placedByElk } = routes.get(e.id)!;
    if (!placedByElk) return [];
    const c = e.label ? (labelMoved.get(e.id) ?? elkLabel(built, e.id, 'label')) : undefined;
    return [
      {
        id: e.id,
        source: e.source,
        target: e.target,
        points,
        ...(c && e.label ? { label: { ...c, ...e.label } } : {}),
      },
    ];
  });
  for (const id of slideOffTitles(edges, titles, nodes)) {
    const edge = edges.find((e) => e.id === id)!;
    routes.get(id)!.points = edge.points;
    if (edge.label) labelMoved.set(id, { x: edge.label.x, y: edge.label.y });
  }
}

/**
 * The drawing is what it holds plus the padding: frames may have grown, labels may have moved
 * with their runs, and some algorithms (mrtree) size the root before its groups. Returns the
 * shift that puts it at the padding.
 */
function extent(
  pad: number,
  root: ElkNode,
  all: readonly Rect[],
  routes: Routes
): { dx: number; dy: number; width: number; height: number } {
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

/** The sides an edge's ends meet: a named side where ELK placed the edge (D503), else the route's. */
function portsOf(
  e: LayoutGraph['edges'][number],
  placedByElk: boolean,
  rects: Map<string, Rect>,
  points: Point[]
): LayoutModelEdge['ports'] {
  const named = placedByElk ? e.sides : undefined;
  return {
    source: named?.source ?? sideOf(rects.get(e.source)!, points[0]!),
    target: named?.target ?? sideOf(rects.get(e.target)!, points[points.length - 1]!),
  };
}

/** The boxes of the main labels that moved with their runs (`labelMoved`). */
function movedLabels(graph: LayoutGraph, labelMoved: ReadonlyMap<string, Point>): Rect[] {
  return graph.edges.flatMap((e): Rect[] => {
    const c = labelMoved.get(e.id);
    return c && e.label
      ? [{ x: c.x - e.label.width / 2, y: c.y - e.label.height / 2, ...e.label }]
      : [];
  });
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
    const from = elkRects.get(e.source)!;
    const to = elkRects.get(e.target)!;
    const elkPoints = elkRoute(built, e.id);
    // Some algorithms leave an edge unrouted, or route a nested one from somewhere else: then
    // the edge runs straight between the two boxes.
    const routed = joins(elkPoints, from, to);
    const points = routed ? elkPoints : [border(from, centre(to)), border(to, centre(from))];
    extendEnd(points, 'start', widened.get(e.source), rects.get(e.source)!);
    extendEnd(points, 'end', widened.get(e.target), rects.get(e.target)!);
    routes.set(e.id, { points, placedByElk: routed && built.layered });
  }

  const labelMoved =
    elk.straightenEdges === false ? new Map<string, Point>() : straighten(graph, built, routes);
  offTitles(graph, built, rects, routes, labelMoved);

  const { dx, dy, width, height } = extent(
    graph.diagramPadding ?? 0,
    built.root,
    [...rects.values(), ...movedLabels(graph, labelMoved)],
    routes
  );
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
    groups.set(g.id, { ...c, width: r.width, height: r.height, title: at(titleCentre(g, r)) });
  }
  const edges = new Map<string, LayoutModelEdge>();
  for (const e of graph.edges) {
    const { points, placedByElk } = routes.get(e.id)!;
    const placed = (kind: keyof typeof LABEL_KINDS, along: number): Point | undefined => {
      if (!e[kind]) return undefined;
      const byElk = placedByElk
        ? ((kind === 'label' ? labelMoved.get(e.id) : undefined) ?? elkLabel(built, e.id, kind))
        : undefined;
      const c = byElk ?? pointAlong(points, along);
      return at(kind === 'label' ? offHead(points, c, (graph.headRoom ?? 0) / 2, e.heads) : c);
    };
    const model: LayoutModelEdge = {
      points: routePoints(points.map(at)),
      ports: portsOf(e, placedByElk, rects, points),
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

/**
 * Groups with ports that ELK laid out narrower than their titles, and the padding each needs on
 * either side. `widenForTitles` would grow them after layout and leave their ports behind, so the
 * engine lays the graph out again with that padding (only when such a group exists).
 */
function titleRoom(graph: LayoutGraph, built: Built): Map<string, number> {
  const grow = new Map<string, number>();
  for (const g of graph.groups) {
    const n = built.nodes.get(g.id)!;
    const need = (g.title?.width ?? 0) + g.padding.left + g.padding.right - (n.width ?? 0);
    if (n.ports?.length && need > 0) grow.set(g.id, need / 2);
  }
  return grow;
}

/**
 * The nodes whose ends ELK laid out too close for their arrowheads (`crowdedEnds`), for the
 * engine to lay the graph out again with those ends pinned. Only ELK layered places ports; groups
 * and nodes that already have ports (named sides) are left as they are.
 */
function crowding(graph: LayoutGraph, built: Built): Pinned {
  if (!built.layered) return new Map();
  const skip = new Set(graph.groups.map((g) => g.id));
  const boxes = new Map<string, Rect>();
  for (const n of graph.nodes) {
    const laid = built.nodes.get(n.id)!;
    if (laid.ports?.length) skip.add(n.id);
    boxes.set(n.id, { x: laid.x ?? 0, y: laid.y ?? 0, width: n.width, height: n.height });
  }
  const routes = new Map<string, Point[]>();
  for (const e of graph.edges) {
    const points = elkRoute(built, e.id);
    if (joins(points, boxes.get(e.source), boxes.get(e.target))) routes.set(e.id, points);
  }
  return crowdedEnds(graph.edges, boxes, routes, skip);
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
    let built = toElkGraph(graph, algorithm, elk);
    try {
      layoutSync(built.root);
    } catch (e) {
      // ELK: "The given graph is not a tree!" (no root at the top level, e.g. every node in a group).
      if (algorithm !== 'radial' || !notATree(e)) throw e;
      return notTree();
    }
    // A second pass only when the first left a titled group with ports too narrow, or arrowheads
    // on top of each other (#683).
    const grow = titleRoom(graph, built);
    const pins = crowding(graph, built);
    if (grow.size || pins.size) {
      built = toElkGraph(graph, algorithm, elk, { grow, pins });
      layoutSync(built.root);
    }
    return readModel(graph, built, elk);
  };
}
